/**
 * MatchPlanningScreen — Vor-Match-Aufstellung
 *
 * Zeigt beide Mannschaften in ihrer Grundformation auf einem Spielfeld.
 * Eigene Mannschaft (Team 1) am unteren Rand (verteidigt y=100), Gegner
 * (Team 2) am oberen Rand. User kann seine Formation per Overlay-Menü
 * ändern; Klick auf Spieler → Stats-Panel auf der jeweiligen Seite.
 *
 * Struktur:
 *   ┌─────────────────────────────────────────┐
 *   │  Header: Team-Namen + Formations-Bar    │
 *   ├──────────┬──────────────────┬──────────┤
 *   │  Left    │       Pitch      │  Right   │
 *   │  Bench   │     (SVG, 100×   │  Bench   │
 *   │  oder    │       100)       │  oder    │
 *   │  Stats   │                  │  Stats   │
 *   ├──────────┴──────────────────┴──────────┤
 *   │  Footer: [Back]    [PLAY]               │
 *   └─────────────────────────────────────────┘
 */

import { useMemo, useState } from 'react'
import { useUIStore } from '../stores/uiStore'
import { Button } from '../components/Button'
import { getTeamById, getTeamDefaultFormation } from '../data/teams'
import { getEffectiveRoster } from '../data/teamOverrides'
import {
  createFormationDetailed, ALL_FORMATIONS,
  type BenchEntry,
} from '../engine/formation'
import type { FormationType, PlayerData, PlayerStats } from '../engine/types'
import styles from './MatchPlanningScreen.module.css'

