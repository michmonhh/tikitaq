/**
 * MatchPlanningScreen — Vor-Match-Aufstellung
 *
 * Zeigt beide Mannschaften in ihrer Grundformation auf einem Spielfeld.
 * Eigene Mannschaft (Team 1) am unteren Rand (verteidigt y=100), Gegner
 * (Team 2) am oberen Rand. User kann seine Formation per Modal-Menü
 * mit visuellen Mini-Pitches ändern; Klick auf Spieler → Stats-Panel
 * auf der jeweiligen Seite. Drag & Drop tauscht Spieler zwischen Pitch
 * und Bank (oder zwei Pitch-Slots).
 *
 * Architektur:
 * - SVG zeigt nur Pitch-Linien (pointer-events:none)
 * - HTML-Discs darüber, absolute positioniert (für native HTML5 drag api)
 * - State-Modell: pro Team eine `LineupState` mit `starters[]` (length=11)
 *   und `bench[]` (length up to 9), beide listings von Roster-Indices
 * - Beim PLAY: customLineup wird in MatchConfig durchgereicht
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useUIStore } from '../stores/uiStore'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { getTeamById, getTeamDefaultFormation } from '../data/teams'
import { TEAM_ROSTERS, type PlayerTemplate } from '../data/players'
import {
  createFormationDetailed, ALL_FORMATIONS, getFormationSlots,
  type FormationSlot,
} from '../engine/formation'
import type { FormationType } from '../engine/types'
import styles from './MatchPlanningScreen.module.css'

const BENCH_MAX = 9

// ─── Typen ────────────────────────────────────────────────────────

interface LineupState {
  /** Roster-Index pro Slot der gewählten Formation. -1 = leer (Roster-Lücke). */
  starters: number[]
  /** Roster-Indices der Bank (max BENCH_MAX). Sortiert nach Quality. */
  bench: number[]
}

type DragSource =
  | { kind: 'pitch'; slotIndex: number }
  | { kind: 'bench'; benchIndex: number }

interface SelectedPlayer {
  side: 1 | 2
  template: PlayerTemplate
  fitness: number
  confidence: number
}

// ─── Hauptkomponente ──────────────────────────────────────────────

