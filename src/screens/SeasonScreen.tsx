import { useEffect, useMemo, useState } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useAuthStore } from '../stores/authStore'
import {
  useSeasonStore,
  computeStandings,
  computeTopScorers,
  getMatchdayView,
  getUserFixtureForMatchday,
  getTotalMatchdays,
  getLeagueDef,
  type Season,
  type StandingsRow,
  type MatchResult,
  type TopScorer,
} from '../stores/seasonStore'
import { LEAGUES, getZoneForRank, type LeagueId, type LeagueDef } from '../data/leagues'
import { getTeamById, getTeamsByLeague } from '../data/teams'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { TeamCard } from '../components/TeamCard'
import type { Fixture } from '../engine/simulation/scheduler'
import styles from './SeasonScreen.module.css'

type TabId = 'table' | 'matchday' | 'results' | 'fixtures' | 'scorers' | 'team'

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'table',    label: 'Tabelle' },
  { id: 'matchday', label: 'Spieltag' },
  { id: 'results',  label: 'Ergebnisse' },
  { id: 'fixtures', label: 'Spielplan' },
  { id: 'scorers',  label: 'Torjäger' },
  { id: 'team',     label: 'Team' },
]

export function SeasonScreen() {
  const navigate = useUIStore(s => s.navigate)
  const userId = useAuthStore(s => s.user?.id)
  const { season, loading, error, hydrate, clearError } = useSeasonStore()
  const [tab, setTab] = useState<TabId>('matchday')

  useEffect(() => {
    if (userId) hydrate(userId)
  }, [userId, hydrate])

  const league = season ? getLeagueDef(season.leagueId) : null
  const yearLabel = season ? `${season.year}/${String((season.year + 1) % 100).padStart(2, '0')}` : ''

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('main-menu')}>
          &larr; Back
        </button>
        <h1 className={styles.title}>{league ? league.name : 'Saison'}</h1>
        {season && <span className={styles.seasonLabel}>{yearLabel}</span>}
      </div>

      {error && (
        <div className={styles.error} onClick={clearError}>{error}</div>
      )}

      {loading && !season ? (
        <p className={styles.muted}>Loading…</p>
      ) : !season ? (
        <SeasonSetupCard />
      ) : (
        <>
          <div className={styles.tabs}>
            {TABS.map(t => (
              <button
                key={t.id}
                className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className={styles.content}>
            {tab === 'table'    && <StandingsTab season={season} />}
            {tab === 'matchday' && <MatchdayTab season={season} />}
            {tab === 'results'  && <ResultsTab season={season} />}
            {tab === 'fixtures' && <FixturesTab season={season} />}
            {tab === 'scorers'  && <TopScorersTab season={season} />}
            {tab === 'team'     && <TeamTab season={season} />}
          </div>
        </>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
//  Setup (keine aktive Saison)
// ──────────────────────────────────────────────────────────────────

function SeasonSetupCard() {
  const userId = useAuthStore(s => s.user?.id)
  const { startSeason, loading } = useSeasonStore()
  const [pickedLeague, setPickedLeague] = useState<LeagueId>('de1')
  const [pickingTeam, setPickingTeam] = useState(false)
  const [pendingTeamId, setPendingTeamId] = useState<number | null>(null)

  const handlePickTeam = async (teamId: number) => {
    if (!userId) return
    setPendingTeamId(teamId)
    await startSeason(userId, pickedLeague, teamId)
    setPendingTeamId(null)
    setPickingTeam(false)
  }

  const leagueList = Object.values(LEAGUES)
  const leagueTeams = getTeamsByLeague(pickedLeague)

  return (
    <div className={styles.content}>
      <div className={styles.setupCard}>
        <p className={styles.setupIntro}>
          Starte eine neue Saison. Du spielst jedes Match selbst, die übrigen Partien werden automatisch simuliert.
        </p>

        <div className={styles.setupLeagues}>
          {leagueList.map(l => (
            <button
              key={l.id}
              className={`${styles.leagueOption} ${pickedLeague === l.id ? styles.leagueOptionActive : ''}`}
              disabled={!l.available}
              onClick={() => l.available && setPickedLeague(l.id)}
            >
              <span className={styles.leagueName}>{l.name}</span>
              <span className={styles.leagueStatus}>
                {l.available ? `${l.teamCount} Teams` : 'Demnächst'}
              </span>
            </button>
          ))}
        </div>

        <div className={styles.setupActions}>
          <Button
            variant="primary"
            size="lg"
            onClick={() => setPickingTeam(true)}
            disabled={loading || leagueTeams.length < 2}
          >
            Team wählen
          </Button>
        </div>
      </div>

      <Modal open={pickingTeam} onClose={() => setPickingTeam(false)} title="Dein Team">
        {pendingTeamId != null ? (
          <p className={styles.muted}>Saison wird gestartet…</p>
        ) : (
          <div>
            {leagueTeams.map(team => (
              <div key={team.id} style={{ marginBottom: 8 }}>
                <TeamCard team={team} selected={false} onClick={() => handlePickTeam(team.id)} />
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
//  Tabelle
// ──────────────────────────────────────────────────────────────────

function StandingsTab({ season }: { season: Season }) {
  const standings = useMemo(() => computeStandings(season), [season])
  const league = getLeagueDef(season.leagueId)
  const zonesUsed = useZonesUsedInTable(league, standings)

  return (
    <>
      <table className={styles.standingsTable}>
        <thead>
          <tr>
            <th className={styles.colRank}>#</th>
            <th className={styles.colTeam}>Team</th>
            <th>Sp</th>
            <th>S</th>
            <th>U</th>
            <th>N</th>
            <th>T</th>
            <th>±</th>
            <th>Pkt</th>
            <th className={styles.colForm}>Form</th>
          </tr>
        </thead>
        <tbody>
          {standings.map(row => (
            <StandingsRowView key={row.teamId} row={row} isUser={row.teamId === season.userTeamId} />
          ))}
        </tbody>
      </table>

      {zonesUsed.length > 0 && (
        <div className={styles.zonesLegend}>
          {zonesUsed.map(z => (
            <span key={z.kind} className={styles.zoneLegendItem}>
              <span className={styles.zoneLegendSwatch} style={{ background: z.color }} />
              {z.label}
            </span>
          ))}
        </div>
      )}
    </>
  )
}

function useZonesUsedInTable(league: LeagueDef, standings: StandingsRow[]) {
  return useMemo(() => {
    const seen = new Set<string>()
    const list: typeof league.zones = []
    for (const row of standings) {
      const z = getZoneForRank(league, row.rank)
      if (z && !seen.has(z.kind)) {
        seen.add(z.kind)
        list.push(z)
      }
    }
    return list
  }, [league, standings])
}

function StandingsRowView({ row, isUser }: { row: StandingsRow; isUser: boolean }) {
  const team = getTeamById(row.teamId)
  return (
    <tr className={isUser ? styles.userRow : undefined}>
      <td className={styles.colRank}>
        {row.zone && <span className={styles.zoneStrip} style={{ background: row.zone.color }} />}
        {row.rank}
      </td>
      <td className={styles.colTeam}>
        <div className={styles.teamCell}>
          {team && <img src={`/${team.shortName.toLowerCase()}.svg`} alt="" className={styles.teamLogoSmall} />}
          <span className={styles.teamNameCell}>{team?.shortName ?? '—'}</span>
        </div>
      </td>
      <td>{row.played}</td>
      <td>{row.won}</td>
      <td>{row.drawn}</td>
      <td>{row.lost}</td>
      <td>{row.goalsFor}:{row.goalsAgainst}</td>
      <td>{row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}</td>
      <td><strong>{row.points}</strong></td>
      <td className={styles.colForm}><FormDots form={row.form} /></td>
    </tr>
  )
}

function FormDots({ form }: { form: ('W' | 'D' | 'L')[] }) {
  const slots: Array<'W' | 'D' | 'L' | null> = [null, null, null, null, null]
  // neueste rechts: form.length <= 5, oldest first → fülle von links auf
  const start = slots.length - form.length
  for (let i = 0; i < form.length; i++) slots[start + i] = form[i]
  return (
    <div className={styles.formDots}>
      {slots.map((s, i) => (
        <span
          key={i}
          className={`${styles.formDot} ${s === 'W' ? styles.formW : s === 'D' ? styles.formD : s === 'L' ? styles.formL : ''}`}
        />
      ))}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
//  Aktueller Spieltag
// ──────────────────────────────────────────────────────────────────

function MatchdayTab({ season }: { season: Season }) {
  const startMatch = useUIStore(s => s.startMatch)
  const userId = useAuthStore(s => s.user?.id)
  const { simulateRemainingOfMatchday, loading } = useSeasonStore()

  const md = season.currentMatchday
  const total = getTotalMatchdays(season)
  const [viewedMd, setViewedMd] = useState(md)
  const [lastMdSeen, setLastMdSeen] = useState(md)
  if (md !== lastMdSeen) {
    setLastMdSeen(md)
    setViewedMd(md)
  }

  const view = useMemo(() => getMatchdayView(season, viewedMd), [season, viewedMd])
  const userFixture = useMemo(() => getUserFixtureForMatchday(season, viewedMd), [season, viewedMd])
  const userResult = userFixture ? season.results.find(r => r.fixtureId === userFixture.id) ?? null : null

  const isCurrent = viewedMd === md
  const isCompleted = season.status === 'completed'

  const handlePlay = () => {
    if (!userFixture) return
    startMatch({
      team1Id: userFixture.homeId,
      team2Id: userFixture.awayId,
      isVsAI: true,
      isDuel: false,
      seasonMatchId: userFixture.id,
    })
  }

  const handleSimulateRest = async () => {
    if (!userId) return
    await simulateRemainingOfMatchday(userId)
  }

  return (
    <>
      <div className={styles.matchdayHeader}>
        <div className={styles.matchdayTitle}>Spieltag {viewedMd} / {total}</div>
        <div className={styles.matchdayNav}>
          <button
            className={styles.matchdayNavBtn}
            disabled={viewedMd <= 1}
            onClick={() => setViewedMd(v => Math.max(1, v - 1))}
          >&lsaquo;</button>
          <button
            className={styles.matchdayNavBtn}
            disabled={viewedMd >= total}
            onClick={() => setViewedMd(v => Math.min(total, v + 1))}
          >&rsaquo;</button>
        </div>
      </div>

      {userFixture && isCurrent && !userResult && !isCompleted && (
        <div className={styles.userFixtureCard}>
          <div className={styles.userFixtureLabel}>Dein Spiel</div>
          <FixtureRow fixture={userFixture} result={null} userTeamId={season.userTeamId} large />
          <div className={styles.fixtureActions}>
            <Button variant="primary" size="lg" onClick={handlePlay}>Spielen</Button>
            <Button variant="ghost" onClick={handleSimulateRest} disabled={loading}>
              Simulieren (Rest)
            </Button>
          </div>
        </div>
      )}

      {userFixture && userResult && isCurrent && !isCompleted && (
        <div className={styles.userFixtureCard}>
          <div className={styles.userFixtureLabel}>Dein Spiel</div>
          <FixtureRow fixture={userFixture} result={userResult} userTeamId={season.userTeamId} large />
          <div className={styles.fixtureActions}>
            <Button variant="primary" onClick={handleSimulateRest} disabled={loading}>
              Übrige simulieren
            </Button>
          </div>
        </div>
      )}

      <div className={styles.sectionTitle}>
        {isCurrent ? 'Weitere Spiele' : 'Alle Spiele'}
      </div>
      <div className={styles.otherFixtures}>
        {view.fixtures
          .filter(f => !userFixture || f.fixture.id !== userFixture.id || !isCurrent)
          .map(({ fixture, result }) => (
            <FixtureItem
              key={fixture.id}
              fixture={fixture}
              result={result}
              userTeamId={season.userTeamId}
            />
          ))}
      </div>
    </>
  )
}

function FixtureItem({
  fixture, result, userTeamId,
}: { fixture: Fixture; result: MatchResult | null; userTeamId: number }) {
  return (
    <div className={`${styles.fixtureItem} ${result ? styles.fixtureItemPlayed : ''}`}>
      <FixtureRow fixture={fixture} result={result} userTeamId={userTeamId} />
    </div>
  )
}

function FixtureRow({
  fixture, result, userTeamId, large,
}: {
  fixture: Fixture
  result: MatchResult | null
  userTeamId: number
  large?: boolean
}) {
  const home = getTeamById(fixture.homeId)
  const away = getTeamById(fixture.awayId)
  const homeIsUser = fixture.homeId === userTeamId
  const awayIsUser = fixture.awayId === userTeamId

  const logoClass = large ? styles.fixtureLogo : styles.teamLogoSmall
  const nameClass = large ? styles.fixtureTeamName : styles.teamNameCell

  return (
    <div className={styles.fixtureRow}>
      <div className={styles.fixtureSide}>
        {home && <img src={`/${home.shortName.toLowerCase()}.svg`} alt="" className={logoClass} />}
        <span
          className={nameClass}
          style={homeIsUser ? { color: 'var(--accent, #4caf50)' } : undefined}
        >
          {large ? (home?.name ?? '—') : (home?.shortName ?? '—')}
        </span>
      </div>
      <div className={`${styles.fixtureScore} ${result ? '' : styles.fixtureScorePending}`}>
        {result ? `${result.homeGoals} : ${result.awayGoals}` : '– : –'}
      </div>
      <div className={`${styles.fixtureSide} ${styles.fixtureSideRight}`}>
        <span
          className={nameClass}
          style={awayIsUser ? { color: 'var(--accent, #4caf50)' } : undefined}
        >
          {large ? (away?.name ?? '—') : (away?.shortName ?? '—')}
        </span>
        {away && <img src={`/${away.shortName.toLowerCase()}.svg`} alt="" className={logoClass} />}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
//  Ergebnisse (vergangene Spieltage, chronologisch neueste zuerst)
// ──────────────────────────────────────────────────────────────────

function ResultsTab({ season }: { season: Season }) {
  const playedMatchdays = useMemo(() => {
    const mds = new Set(season.results.map(r => r.matchday))
    return [...mds].sort((a, b) => b - a)
  }, [season.results])

  if (playedMatchdays.length === 0) {
    return <p className={styles.muted}>Noch keine Ergebnisse.</p>
  }

  return (
    <>
      {playedMatchdays.map(md => {
        const view = getMatchdayView(season, md)
        return (
          <div key={md} className={styles.matchdayGroup}>
            <div className={styles.matchdayGroupTitle}>Spieltag {md}</div>
            <div className={styles.otherFixtures}>
              {view.fixtures.map(({ fixture, result }) => (
                <FixtureItem
                  key={fixture.id}
                  fixture={fixture}
                  result={result}
                  userTeamId={season.userTeamId}
                />
              ))}
            </div>
          </div>
        )
      })}
    </>
  )
}

// ──────────────────────────────────────────────────────────────────
//  Gesamter Spielplan
// ──────────────────────────────────────────────────────────────────

function FixturesTab({ season }: { season: Season }) {
  const total = getTotalMatchdays(season)
  const mds = Array.from({ length: total }, (_, i) => i + 1)
  return (
    <>
      {mds.map(md => {
        const view = getMatchdayView(season, md)
        const isCurrent = md === season.currentMatchday
        return (
          <div key={md} className={styles.matchdayGroup}>
            <div className={styles.matchdayGroupTitle}>
              Spieltag {md}{isCurrent ? ' · aktuell' : ''}
            </div>
            <div className={styles.otherFixtures}>
              {view.fixtures.map(({ fixture, result }) => (
                <FixtureItem
                  key={fixture.id}
                  fixture={fixture}
                  result={result}
                  userTeamId={season.userTeamId}
                />
              ))}
            </div>
          </div>
        )
      })}
    </>
  )
}

// ──────────────────────────────────────────────────────────────────
//  Torjäger
// ──────────────────────────────────────────────────────────────────

function TopScorersTab({ season }: { season: Season }) {
  const scorers = useMemo(() => computeTopScorers(season, 30), [season])
  if (scorers.length === 0) return <p className={styles.muted}>Noch keine Tore gefallen.</p>

  return (
    <div className={styles.scorersList}>
      {scorers.map((s, i) => (
        <ScorerRowView key={`${s.teamId}-${s.playerName}`} rank={i + 1} scorer={s} />
      ))}
    </div>
  )
}

function ScorerRowView({ rank, scorer }: { rank: number; scorer: TopScorer }) {
  const team = getTeamById(scorer.teamId)
  return (
    <div className={styles.scorerRow}>
      <div className={styles.scorerRank}>{rank}</div>
      <div className={styles.scorerName}>{scorer.playerName}</div>
      <div className={styles.scorerTeam}>{team?.shortName ?? '—'}</div>
      <div className={styles.scorerGoals}>{scorer.goals}</div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
//  Team
// ──────────────────────────────────────────────────────────────────

function TeamTab({ season }: { season: Season }) {
  const userId = useAuthStore(s => s.user?.id)
  const { abortSeason, loading } = useSeasonStore()
  const [confirmAbort, setConfirmAbort] = useState(false)

  const team = getTeamById(season.userTeamId)
  const standings = useMemo(() => computeStandings(season), [season])
  const myRow = standings.find(r => r.teamId === season.userTeamId)

  const handleAbort = async () => {
    if (!userId) return
    await abortSeason(userId)
    setConfirmAbort(false)
  }

  return (
    <>
      <div className={styles.teamCard}>
        <div className={styles.teamCardHeader}>
          {team && <img src={`/${team.shortName.toLowerCase()}.svg`} alt="" className={styles.teamCardLogo} />}
          <div>
            <div className={styles.teamCardName}>{team?.name ?? '—'}</div>
            <div className={styles.teamCardLabel}>Dein Verein</div>
          </div>
        </div>
        {myRow && (
          <div className={styles.teamCardStats}>
            <Stat value={String(myRow.rank)} label="Platz" />
            <Stat value={String(myRow.points)} label="Punkte" />
            <Stat value={`${myRow.goalsFor}:${myRow.goalsAgainst}`} label="Tore" />
          </div>
        )}
      </div>

      <div className={styles.dangerZone}>
        <Button variant="ghost" onClick={() => setConfirmAbort(true)} disabled={loading}>
          Saison abbrechen
        </Button>
      </div>

      <Modal open={confirmAbort} onClose={() => setConfirmAbort(false)} title="Saison abbrechen?">
        <p className={styles.muted} style={{ padding: '0 0 16px', textAlign: 'left' }}>
          Die aktuelle Saison wird beendet. Ergebnisse bleiben in der Historie.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setConfirmAbort(false)}>Zurück</Button>
          <Button variant="danger" onClick={handleAbort}>Abbrechen</Button>
        </div>
      </Modal>
    </>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className={styles.teamCardStat}>
      <div className={styles.teamCardStatValue}>{value}</div>
      <div className={styles.teamCardStatLabel}>{label}</div>
    </div>
  )
}
