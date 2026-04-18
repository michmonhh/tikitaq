import type { Team } from '../types'
import { TEAM_ROSTERS } from '../../data/players'
import { poissonSample } from './poisson'
import { attributeSimulatedGoal } from './attributeGoal'
import type { Fixture } from './scheduler'

/**
 * Ergebnis einer Match-Simulation — strukturell kompatibel mit `MatchResult` im Saison-Store
 * (der Store denormalisiert lediglich `fixtureId`/`matchday`).
 */
export interface SimGoal {
  team: 1 | 2
  scoringTeamId: number
  playerName: string
  minute: number
  kind: 'open_play' | 'own_goal'
}

export interface SimResult {
  homeGoals: number
  awayGoals: number
  scorers: SimGoal[]
}

export interface SimContext {
  /** Letzte ≤5 Ergebnisse pro Team, 'W' | 'D' | 'L', neueste zuletzt. */
  formByTeam?: Record<number, ('W' | 'D' | 'L')[]>
}

// Kalibriert so, dass Ø ~2.8 Tore/Spiel herauskommen (wird via scripts/simulateSeason.ts geprüft).
const K = 0.028
const HOME_BONUS = 3
const XG_MIN_HOME = 0.3
const XG_MIN_AWAY = 0.25
const XG_MAX_HOME = 4.5
const XG_MAX_AWAY = 4.0

/**
 * Simuliert ein einzelnes Liga-Match.
 * Pure Funktion: gleiche Inputs (inkl. rand) → gleiches Ergebnis.
 */
export function simulateMatch(
  home: Team,
  away: Team,
  rand: () => number,
  ctx: SimContext = {},
): SimResult {
  const attackHome = home.levels.att * 0.45 + home.levels.mid * 0.30 + home.levels.def * 0.25
  const attackAway = away.levels.att * 0.45 + away.levels.mid * 0.30 + away.levels.def * 0.25
  const defenseHome = home.levels.def * 0.60 + home.levels.tw * 0.40
  const defenseAway = away.levels.def * 0.60 + away.levels.tw * 0.40

  const formHome = formDelta(ctx.formByTeam?.[home.id])
  const formAway = formDelta(ctx.formByTeam?.[away.id])

  const rawAttHome = attackHome + HOME_BONUS + formHome
  const rawAttAway = attackAway + formAway

  const xGHome = clamp(XG_MIN_HOME, XG_MAX_HOME, K * rawAttHome * ((100 - defenseAway) / 40))
  const xGAway = clamp(XG_MIN_AWAY, XG_MAX_AWAY, K * rawAttAway * ((100 - defenseHome) / 40))

  const goalsHome = poissonSample(xGHome, rand)
  const goalsAway = poissonSample(xGAway, rand)

  const scorers = buildScorers(home, away, goalsHome, goalsAway, rand)

  return { homeGoals: goalsHome, awayGoals: goalsAway, scorers }
}

function formDelta(outcomes?: ('W' | 'D' | 'L')[]): number {
  if (!outcomes || outcomes.length === 0) return 0
  let d = 0
  for (const o of outcomes) d += o === 'W' ? 2 : o === 'L' ? -2 : 0
  return clamp(-5, 5, d)
}

function clamp(lo: number, hi: number, x: number): number {
  return x < lo ? lo : x > hi ? hi : x
}

/**
 * Verteilt Tore über 1..90 (1..120 bei Verlängerung — irrelevant hier) und ordnet sie
 * Spielern per Positions-Gewichtung zu.
 */
function buildScorers(home: Team, away: Team, goalsHome: number, goalsAway: number, rand: () => number): SimGoal[] {
  const homeRoster = TEAM_ROSTERS[home.id] ?? []
  const awayRoster = TEAM_ROSTERS[away.id] ?? []
  const events: { team: 1 | 2; minute: number }[] = []

  for (let i = 0; i < goalsHome; i++) events.push({ team: 1, minute: pickMinute(rand) })
  for (let i = 0; i < goalsAway; i++) events.push({ team: 2, minute: pickMinute(rand) })
  events.sort((a, b) => a.minute - b.minute)

  const out: SimGoal[] = []
  for (const ev of events) {
    const scoring = ev.team === 1 ? homeRoster : awayRoster
    const conceding = ev.team === 1 ? awayRoster : homeRoster
    if (scoring.length === 0) continue
    const attributed = attributeSimulatedGoal(scoring, conceding, rand)
    // Bei Eigentor zählt das Tor dem angreifenden Team, aber der Schütze ist ein Gegner
    const scoringTeamId = ev.team === 1 ? home.id : away.id
    out.push({
      team: ev.team,
      scoringTeamId,
      playerName: attributed.playerName,
      minute: ev.minute,
      kind: attributed.kind,
    })
  }
  return out
}

function pickMinute(rand: () => number): number {
  // Gleichverteilt 1..90, spätere Minuten leicht häufiger (realistische Verteilung).
  const base = Math.floor(rand() * 90) + 1
  // Kleine Bias-Chance: 20% → +5..+10 Minuten (aber max 90)
  if (rand() < 0.2) return Math.min(90, base + Math.floor(rand() * 10) + 5)
  return base
}

/**
 * Convenience: simuliert alle Fixtures eines Spieltags.
 * `resolveTeam` löst Team-IDs auf (Dependency-Injection — vermeidet Coupling an data/teams.ts).
 */
export function simulateMatchday(
  fixtures: Fixture[],
  resolveTeam: (id: number) => Team | undefined,
  rand: () => number,
  ctx: SimContext = {},
): Array<{ fixture: Fixture; result: SimResult }> {
  const out: Array<{ fixture: Fixture; result: SimResult }> = []
  for (const fx of fixtures) {
    const home = resolveTeam(fx.homeId)
    const away = resolveTeam(fx.awayId)
    if (!home || !away) continue
    out.push({ fixture: fx, result: simulateMatch(home, away, rand, ctx) })
  }
  return out
}
