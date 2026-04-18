import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { TEAMS, getTeamsByLeague, getTeamById } from '../data/teams'
import { LEAGUES, getZoneForRank, type LeagueDef, type LeagueId, type LeagueZone, type ZoneKind } from '../data/leagues'
import { createRoundRobin, type Fixture } from '../engine/simulation/scheduler'
import { simulateMatch } from '../engine/simulation/simulateMatch'
import { createRng, randomSeed } from '../engine/simulation/rng'

// ════════════════════════════════════════════════════════════════
//  Typen
// ════════════════════════════════════════════════════════════════

export type SeasonStatus = 'active' | 'completed' | 'abandoned'

export type GoalKind = 'open_play' | 'penalty' | 'own_goal'

export interface GoalEntry {
  team: 1 | 2              // 1 = home, 2 = away (relativ zum Match)
  scoringTeamId: number    // tatsächliches Team, dem das Tor angerechnet wird
  playerName: string       // denormalisiert
  minute: number
  kind: GoalKind
}

export interface MatchResult {
  fixtureId: string
  matchday: number
  homeId: number
  awayId: number
  homeGoals: number
  awayGoals: number
  simulated: boolean       // false = User live gespielt
  scorers: GoalEntry[]
}

export interface Season {
  id: string
  leagueId: LeagueId
  year: number             // 2025 → "2025/26"
  userTeamId: number
  currentMatchday: number
  status: SeasonStatus
  schedule: Fixture[]
  results: MatchResult[]
}

export interface StandingsRow {
  teamId: number
  rank: number
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDiff: number
  points: number
  form: ('W' | 'D' | 'L')[]  // letzte ≤5 Spiele
  zone: LeagueZone | null
}

export interface TopScorer {
  playerName: string
  teamId: number
  goals: number
}

// ════════════════════════════════════════════════════════════════
//  DB-Row ↔ Domain
// ════════════════════════════════════════════════════════════════

interface SeasonRow {
  id: string
  user_id: string
  league_id: LeagueId
  year: number
  user_team_id: number
  current_matchday: number
  schedule: Fixture[]
  results: MatchResult[]
  status: SeasonStatus
  created_at: string
  updated_at: string
}

function rowToSeason(row: SeasonRow): Season {
  return {
    id: row.id,
    leagueId: row.league_id,
    year: row.year,
    userTeamId: row.user_team_id,
    currentMatchday: row.current_matchday,
    status: row.status,
    schedule: row.schedule ?? [],
    results: row.results ?? [],
  }
}

// ════════════════════════════════════════════════════════════════
//  Store
// ════════════════════════════════════════════════════════════════

interface SeasonStore {
  season: Season | null
  loading: boolean
  error: string | null

  hydrate: (userId: string) => Promise<void>
  startSeason: (userId: string, leagueId: LeagueId, userTeamId: number) => Promise<Season | null>
  abortSeason: (userId: string) => Promise<void>

  /** Vom MatchScreen bei full_time aufgerufen, wenn seasonMatchId gesetzt ist. */
  finishUserMatch: (userId: string, fixtureId: string, homeGoals: number, awayGoals: number, scorers: GoalEntry[]) => Promise<void>

  /** Simuliert alle noch offenen Paarungen des aktuellen Spieltags und rückt currentMatchday vor. */
  simulateRemainingOfMatchday: (userId: string) => Promise<void>

  clearError: () => void
}