export function MatchPlanningScreen() {
  const { matchConfig, goBack, confirmPlanningAndStart } = useUIStore()

  const t1 = matchConfig?.team1Id
  const t2 = matchConfig?.team2Id

  const [formation1, setFormation1] = useState<FormationType>(
    matchConfig?.formation1 ?? (t1 !== undefined ? getTeamDefaultFormation(t1) : '4-3-3'),
  )
  const formation2: FormationType =
    matchConfig?.formation2 ?? (t2 !== undefined ? getTeamDefaultFormation(t2) : '4-3-3')

  const [selectedPlayer, setSelectedPlayer] = useState<SelectedPlayer | null>(null)
  const [showFormationMenu, setShowFormationMenu] = useState(false)

  // Formation und Lineup für Team 1 (User-controlled): das User-Override
  // lebt im State und wird durch Drag&Drop manipuliert. Team 2 wird vom
  // Coach gewählt und nicht editierbar (Read-only).
  const [lineup1, setLineup1] = useState<LineupState>({ starters: [], bench: [] })
  const [lineup2, setLineup2] = useState<LineupState>({ starters: [], bench: [] })

  // Drag-Source als ref, weil wir sie in onDrop brauchen aber dataTransfer
  // unzuverlässig ist (manche Browser geben dataTransfer-Strings nicht in
  // dragOver durch, nur in drop).
  const dragSourceRef = useRef<DragSource | null>(null)
  const [dragHover, setDragHover] = useState<{ kind: 'pitch'; slotIndex: number } | { kind: 'bench' } | null>(null)

  // Beim Wechsel der Formation: neues Lineup berechnen
  useEffect(() => {
    if (t1 === undefined || t2 === undefined) return
    const result = createFormationDetailed(t1, t2, formation1, formation2)
    const team1Bench = result.bench
      .filter(b => b.team === 1)
      .sort((a, b) => b.template.stats.quality - a.template.stats.quality)
      .slice(0, BENCH_MAX)
      .map(b => b.rosterIndex)
    const team2Bench = result.bench
      .filter(b => b.team === 2)
      .sort((a, b) => b.template.stats.quality - a.template.stats.quality)
      .slice(0, BENCH_MAX)
      .map(b => b.rosterIndex)
    setLineup1({ starters: result.starterRosterIndices1.slice(), bench: team1Bench })
    setLineup2({ starters: result.starterRosterIndices2.slice(), bench: team2Bench })
    setSelectedPlayer(null)
  }, [t1, t2, formation1, formation2])

  // Memo: Slots für jede Formation (statisch)
  const slots1 = useMemo(() => getFormationSlots(formation1), [formation1])
  const slots2 = useMemo(() => getFormationSlots(formation2), [formation2])

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
  const roster1 = TEAM_ROSTERS[t1]
  const roster2 = TEAM_ROSTERS[t2]

  if (!team1 || !team2 || !roster1 || !roster2) {
    return (
      <div className={styles.container}>
        <p>Mannschaftsdaten nicht gefunden.</p>
        <Button onClick={goBack}>Zurück</Button>
      </div>
    )
  }

  // ─── Helpers ────────────────────────────────────────────────────

  const tplFromIdx = (roster: PlayerTemplate[], idx: number): PlayerTemplate | null =>
    idx >= 0 && idx < roster.length ? roster[idx] : null

  // ─── Drag&Drop-Handler (nur für Team 1, eigenes Team) ────────

  const onDragStart = (source: DragSource) => (e: React.DragEvent) => {
    dragSourceRef.current = source
    e.dataTransfer.effectAllowed = 'move'
    // Wir setzen einen dummy-string, damit Firefox den drag akzeptiert
    e.dataTransfer.setData('text/plain', JSON.stringify(source))
  }

  const onDragOverPitch = (slotIndex: number) => (e: React.DragEvent) => {
    if (!dragSourceRef.current) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragHover({ kind: 'pitch', slotIndex })
  }

  const onDragOverBench = (e: React.DragEvent) => {
    if (!dragSourceRef.current) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragHover({ kind: 'bench' })
  }

  const onDragEnd = () => {
    dragSourceRef.current = null
    setDragHover(null)
  }

  const swapPitchSlots = (a: number, b: number) => {
    setLineup1(prev => {
      const next = { ...prev, starters: prev.starters.slice() }
      ;[next.starters[a], next.starters[b]] = [next.starters[b], next.starters[a]]
      return next
    })
  }

  const swapPitchBench = (slotIndex: number, benchIndex: number) => {
    setLineup1(prev => {
      const starters = prev.starters.slice()
      const bench = prev.bench.slice()
      const tmp = starters[slotIndex]
      starters[slotIndex] = bench[benchIndex]
      bench[benchIndex] = tmp
      return { starters, bench }
    })
  }

  const onDropPitch = (targetSlot: number) => (e: React.DragEvent) => {
    e.preventDefault()
    const src = dragSourceRef.current
    if (!src) return
    if (src.kind === 'pitch' && src.slotIndex !== targetSlot) {
      swapPitchSlots(src.slotIndex, targetSlot)
    } else if (src.kind === 'bench') {
      swapPitchBench(targetSlot, src.benchIndex)
    }
    onDragEnd()
  }

  const onDropBench = (e: React.DragEvent) => {
    e.preventDefault()
    const src = dragSourceRef.current
    if (!src) return
    if (src.kind === 'pitch') {
      // Drop auf Bench-Container ohne spezifischen Slot:
      // Tausche mit dem ersten Bench-Spieler (höchste Quality).
      if (lineup1.bench.length > 0) {
        swapPitchBench(src.slotIndex, 0)
      }
    }
    // Bench → Bench: ignorieren (keine Re-Sortierung in v1)
    onDragEnd()
  }

  // ─── Click-Handler ──────────────────────────────────────────────

  const handlePitchClick = (slotIndex: number, side: 1 | 2) => {
    const lineup = side === 1 ? lineup1 : lineup2
    const roster = side === 1 ? roster1 : roster2
    const idx = lineup.starters[slotIndex]
    const tpl = tplFromIdx(roster, idx)
    if (!tpl) return
    if (selectedPlayer?.side === side
        && selectedPlayer.template.lastName === tpl.lastName) {
      setSelectedPlayer(null)
      return
    }
    setSelectedPlayer({
      side,
      template: tpl,
      fitness: 100,
      confidence: 50,
    })
  }

  const handleBenchClick = (benchIndex: number, side: 1 | 2) => {
    const lineup = side === 1 ? lineup1 : lineup2
    const roster = side === 1 ? roster1 : roster2
    const idx = lineup.bench[benchIndex]
    const tpl = tplFromIdx(roster, idx)
    if (!tpl) return
    if (selectedPlayer?.side === side
        && selectedPlayer.template.lastName === tpl.lastName) {
      setSelectedPlayer(null)
      return
    }
    setSelectedPlayer({
      side,
      template: tpl,
      fitness: 100,
      confidence: 50,
    })
  }

  const handleFormationChange = (f: FormationType) => {
    setFormation1(f)
    setShowFormationMenu(false)
  }

  const handlePlay = () => {
    confirmPlanningAndStart(
      formation1, formation2,
      { starterRosterIndices: lineup1.starters },
      { starterRosterIndices: lineup2.starters },
    )
  }

  // ─── Render ─────────────────────────────────────────────────────

  const leftPanel = selectedPlayer?.side === 1
    ? <StatsPanel selected={selectedPlayer} />
    : <BenchPanel
        bench={lineup1.bench}
        roster={roster1}
        teamColor={team1.color}
        label={`Bank (${lineup1.bench.length}/${BENCH_MAX})`}
        draggable
        onDragStart={(idx) => onDragStart({ kind: 'bench', benchIndex: idx })}
        onDragOver={onDragOverBench}
        onDrop={onDropBench}
        onDragEnd={onDragEnd}
        onClickRow={(idx) => handleBenchClick(idx, 1)}
        dragHover={dragHover?.kind === 'bench'}
      />

  const rightPanel = selectedPlayer?.side === 2
    ? <StatsPanel selected={selectedPlayer} />
    : <BenchPanel
        bench={lineup2.bench}
        roster={roster2}
        teamColor={team2.color}
        label={`Bank (${lineup2.bench.length}/${BENCH_MAX})`}
        draggable={false}
        onClickRow={(idx) => handleBenchClick(idx, 2)}
      />

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

      {/* Formations-Bar */}
      <div className={styles.formationBar}>
        <span className={styles.formationLabel}>
          Deine Formation:
          <button
            type="button"
            className={styles.formationCurrent}
            onClick={() => setShowFormationMenu(true)}
            aria-haspopup="dialog"
          >
            {formation1} ▼
          </button>
        </span>
        <span className={styles.opponentFormation}>
          Gegner-Formation: <strong>{formation2}</strong>
        </span>
      </div>

      <Modal
        open={showFormationMenu}
        onClose={() => setShowFormationMenu(false)}
        title="Formation wählen"
      >
        <div className={styles.formationGrid}>
          {ALL_FORMATIONS.map(f => (
            <button
              key={f}
              type="button"
              className={`${styles.formationCard} ${f === formation1 ? styles.formationCardActive : ''}`}
              onClick={() => handleFormationChange(f)}
            >
              <MiniPitch
                slots={getFormationSlots(f)}
                color={team1.color}
                active={f === formation1}
              />
              <div className={styles.formationCardLabel}>
                <span className={styles.formationCardName}>{f}</span>
                <span className={styles.formationCardDesc}>
                  {FORMATION_DESCRIPTIONS[f]}
                </span>
              </div>
            </button>
          ))}
        </div>
      </Modal>

      {/* Body: 3 Spalten */}
      <div className={styles.body}>
        <div className={styles.sidePanel}>
          {leftPanel}
        </div>

        <div className={styles.pitchWrap}>
          <PitchView
            slots1={slots1}
            slots2={slots2}
            lineup1={lineup1}
            lineup2={lineup2}
            roster1={roster1}
            roster2={roster2}
            team1Color={team1.color}
            team2Color={team2.color}
            selectedSide={selectedPlayer?.side ?? null}
            selectedLastName={selectedPlayer?.template.lastName ?? null}
            onClickPitch={handlePitchClick}
            onDragStartPitch={(idx) => onDragStart({ kind: 'pitch', slotIndex: idx })}
            onDragOverPitch={onDragOverPitch}
            onDropPitch={onDropPitch}
            onDragEnd={onDragEnd}
            dragHoverSlot={dragHover?.kind === 'pitch' ? dragHover.slotIndex : null}
          />
        </div>

        <div className={styles.sidePanel}>
          {rightPanel}
        </div>
      </div>
    </div>
  )
}

