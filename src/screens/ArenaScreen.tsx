import { useState } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useArenaStore } from '../stores/arenaStore'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { TeamSelector } from '../components/TeamSelector'
import { getTeamById } from '../data/teams'
import { runAIMatch } from '../engine/simulation/runAIMatch'
import type { ArenaTeamStats } from '../engine/simulation/replayTypes'
import styles from './ArenaScreen.module.css'

export function ArenaScreen() {
  const navigate = useUIStore(s => s.navigate)
  const { lastResult, running, error, setRunning, setResult, setError } = useArenaStore()

  const [homeId, setHomeId] = useState(1)  // Dortmund
  const [awayId, setAwayId] = useState(0)  // München
  const [selecting, setSelecting] = useState<'home' | 'away' | null>(null)

  const home = getTeamById(homeId)
  const away = getTeamById(awayId)

  const handleSimulate = () => {
    if (running) return
    setRunning(true)
    setError(null)
    // setTimeout gibt dem Browser die Chance, das "Simuliert…"-UI zu rendern
    // bevor der synchrone Orchestrator den Main-Thread blockiert.
    setTimeout(() => {
      try {
        const result = runAIMatch(homeId, awayId, { record: true })
        setResult(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setRunning(false)
      }
    }, 30)
  }

  const sameTeam = homeId === awayId

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('main-menu')}>
          ← Back
        </button>
        <h1 className={styles.title}>Arena</h1>
      </div>

      <div className={styles.matchup}>
        <button
          className={styles.teamSlot}
          onClick={() => setSelecting('home')}
          style={{ '--tc': home?.color } as React.CSSProperties}
        >
          {home && (
            <>
              <img src={`/${home.shortName.toLowerCase()}.svg`} alt={home.name} className={styles.teamLogo} />
              <span className={styles.teamName}>{home.name}</span>
              <span className={styles.teamRole}>Home</span>
            </>
          )}
        </button>

        <div className={styles.vs}>VS</div>

        <button
          className={styles.teamSlot}
          onClick={() => setSelecting('away')}
          style={{ '--tc': away?.color } as React.CSSProperties}
        >
          {away && (
            <>
              <img src={`/${away.shortName.toLowerCase()}.svg`} alt={away.name} className={styles.teamLogo} />
              <span className={styles.teamName}>{away.name}</span>
              <span className={styles.teamRole}>Away</span>
            </>
          )}
        </button>
      </div>

      <div className={styles.actions}>
        <Button
          variant="primary"
          size="lg"
          onClick={handleSimulate}
          disabled={running || sameTeam}
        >
          {running ? 'Simuliert…' : 'Simulieren'}
        </Button>
        {lastResult?.replay && !running && (
          <Button variant="ghost" size="lg" onClick={() => navigate('replay')}>
            Replay anschauen
          </Button>
        )}
      </div>

      {sameTeam && (
        <p className={styles.muted}>Wähle zwei verschiedene Mannschaften.</p>
      )}
      {error && <div className={styles.error}>{error}</div>}

      {lastResult && !running && (
        <ResultCard
          homeId={lastResult.homeId}
          awayId={lastResult.awayId}
          score={lastResult.score}
          stats={lastResult.stats}
          scorers={lastResult.scorers}
          simDurationMs={lastResult.simDurationMs}
        />
      )}

      <Modal open={selecting != null} onClose={() => setSelecting(null)} title={selecting === 'home' ? 'Heim-Team' : 'Auswärts-Team'}>
        <TeamSelector
          selectedId={selecting === 'home' ? homeId : awayId}
          disabledId={selecting === 'home' ? awayId : homeId}
          onSelect={(teamId) => {
            if (selecting === 'home') setHomeId(teamId)
            else if (selecting === 'away') setAwayId(teamId)
            setSelecting(null)
          }}
        />
      </Modal>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────

interface ResultCardProps {
  homeId: number
  awayId: number
  score: { team1: number; team2: number }
  stats: { team1: ArenaTeamStats; team2: ArenaTeamStats }
  scorers: Array<{ team: 1 | 2; playerName: string; minute: number; kind: string }>
  simDurationMs: number
}

function ResultCard(p: ResultCardProps) {
  const home = getTeamById(p.homeId)
  const away = getTeamById(p.awayId)
  const h = p.stats.team1
  const a = p.stats.team2

  return (
    <div className={styles.resultCard}>
      <div className={styles.scoreLine}>
        <div className={styles.scoreTeam}>{home?.shortName}</div>
        <div>
          <span className={styles.scoreVal}>{p.score.team1}</span>
          <span style={{ color: 'var(--text-muted)', margin: '0 8px' }}>:</span>
          <span className={styles.scoreVal}>{p.score.team2}</span>
        </div>
        <div className={`${styles.scoreTeam} ${styles.away}`}>{away?.shortName}</div>
      </div>

      <table className={styles.statsTable}>
        <thead>
          <tr>
            <th style={{ textAlign: 'right' }}>{home?.shortName}</th>
            <th style={{ textAlign: 'center' }}></th>
            <th style={{ textAlign: 'left' }}>{away?.shortName}</th>
          </tr>
        </thead>
        <tbody>
          <StatRow label="Ballbesitz"     h={pct(h.possessionPercent)}  a={pct(a.possessionPercent)} />
          <StatRow label="Schüsse (aufs Tor)" h={`${h.shotsOnTarget + h.shotsOff} (${h.shotsOnTarget})`} a={`${a.shotsOnTarget + a.shotsOff} (${a.shotsOnTarget})`} />
          <StatRow label="xG"             h={num(h.xG, 2)}              a={num(a.xG, 2)} />
          <StatRow label="Im gegn. 16er"  h={pct(h.boxPresencePercent)} a={pct(a.boxPresencePercent)} />
          <StatRow label="Pässe"          h={`${h.passesCompleted}/${h.passesTotal}`} a={`${a.passesCompleted}/${a.passesTotal}`} />
          <StatRow label="Passquote"      h={pct(h.passAccuracy)}       a={pct(a.passAccuracy)} />
          <StatRow label="Tacklings"      h={`${h.tacklesWon}/${h.tacklesLost + h.tacklesWon}`} a={`${a.tacklesWon}/${a.tacklesLost + a.tacklesWon}`} />
          <StatRow label="Fouls"          h={String(h.fouls)}           a={String(a.fouls)} />
          <StatRow label="Karten ge/rot"  h={`${h.yellowCards}/${h.redCards}`} a={`${a.yellowCards}/${a.redCards}`} />
          <StatRow label="Eckbälle"       h={String(h.corners)}         a={String(a.corners)} />
        </tbody>
      </table>

      {p.scorers.length > 0 && (
        <div className={styles.scorersList}>
          <h4>Tore</h4>
          {p.scorers.map((g, i) => (
            <div key={i} className={styles.scorerLine}>
              <span className={styles.scorerMin}>{g.minute}′</span>
              <span>{g.team === 1 ? home?.shortName : away?.shortName} — {g.playerName}{g.kind === 'penalty' ? ' (Elfmeter)' : g.kind === 'own_goal' ? ' (Eigentor)' : ''}</span>
            </div>
          ))}
        </div>
      )}

      <div className={styles.simTime}>simuliert in {p.simDurationMs} ms</div>
    </div>
  )
}

function StatRow({ label, h, a }: { label: string; h: string; a: string }) {
  return (
    <tr>
      <td className={styles.home}>{h}</td>
      <td className={`${styles.center} ${styles.label}`}>{label}</td>
      <td className={styles.away}>{a}</td>
    </tr>
  )
}

function pct(v: number): string { return `${v.toFixed(1)}%` }
function num(v: number, digits = 1): string { return v.toFixed(digits) }