export const useSeasonStore = create<SeasonStore>((set, get) => ({
  season: null,
  loading: false,
  error: null,

  hydrate: async (userId) => {
    set({ loading: true, error: null })
    const { data, error } = await supabase
      .from('seasons')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) {
      set({ loading: false, error: error.message })
      return
    }
    const row = (data?.[0] as SeasonRow | undefined) ?? null
    set({ season: row ? rowToSeason(row) : null, loading: false })
  },

  startSeason: async (userId, leagueId, userTeamId) => {
    set({ loading: true, error: null })

    const league = LEAGUES[leagueId]
    if (!league || !league.available) {
      set({ loading: false, error: 'Liga nicht verfügbar' })
      return null
    }

    const teams = getTeamsByLeague(leagueId)
    if (teams.length < 2) {
      set({ loading: false, error: 'Zu wenig Teams in dieser Liga' })
      return null
    }

    if (!teams.some(t => t.id === userTeamId)) {
      set({ loading: false, error: 'Ausgewähltes Team ist nicht in dieser Liga' })
      return null
    }

    const schedule = createRoundRobin(teams.map(t => t.id))
    const year = new Date().getFullYear()

    const { data, error } = await supabase
      .from('seasons')
      .insert({
        user_id: userId,
        league_id: leagueId,
        year,
        user_team_id: userTeamId,
        current_matchday: 1,
        schedule,
        results: [],
        status: 'active',
      })
      .select()
      .single()

    if (error || !data) {
      set({ loading: false, error: error?.message ?? 'Saison-Start fehlgeschlagen' })
      return null
    }

    const season = rowToSeason(data as SeasonRow)
    set({ season, loading: false })
    return season
  },

  abortSeason: async (userId) => {
    const { season } = get()
    if (!season) return
    const { error } = await supabase
      .from('seasons')
      .update({ status: 'abandoned' })
      .eq('id', season.id)
      .eq('user_id', userId)
    if (error) {
      set({ error: error.message })
      return
    }
    set({ season: null })
  },

  finishUserMatch: async (userId, fixtureId, homeGoals, awayGoals, scorers) => {
    const { season } = get()
    if (!season) return
    const fixture = season.schedule.find(f => f.id === fixtureId)
    if (!fixture) {
      set({ error: `Spiel ${fixtureId} nicht im Spielplan gefunden` })
      return
    }
    if (season.results.some(r => r.fixtureId === fixtureId)) return // schon gespeichert

    const result: MatchResult = {
      fixtureId,
      matchday: fixture.matchday,
      homeId: fixture.homeId,
      awayId: fixture.awayId,
      homeGoals,
      awayGoals,
      simulated: false,
      scorers,
    }
    const nextResults = [...season.results, result]
    const nextSeason = { ...season, results: nextResults }
    set({ season: nextSeason })
    await persistSeason(userId, nextSeason)
  },

  simulateRemainingOfMatchday: async (userId) => {
    const { season } = get()
    if (!season) return
    const md = season.currentMatchday
    const fixtures = season.schedule.filter(f => f.matchday === md)
    const existingIds = new Set(season.results.filter(r => r.matchday === md).map(r => r.fixtureId))
    const open = fixtures.filter(f => !existingIds.has(f.id))

    const rand = createRng(randomSeed())
    const formByTeam = computeFormMap(season)
    const newResults: MatchResult[] = []
    for (const fx of open) {
      const home = getTeamById(fx.homeId)
      const away = getTeamById(fx.awayId)
      if (!home || !away) continue
      const sim = simulateMatch(home, away, rand, { formByTeam })
      newResults.push({
        fixtureId: fx.id,
        matchday: fx.matchday,
        homeId: fx.homeId,
        awayId: fx.awayId,
        homeGoals: sim.homeGoals,
        awayGoals: sim.awayGoals,
        simulated: true,
        scorers: sim.scorers.map(s => ({
          team: s.team,
          scoringTeamId: s.scoringTeamId,
          playerName: s.playerName,
          minute: s.minute,
          kind: s.kind,
        })),
      })
    }

    // Letzter Spieltag erreicht?
    const maxMd = Math.max(...season.schedule.map(f => f.matchday))
    const isLast = md >= maxMd
    const nextMatchday = isLast ? md : md + 1
    const nextStatus: SeasonStatus = isLast ? 'completed' : 'active'

    const nextSeason: Season = {
      ...season,
      results: [...season.results, ...newResults],
      currentMatchday: nextMatchday,
      status: nextStatus,
    }
    set({ season: nextStatus === 'completed' ? nextSeason : nextSeason })
    await persistSeason(userId, nextSeason)
  },

  clearError: () => set({ error: null }),
}))

async function persistSeason(userId: string, season: Season): Promise<void> {
  const { error } = await supabase
    .from('seasons')
    .update({
      current_matchday: season.currentMatchday,
      schedule: season.schedule,
      results: season.results,
      status: season.status,
    })
    .eq('id', season.id)
    .eq('user_id', userId)
  if (error) {
    useSeasonStore.setState({ error: error.message })
  }
}

// ════════════════════════════════════════════════════════════════
//  Abgeleitete Selektoren — Tabelle, Form, Torschützen
// ════════════════════════════════════════════════════════════════