// ─── Mini-Pitch (Formations-Modal) ────────────────────────────────

const FORMATION_DESCRIPTIONS: Record<FormationType, string> = {
  '4-3-3':   'Klassisch, ausgeglichen',
  '4-2-3-1': 'Modernes Pressing',
  '4-4-2':   'Zwei Stürmer, flache Mitte',
  '3-5-2':   'Wing-Backs, dichte Mitte',
  '4-1-4-1': 'Defensiv mit 6er-Anker',
  '5-3-2':   'Tiefer Block, kontert',
  '3-4-1-2': 'Diamant, 3er-Kette',
}

function MiniPitch({ slots, color, active }: { slots: FormationSlot[]; color: string; active: boolean }) {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      className={`${styles.miniPitch} ${active ? styles.miniPitchActive : ''}`}
    >
      <rect x={0} y={0} width={100} height={100} fill="#2d6e3a" />
      <line x1={0} y1={2} x2={100} y2={2} stroke="rgba(255,255,255,0.5)" strokeWidth={0.6} />
      <rect x={20} y={68} width={60} height={32} fill="none"
            stroke="rgba(255,255,255,0.5)" strokeWidth={0.6} />
      <rect x={36} y={88} width={28} height={12} fill="none"
            stroke="rgba(255,255,255,0.5)" strokeWidth={0.6} />
      <line x1={42} y1={100} x2={58} y2={100} stroke="#fff" strokeWidth={1.2} />

      {slots.map((s, i) => {
        const mappedY = ((s.y - 50) / 43) * 93 + 5
        return (
          <g key={i} transform={`translate(${s.x} ${mappedY})`}>
            <circle r={5} fill={color} stroke="rgba(0,0,0,0.4)" strokeWidth={0.4} />
            <text textAnchor="middle" dominantBaseline="central"
                  fontSize={3.6} fontWeight={700} fill="#fff" pointerEvents="none">
              {s.positionLabel}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ─── Pitch-View ───────────────────────────────────────────────────

interface PitchProps {
  slots1: FormationSlot[]
  slots2: FormationSlot[]
  lineup1: LineupState
  lineup2: LineupState
  roster1: PlayerTemplate[]
  roster2: PlayerTemplate[]
  team1Color: string
  team2Color: string
  selectedSide: 1 | 2 | null
  selectedLastName: string | null
  onClickPitch: (slotIndex: number, side: 1 | 2) => void
  onDragStartPitch: (slotIndex: number) => (e: React.DragEvent) => void
  onDragOverPitch: (slotIndex: number) => (e: React.DragEvent) => void
  onDropPitch: (slotIndex: number) => (e: React.DragEvent) => void
  onDragEnd: () => void
  dragHoverSlot: number | null
}

function PitchView(p: PitchProps) {
  // Berechne XY-Position pro Slot in Pitch-Koordinaten (0..100). Für Team 2
  // wird gespiegelt (slots2 sind in Team-1-Sicht definiert).
  const team1Positions = p.slots1.map(s => ({ x: s.x, y: s.y }))
  const team2Positions = p.slots2.map(s => ({ x: 100 - s.x, y: 100 - s.y }))

  return (
    <div className={styles.pitchContainer}>
      {/* SVG-Pitch-Linien (Hintergrund, kein Pointer) */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className={styles.pitchBg}
      >
        <rect x={0} y={0} width={100} height={100} fill="#2d6e3a" />
        {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map(y => (
          <rect key={y} x={0} y={y} width={100} height={10}
                fill={y % 20 === 0 ? '#316f3d' : '#2d6a37'} />
        ))}
        <line x1={0} y1={50} x2={100} y2={50} stroke="#fff" strokeWidth={0.3} />
        <circle cx={50} cy={50} r={9} fill="none" stroke="#fff" strokeWidth={0.3} />
        <circle cx={50} cy={50} r={0.6} fill="#fff" />
        <rect x={20} y={0} width={60} height={16} fill="none" stroke="#fff" strokeWidth={0.3} />
        <rect x={36} y={0} width={28} height={6} fill="none" stroke="#fff" strokeWidth={0.3} />
        <line x1={42} y1={0} x2={58} y2={0} stroke="#fff" strokeWidth={0.6} />
        <circle cx={50} cy={11} r={0.5} fill="#fff" />
        <rect x={20} y={84} width={60} height={16} fill="none" stroke="#fff" strokeWidth={0.3} />
        <rect x={36} y={94} width={28} height={6} fill="none" stroke="#fff" strokeWidth={0.3} />
        <line x1={42} y1={100} x2={58} y2={100} stroke="#fff" strokeWidth={0.6} />
        <circle cx={50} cy={89} r={0.5} fill="#fff" />
      </svg>

      {/* HTML-Discs darüber, absolute positioniert */}
      <div className={styles.pitchDiscs}>
        {/* Team 1 (eigenes Team — draggable) */}
        {p.slots1.map((_slot, i) => {
          const idx = p.lineup1.starters[i]
          const tpl = idx >= 0 ? p.roster1[idx] : null
          if (!tpl) return null
          const pos = team1Positions[i]
          const selected = p.selectedSide === 1 && p.selectedLastName === tpl.lastName
          const dragOver = p.dragHoverSlot === i
          return (
            <PitchDisc
              key={`1-${i}`}
              tpl={tpl}
              x={pos.x}
              y={pos.y}
              color={p.team1Color}
              selected={selected}
              dragOver={dragOver}
              draggable
              onDragStart={p.onDragStartPitch(i)}
              onDragOver={p.onDragOverPitch(i)}
              onDrop={p.onDropPitch(i)}
              onDragEnd={p.onDragEnd}
              onClick={() => p.onClickPitch(i, 1)}
            />
          )
        })}

        {/* Team 2 (Gegner — read-only, nicht draggable) */}
        {p.slots2.map((_slot, i) => {
          const idx = p.lineup2.starters[i]
          const tpl = idx >= 0 ? p.roster2[idx] : null
          if (!tpl) return null
          const pos = team2Positions[i]
          const selected = p.selectedSide === 2 && p.selectedLastName === tpl.lastName
          return (
            <PitchDisc
              key={`2-${i}`}
              tpl={tpl}
              x={pos.x}
              y={pos.y}
              color={p.team2Color}
              selected={selected}
              dragOver={false}
              draggable={false}
              onClick={() => p.onClickPitch(i, 2)}
            />
          )
        })}
      </div>
    </div>
  )
}

// ─── PitchDisc (HTML-Disc) ───────────────────────────────────────

interface PitchDiscProps {
  tpl: PlayerTemplate
  x: number  // 0..100
  y: number  // 0..100
  color: string
  selected: boolean
  dragOver: boolean
  draggable: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  onClick: () => void
}

function PitchDisc(p: PitchDiscProps) {
  return (
    <div
      className={[
        styles.pitchDisc,
        p.selected ? styles.pitchDiscSelected : '',
        p.dragOver ? styles.pitchDiscDragOver : '',
        p.draggable ? styles.pitchDiscDraggable : styles.pitchDiscReadonly,
      ].filter(Boolean).join(' ')}
      style={{
        left: `${p.x}%`,
        top: `${p.y}%`,
        background: p.color,
      }}
      draggable={p.draggable}
      onDragStart={p.onDragStart}
      onDragOver={p.onDragOver}
      onDrop={p.onDrop}
      onDragEnd={p.onDragEnd}
      onClick={p.onClick}
    >
      <span className={styles.pitchDiscPos}>{p.tpl.positionLabel}</span>
      <span className={styles.pitchDiscName}>{p.tpl.lastName}</span>
    </div>
  )
}

// ─── Stats-Panel ─────────────────────────────────────────────────

function StatsPanel({ selected }: { selected: SelectedPlayer }) {
  const { template, fitness, confidence } = selected
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

// ─── Bench-Panel (HTML, draggable) ───────────────────────────────

interface BenchPanelProps {
  bench: number[]   // Roster-Indices
  roster: PlayerTemplate[]
  teamColor: string
  label: string
  draggable: boolean
  onDragStart?: (benchIndex: number) => (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  onClickRow?: (benchIndex: number) => void
  dragHover?: boolean
}

function BenchPanel(p: BenchPanelProps) {
  return (
    <div
      className={[
        styles.benchContainer,
        p.dragHover ? styles.benchDragOver : '',
      ].filter(Boolean).join(' ')}
      onDragOver={p.draggable ? p.onDragOver : undefined}
      onDrop={p.draggable ? p.onDrop : undefined}
    >
      <div className={styles.benchHeader}>{p.label}</div>
      <div className={styles.benchList}>
        {p.bench.length === 0 && (
          <div className={styles.benchEmpty}>(keine weiteren Spieler im Kader)</div>
        )}
        {p.bench.map((rosterIdx, benchIdx) => {
          const tpl = p.roster[rosterIdx]
          if (!tpl) return null
          return (
            <div
              key={`${benchIdx}-${rosterIdx}`}
              className={[
                styles.benchRow,
                p.draggable ? styles.benchRowDraggable : '',
              ].filter(Boolean).join(' ')}
              draggable={p.draggable}
              onDragStart={p.draggable && p.onDragStart ? p.onDragStart(benchIdx) : undefined}
              onDragEnd={p.draggable ? p.onDragEnd : undefined}
              onClick={() => p.onClickRow?.(benchIdx)}
            >
              <div
                className={styles.benchDisc}
                style={{ background: p.teamColor }}
                title={tpl.positionLabel}
              >
                {tpl.positionLabel}
              </div>
              <div className={styles.benchInfo}>
                <div className={styles.benchName}>
                  {tpl.firstName.charAt(0)}. {tpl.lastName}
                </div>
                <div className={styles.benchSubline}>
                  <span className={styles.benchQuality}>Q {Math.round(tpl.stats.quality)}</span>
                  <span className={styles.benchFitness}>Fit 100</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