export function MatchPlanningScreen() {
  const { matchConfig, goBack, confirmPlanningAndStart } = useUIStore()

  // Hooks müssen vor dem Conditional-Return aufgerufen werden, sonst React-Error.
  // Beide Formationen aus MatchConfig nehmen, Default = Team-Default.
  const t1 = matchConfig?.team1Id
  const t2 = matchConfig?.team2Id
  const [formation1, setFormation1] = useState<FormationType>(
    matchConfig?.formation1 ?? (t1 !== undefined ? getTeamDefaultFormation(t1) : '4-3-3'),
  )
  const formation2: FormationType =
    matchConfig?.formation2 ?? (t2 !== undefined ? getTeamDefaultFormation(t2) : '4-3-3')

  const [selectedPlayer, setSelectedPlayer] = useState<{
    side: 1 | 2
    template: { firstName: string; lastName: string; positionLabel: string; stats: PlayerStats }
    fitness: number
    confidence: number
  } | null>(null)
  const [showFormationMenu, setShowFormationMenu] = useState(false)

  // Beim Wechsel der Formation: Selection wegklicken (Spieler könnte rausfallen)
  const handleFormationChange = (f: FormationType) => {
    setFormation1(f)
    setSelectedPlayer(null)
    setShowFormationMenu(false)
  }

  // Lineup berechnen (Starter + Bench) — re-evaluiert sich bei Formation-Change.
  const lineup = useMemo(() => {
    if (t1 === undefined || t2 === undefined) return null
    return createFormationDetailed(t1, t2, formation1, formation2)
  }, [t1, t2, formation1, formation2])

  if (!matchConfig || t1 === undefined || t2 === undefined) {
    return (
      <div className={styles.container}>
        <p>Kein Match konfiguriert.</p>
        <Button onClick={goBack}>Zurück</Button>
      </div>
    )
  }

  const team1 = getTeamById(t1)
  const team2 = getTeamById(t2)

  if (!team1 || !team2 || !lineup) {
    return (
      <div className={styles.container}>
        <p>Mannschaftsdaten nicht gefunden.</p>
        <Button onClick={goBack}>Zurück</Button>
      </div>
    )
  }

  const team1Players = lineup.starters.filter(p => p.team === 1)
  const team2Players = lineup.starters.filter(p => p.team === 2)
  const team1Bench = lineup.bench.filter(b => b.team === 1)
  const team2Bench = lineup.bench.filter(b => b.team === 2)

  const handlePlayerClick = (player: PlayerData, side: 1 | 2) => {
    // Wenn schon der gleiche Spieler ausgewählt: deselektieren (zurück zu Bench)
    if (selectedPlayer?.template.lastName === player.lastName
        && selectedPlayer?.side === side) {
      setSelectedPlayer(null)
      return
    }
    setSelectedPlayer({
      side,
      template: {
        firstName: player.firstName,
        lastName: player.lastName,
        positionLabel: player.positionLabel,
        stats: player.stats,
      },
      fitness: player.fitness,
      confidence: player.confidence,
    })
  }

  const handlePlay = () => {
    confirmPlanningAndStart(formation1, formation2)
  }

  const leftPanel = selectedPlayer?.side === 1
    ? renderStatsPanel(selectedPlayer)
    : renderBenchPanel(team1Bench, team1.color, 'Bank')

  const rightPanel = selectedPlayer?.side === 2
    ? renderStatsPanel(selectedPlayer)
    : renderBenchPanel(team2Bench, team2.color, 'Bank')

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={goBack}>← Zurück</button>
        <div className={styles.matchupHeader}>
          <span className={styles.teamNameH} style={{ color: team1.color }}>{team1.name}</span>
          <span className={styles.vs}>vs</span>
          <span className={styles.teamNameH} style={{ color: team2.color }}>{team2.name}</span>
        </div>
        <Button variant="primary" size="md" onClick={handlePlay}>
          PLAY
        </Button>
      </div>

      {/* Formations-Bar (für eigenes Team) */}
      <div className={styles.formationBar}>
        <span className={styles.formationLabel}>
          Deine Formation:
          <button
            type="button"
            className={styles.formationCurrent}
            onClick={() => setShowFormationMenu(s => !s)}
          >
            {formation1} ▼
          </button>
        </span>
        <span className={styles.opponentFormation}>
          Gegner-Formation: <strong>{formation2}</strong>
        </span>
        {showFormationMenu && (
          <div className={styles.formationMenu}>
            {ALL_FORMATIONS.map(f => (
              <button
                key={f}
                type="button"
                className={`${styles.formationBtn} ${f === formation1 ? styles.formationActive : ''}`}
                onClick={() => handleFormationChange(f)}
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Body: 3 Spalten — Left | Pitch | Right */}
      <div className={styles.body}>
        <div className={styles.sidePanel}>
          {leftPanel}
        </div>

        <div className={styles.pitchWrap}>
          <PitchView
            team1Players={team1Players}
            team2Players={team2Players}
            team1Color={team1.color}
            team2Color={team2.color}
            selectedKey={selectedPlayer
              ? `${selectedPlayer.side}-${selectedPlayer.template.lastName}`
              : null}
            onPlayerClick={handlePlayerClick}
          />
        </div>

        <div className={styles.sidePanel}>
          {rightPanel}
        </div>
      </div>
    </div>
  )
}

// ─── Pitch-View ───────────────────────────────────────────────────

interface PitchProps {
  team1Players: PlayerData[]
  team2Players: PlayerData[]
  team1Color: string
  team2Color: string
  selectedKey: string | null
  onPlayerClick: (player: PlayerData, side: 1 | 2) => void
}

function PitchView({
  team1Players, team2Players,
  team1Color, team2Color,
  selectedKey, onPlayerClick,
}: PitchProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      className={styles.pitchSvg}
    >
      {/* Spielfeld-Hintergrund */}
      <rect x={0} y={0} width={100} height={100} fill="#2d6e3a" />

      {/* Streifen für visuellen Effekt (sehr subtil) */}
      {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map(y => (
        <rect
          key={y}
          x={0}
          y={y}
          width={100}
          height={10}
          fill={y % 20 === 0 ? '#316f3d' : '#2d6a37'}
        />
      ))}

      {/* Mittellinie */}
      <line x1={0} y1={50} x2={100} y2={50} stroke="#fff" strokeWidth={0.3} />
      <circle cx={50} cy={50} r={9} fill="none" stroke="#fff" strokeWidth={0.3} />
      <circle cx={50} cy={50} r={0.6} fill="#fff" />

      {/* Strafraum oben (Team 2 verteidigt y=0) */}
      <rect x={20} y={0} width={60} height={16} fill="none" stroke="#fff" strokeWidth={0.3} />
      <rect x={36} y={0} width={28} height={6} fill="none" stroke="#fff" strokeWidth={0.3} />
      <line x1={42} y1={0} x2={58} y2={0} stroke="#fff" strokeWidth={0.6} />
      {/* Elfmeterpunkt */}
      <circle cx={50} cy={11} r={0.5} fill="#fff" />

      {/* Strafraum unten (Team 1 verteidigt y=100) */}
      <rect x={20} y={84} width={60} height={16} fill="none" stroke="#fff" strokeWidth={0.3} />
      <rect x={36} y={94} width={28} height={6} fill="none" stroke="#fff" strokeWidth={0.3} />
      <line x1={42} y1={100} x2={58} y2={100} stroke="#fff" strokeWidth={0.6} />
      <circle cx={50} cy={89} r={0.5} fill="#fff" />

      {/* Ecken-Bogen */}
      <path d="M 0 1 A 1 1 0 0 0 1 0" fill="none" stroke="#fff" strokeWidth={0.3} />
      <path d="M 99 0 A 1 1 0 0 0 100 1" fill="none" stroke="#fff" strokeWidth={0.3} />
      <path d="M 0 99 A 1 1 0 0 1 1 100" fill="none" stroke="#fff" strokeWidth={0.3} />
      <path d="M 99 100 A 1 1 0 0 1 100 99" fill="none" stroke="#fff" strokeWidth={0.3} />

      {/* Spieler */}
      {team1Players.map(p => (
        <PlayerDisc
          key={`1-${p.lastName}`}
          player={p}
          color={team1Color}
          selected={selectedKey === `1-${p.lastName}`}
          onClick={() => onPlayerClick(p, 1)}
        />
      ))}
      {team2Players.map(p => (
        <PlayerDisc
          key={`2-${p.lastName}`}
          player={p}
          color={team2Color}
          selected={selectedKey === `2-${p.lastName}`}
          onClick={() => onPlayerClick(p, 2)}
        />
      ))}
    </svg>
  )
}

interface PlayerDiscProps {
  player: PlayerData
  color: string
  selected: boolean
  onClick: () => void
}

function PlayerDisc({ player, color, selected, onClick }: PlayerDiscProps) {
  const r = 3.2
  const x = player.position.x
  const y = player.position.y
  return (
    <g
      className={styles.playerDisc}
      onClick={onClick}
      transform={`translate(${x} ${y})`}
    >
      <circle
        r={r + (selected ? 0.5 : 0)}
        fill={color}
        stroke={selected ? '#fff' : 'rgba(0,0,0,0.4)'}
        strokeWidth={selected ? 0.6 : 0.3}
      />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={2.0}
        fontWeight={700}
        fill="#fff"
        pointerEvents="none"
      >
        {player.positionLabel}
      </text>
      <text
        x={0}
        y={r + 2.0}
        textAnchor="middle"
        fontSize={1.6}
        fill="#fff"
        fontWeight={500}
        pointerEvents="none"
        style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.6)', strokeWidth: 0.3 }}
      >
        {player.lastName}
      </text>
    </g>
  )
}

// ─── Side-Panels ──────────────────────────────────────────────────

function renderStatsPanel(s: NonNullable<ReturnType<typeof useState<{
  side: 1 | 2
  template: { firstName: string; lastName: string; positionLabel: string; stats: PlayerStats }
  fitness: number
  confidence: number
}>>[0]>) {
  if (!s) return null
  const { template, fitness, confidence } = s
  const stat = (label: string, val: number, max = 100) => (
    <div className={styles.statRow} key={label}>
      <span className={styles.statLabel}>{label}</span>
      <div className={styles.statBarWrap}>
        <div className={styles.statBar} style={{ width: `${(val / max) * 100}%` }} />
      </div>
      <span className={styles.statVal}>{Math.round(val)}</span>
    </div>
  )
  return (
    <>
      <div className={styles.playerHeader}>
        <div className={styles.playerName}>
          <span className={styles.playerFirstName}>{template.firstName}</span>
          <span className={styles.playerLastName}>{template.lastName}</span>
        </div>
        <span className={styles.playerPos}>{template.positionLabel}</span>
      </div>
      <div className={styles.qualityBadge}>
        Quality {Math.round(template.stats.quality)}
      </div>
      <div className={styles.stats}>
        {stat('Pace',         template.stats.pacing)}
        {stat('Finishing',    template.stats.finishing)}
        {stat('Pässe kurz',   template.stats.shortPassing)}
        {stat('Pässe lang',   template.stats.highPassing)}
        {stat('Tackling',     template.stats.tackling)}
        {stat('Def. Radius',  template.stats.defensiveRadius)}
        {stat('Ball-Schutz',  template.stats.ballShielding)}
        {stat('Dribbling',    template.stats.dribbling)}
      </div>
      <hr className={styles.divider} />
      <div className={styles.formFitness}>
        {stat('Fitness',    fitness)}
        {stat('Selbstvertrauen', confidence)}
      </div>
    </>
  )
}

function renderBenchPanel(bench: BenchEntry[], teamColor: string, label: string) {
  // Wir zeigen Roster-Eintrag mit Name, Pos, Quality. Form/Fitness auf 100/start.
  // Aktuelle Form/Fitness gibt's erst während eines Matches — vor Start zeigen
  // wir die Quality des Spielers (aussagekräftiger Vorschau-Wert).
  return (
    <>
      <div className={styles.benchHeader}>{label}</div>
      <div className={styles.benchList}>
        {bench.length === 0 && (
          <div className={styles.benchEmpty}>(keine weiteren Spieler im Kader)</div>
        )}
        {bench.map(b => (
          <div key={`${b.team}-${b.rosterIndex}`} className={styles.benchRow}>
            <div
              className={styles.benchDisc}
              style={{ background: teamColor }}
              title={b.template.positionLabel}
            >
              {b.template.positionLabel}
            </div>
            <div className={styles.benchInfo}>
              <div className={styles.benchName}>
                {b.template.firstName.charAt(0)}. {b.template.lastName}
              </div>
              <div className={styles.benchSubline}>
                <span className={styles.benchQuality}>Q {Math.round(b.template.stats.quality)}</span>
                <span className={styles.benchFitness}>Fit 100</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// ─── Hilfsimport für Bundle (sonst wird tree-shaken)
// (getEffectiveRoster wird intern von createFormationDetailed genutzt;
// Import hier nur, damit lint nicht unused-flag setzt wenn jemand die
// Funktion später für Vorschau verwenden will.)
void getEffectiveRoster