export function computeStandings(season: Season): StandingsRow[] {
  const league = LEAGUES[season.leagueId]
  const teams = getTeamsByLeague(season.leagueId)

  const rows = new Map<number, Omit<StandingsRow, 'rank' | 'zone'>>()
  for (const t of teams) {
    rows.set(t.id, {
      teamId: t.id,
      played: 0, won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0,
      form: [],
    })
  }

  // Results chronologisch → Form-Reihenfolge stabil (älteste zuerst, neueste zuletzt)
  const sorted = [...season.results].sort((a, b) => a.matchday - b.matchday)

  for (const r of sorted) {
    const home = rows.get(r.homeId)
    const away = rows.get(r.awayId)
    if (!home || !away) continue

    home.played++; away.played++
    home.goalsFor += r.homeGoals; home.goalsAgainst += r.awayGoals
    away.goalsFor += r.awayGoals; away.goalsAgainst += r.homeGoals

    if (r.homeGoals > r.awayGoals) {
      home.won++; away.lost++; home.points += 3
      pushForm(home, 'W'); pushForm(away, 'L')
    } else if (r.homeGoals < r.awayGoals) {
      away.won++; home.lost++; away.points += 3
      pushForm(home, 'L'); pushForm(away, 'W')
    } else {
      home.drawn++; away.drawn++; home.points++; away.points++
      pushForm(home, 'D'); pushForm(away, 'D')
    }
  }

  for (const row of rows.values()) row.goalDiff = row.goalsFor - row.goalsAgainst

  const arr = [...rows.values()]
  arr.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor
    const ta = getTeamById(a.teamId)?.shortName ?? ''
    const tb = getTeamById(b.teamId)?.shortName ?? ''
    return ta.localeCompare(tb)
  })

  return arr.map((row, i) => ({
    ...row,
    rank: i + 1,
    zone: getZoneForRank(league, i + 1),
  }))
}

function pushForm(row: { form: ('W' | 'D' | 'L')[] }, outcome: 'W' | 'D' | 'L'): void {
  row.form.push(outcome)
  if (row.form.length > 5) row.form.shift()
}

export function computeTopScorers(season: Season, limit = 20): TopScorer[] {
  const map = new Map<string, TopScorer>()
  for (const r of season.results) {
    for (const g of r.scorers) {
      if (g.kind === 'own_goal') continue // Eigentore zählen nicht in der Torjägerliste
      const key = `${g.scoringTeamId}|${g.playerName}`
      const entry = map.get(key)
      if (entry) {
        entry.goals++
      } else {
        map.set(key, { playerName: g.playerName, teamId: g.scoringTeamId, goals: 1 })
      }
    }
  }
  return [...map.values()]
    .sort((a, b) => b.goals - a.goals)
    .slice(0, limit)
}

/**
 * Letzte ≤5 Ergebnisse pro Team — wird in der Simulation als form-Delta verwendet.
 * Älteste zuerst, neueste zuletzt.
 */
export function computeFormMap(season: Season): Record<number, ('W' | 'D' | 'L')[]> {
  const out: Record<number, ('W' | 'D' | 'L')[]> = {}
  for (const t of TEAMS) out[t.id] = []

  const sorted = [...season.results].sort((a, b) => a.matchday - b.matchday)
  for (const r of sorted) {
    const home = out[r.homeId]
    const away = out[r.awayId]
    if (!home || !away) continue
    if (r.homeGoals > r.awayGoals) { home.push('W'); away.push('L') }
    else if (r.homeGoals < r.awayGoals) { home.push('L'); away.push('W') }
    else { home.push('D'); away.push('D') }
    if (home.length > 5) home.shift()
    if (away.length > 5) away.shift()
  }
  return out
}

export interface MatchdayView {
  matchday: number
  fixtures: Array<{ fixture: Fixture; result: MatchResult | null }>
}

export function getMatchdayView(season: Season, matchday: number): MatchdayView {
  const fixtures = season.schedule.filter(f => f.matchday === matchday)
  return {
    matchday,
    fixtures: fixtures.map(fx => ({
      fixture: fx,
      result: season.results.find(r => r.fixtureId === fx.id) ?? null,
    })),
  }
}

export function getUserFixtureForMatchday(season: Season, matchday: number): Fixture | null {
  return season.schedule.find(
    f => f.matchday === matchday && (f.homeId === season.userTeamId || f.awayId === season.userTeamId),
  ) ?? null
}

export function getTotalMatchdays(season: Season): number {
  if (season.schedule.length === 0) return 0
  return Math.max(...season.schedule.map(f => f.matchday))
}

export function getZoneLabel(kind: ZoneKind): string {
  switch (kind) {
    case 'champions': return 'CL'
    case 'europe-a': return 'EL'
    case 'europe-b': return 'ECL'
    case 'europe-c': return 'EuroQ'
    case 'promotion': return 'Auf'
    case 'promotion-playoff': return 'Rel'
    case 'relegation-playoff': return 'Rel'
    case 'relegation': return 'Ab'
    default: return ''
  }
}

export function getLeagueDef(leagueId: LeagueId): LeagueDef {
  return LEAGUES[leagueId]
}
