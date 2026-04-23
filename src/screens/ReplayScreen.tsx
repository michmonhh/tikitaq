import { useEffect, useMemo, useRef, useState } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useArenaStore } from '../stores/arenaStore'
import { getTeamById } from '../data/teams'
import { Camera } from '../canvas/Camera'
import { PitchRenderer } from '../canvas/PitchRenderer'
import { PlayerRenderer } from '../canvas/PlayerRenderer'
import { BallRenderer } from '../canvas/BallRenderer'
import type { Position } from '../engine/types'
import styles from './ReplayScreen.module.css'

const BASE_FRAME_MS = 700  // bei speed=1: 700 ms pro Turn (genug für weite Bewegungen)
const BALL_SPEED_BOOST = 0.55  // Ball erreicht Ziel bei 55% des Frame-Zeitraums

type PlaybackSpeed = 0.3 | 0.5 | 1 | 2 | 4
const SPEEDS: Array<{ value: PlaybackSpeed; label: string }> = [
  { value: 0.3, label: '30 %' },
  { value: 0.5, label: '50 %' },
  { value: 1,   label: '1×' },
  { value: 2,   label: '2×' },
  { value: 4,   label: '4×' },
]

// Event-Anzeige: Icon + Farbe + Label pro GameEventType.
// Null bedeutet: Event wird nicht angezeigt (zu häufig / uninteressant).
interface EventStyle {
  icon: string
  label: string
  bg: string
}
const EVENT_STYLES: Record<string, EventStyle | null> = {
  shot_scored:      { icon: '⚽',  label: 'Tor',         bg: '#22c55e' },
  penalty_scored:   { icon: '⚽',  label: 'Tor (11m)',   bg: '#22c55e' },
  shot_saved:       { icon: '🧤',  label: 'Parade',      bg: '#3b82f6' },
  penalty_saved:    { icon: '🧤',  label: 'Elfmeter gehalten', bg: '#3b82f6' },
  shot_missed:      { icon: '❌',  label: 'Daneben',     bg: '#f59e0b' },
  penalty_missed:   { icon: '❌',  label: 'Elfmeter verfehlt', bg: '#f59e0b' },
  pass_intercepted: { icon: '↩',   label: 'Abgefangen',  bg: '#ef4444' },
  pass_lost:        { icon: '🔄',  label: 'Ballverlust', bg: '#fb923c' },
  tackle_won:       { icon: '⚔',   label: 'Balleroberung', bg: '#0ea5e9' },
  tackle_lost:      { icon: '⚔',   label: 'Zweikampf verloren', bg: '#a1a1aa' },
  foul:             { icon: '⚠',   label: 'Foul',        bg: '#eab308' },
  yellow_card:      { icon: '🟨',  label: 'Gelb',        bg: '#eab308' },
  red_card:         { icon: '🟥',  label: 'Rot',         bg: '#dc2626' },
  offside:          { icon: '🚩',  label: 'Abseits',     bg: '#f97316' },
  corner:           { icon: '⛳',  label: 'Ecke',        bg: '#06b6d4' },
  throw_in:         { icon: '↗',   label: 'Einwurf',     bg: '#22d3ee' },
  penalty:          { icon: '⚠',   label: 'Elfmeter',    bg: '#dc2626' },
  kickoff:          { icon: '▶',   label: 'Anstoß',      bg: '#a3a3a3' },
  half_time:        { icon: '⏸',   label: 'Halbzeit',    bg: '#a3a3a3' },
  tactic_change:    { icon: '📋',  label: 'Taktikwechsel', bg: '#a855f7' },
  // Stumm-Schaltung — zu häufig:
  pass_complete: null,
  move: null,
}

export function ReplayScreen() {
  const navigate = useUIStore(s => s.navigate)
  const lastResult = useArenaStore(s => s.lastResult)

  const replay = lastResult?.replay
  const snapshots = useMemo(() => replay?.snapshots ?? [], [replay])
  const home = lastResult ? getTeamById(lastResult.homeId) : null
  const away = lastResult ? getTeamById(lastResult.awayId) : null

  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<PlaybackSpeed>(1)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const cameraRef = useRef<Camera | null>(null)
  const pitchRendererRef = useRef<PitchRenderer | null>(null)
  const playerRendererRef = useRef<PlayerRenderer | null>(null)
  const ballRendererRef = useRef<BallRenderer | null>(null)

  // ── rAF-gesteuerter Render- und Playback-Loop ──
  // State für Interpolation aus Refs lesen, damit der rAF-Loop nicht
  // bei jedem State-Change neu gestartet werden muss.
  const frameRef = useRef(frame)
  const playingRef = useRef(playing)
  const speedRef = useRef<PlaybackSpeed>(speed)
  const frameStartRef = useRef<number>(performance.now())
  const snapshotsRef = useRef(snapshots)
  useEffect(() => { frameRef.current = frame; frameStartRef.current = performance.now() }, [frame])
  useEffect(() => { playingRef.current = playing; frameStartRef.current = performance.now() }, [playing])
  useEffect(() => { speedRef.current = speed; frameStartRef.current = performance.now() }, [speed])
  useEffect(() => { snapshotsRef.current = snapshots }, [snapshots])
  useEffect(() => {
    // Renderer kennen Default-Kit-Farben. Wir überschreiben sie mit den
    // echten Team-Farben aus data/teams.ts, damit Dortmund gelb bleibt etc.
    if (playerRendererRef.current && home?.color && away?.color) {
      playerRendererRef.current.setTeamColors(home.color, away.color)
    }
  }, [home, away])

  // Canvas-Init + Resize
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const camera = new Camera()
    cameraRef.current = camera
    pitchRendererRef.current = new PitchRenderer(camera)
    const playerRenderer = new PlayerRenderer(camera)
    // Team-Farben direkt bei der Renderer-Erstellung setzen — der separate
    // useEffect feuert beim ersten Mount vor dem Canvas-Init und greift dann
    // auf einen noch nicht erstellten Renderer zu.
    if (home?.color && away?.color) {
      playerRenderer.setTeamColors(home.color, away.color)
    }
    playerRendererRef.current = playerRenderer
    ballRendererRef.current = new BallRenderer(camera)

    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return
      const w = parent.clientWidth
      const h = parent.clientHeight
      const dpr = window.devicePixelRatio || 1
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      const ctx = canvas.getContext('2d')
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
      camera.resize(w, h)
    }

    const ro = new ResizeObserver(resize)
    if (canvas.parentElement) ro.observe(canvas.parentElement)
    resize()
    return () => ro.disconnect()
  }, [])

  // rAF-Loop (läuft IMMER — auch pausiert, damit Resize-Redraws und manuelle Scrubs sofort sichtbar sind)
  useEffect(() => {
    let rafId = 0
    const tick = () => {
      const snaps = snapshotsRef.current
      if (snaps.length > 0) {
        const framePos = frameRef.current
        const frameDuration = BASE_FRAME_MS / speedRef.current
        const elapsed = performance.now() - frameStartRef.current
        let progress = playingRef.current ? Math.min(1, elapsed / frameDuration) : 0

        // Am Ende angekommen: Stoppen
        if (playingRef.current && framePos >= snaps.length - 1) {
          setPlaying(false)
          progress = 0
        }

        // Frame fortschalten wenn interpolation abgeschlossen
        if (playingRef.current && progress >= 1 && framePos < snaps.length - 1) {
          // setFrame triggert useEffect → frameStartRef auf now
          setFrame(framePos + 1)
        } else {
          drawFrame(framePos, progress)
        }
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function drawFrame(frameIdx: number, progress: number) {
    const canvas = canvasRef.current
    const camera = cameraRef.current
    const pitch = pitchRendererRef.current
    const playerR = playerRendererRef.current
    const ballR = ballRendererRef.current
    if (!canvas || !camera || !pitch || !playerR || !ballR) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const cssW = canvas.clientWidth
    const cssH = canvas.clientHeight
    ctx.clearRect(0, 0, cssW, cssH)
    pitch.draw(ctx)

    const snaps = snapshotsRef.current
    const snap = snaps[frameIdx]
    if (!snap) return
    const next = snaps[frameIdx + 1] ?? snap
    const s = snap.state
    const ns = next.state

    // ── Interpolierte Positionen bauen ──
    // animatedPositions wird an den original PlayerRenderer übergeben; die
    // Snap-Position selbst übergibt man via players[]. Der Renderer nimmt
    // dann die animatedPosition wenn vorhanden, sonst player.position.
    const nextById = new Map(ns.players.map(p => [p.id, p]))
    const animatedPositions = new Map<string, Position>()
    for (const p of s.players) {
      const np = nextById.get(p.id) ?? p
      animatedPositions.set(p.id, {
        x: lerp(p.position.x, np.position.x, progress),
        y: lerp(p.position.y, np.position.y, progress),
      })
    }

    // ── Ball-Animation ──
    // Wenn der Ballbesitz stabil bleibt (Dribbling), läuft der Ball SYNCHRON
    // mit dem Spieler — sonst klebt er mitten im Sprint an der Endposition
    // und wartet, während der Carrier noch unterwegs ist.
    // Nur bei Besitzwechsel (Pass/Schuss/Abfang) wird BALL_SPEED_BOOST
    // angewandt, sodass der Ball schneller ans Ziel fliegt als die Spieler
    // laufen — das wirkt wie ein echter Pass.
    const ownershipChanged = s.ball.ownerId !== ns.ball.ownerId
    const bt = ownershipChanged ? Math.min(1, progress / BALL_SPEED_BOOST) : progress
    const animatedBallPos: Position = {
      x: lerp(s.ball.position.x, ns.ball.position.x, bt),
      y: lerp(s.ball.position.y, ns.ball.position.y, bt),
    }

    // ── Spieler zeichnen (Original-Renderer) ──
    // localTeam = 1 → Fitness-Bar wird für Team 1 angezeigt, Team 2 ist
    // Gegner und wird bei dessen Zug gedimmt. isSetupPhase bleibt false.
    playerR.draw(
      ctx,
      s.players,
      null,                  // activePlayerId — kein Drag im Replay
      null,                  // dragPosition
      animatedPositions,     // → überschreibt player.position mit interpolierter Position
      null,                  // selectedPlayerId
      1,                     // localTeam (zeigt Fitness-Bar für Team 1)
      s.currentTurn,         // aktueller Team-Turn (dimmt das Nicht-Team)
      false,                 // isSetupPhase
    )

    // ── Ball zeichnen ──
    const carrier = s.ball.ownerId
      ? s.players.find(p => p.id === s.ball.ownerId) ?? null
      : null
    ballR.draw(
      ctx,
      s.ball,
      false,             // isDragging
      undefined,         // dragPos
      carrier,           // carrier
      null,              // carrierDragPos
      animatedBallPos,   // animierte Ball-Position
    )

    // ── Overlays & Highlights ──
    const eventType = s.lastEvent?.type
    const isGoalFrame = eventType === 'shot_scored' || eventType === 'penalty_scored'
    const scorerId = isGoalFrame ? s.lastEvent?.playerId : null

    // Torschützen-Highlight: goldener Ring über der Disc
    if (scorerId) {
      const scorer = s.players.find(p => p.id === scorerId)
      if (scorer) {
        const pos = animatedPositions.get(scorer.id) ?? scorer.position
        const screen = camera.toScreen(pos.x, pos.y)
        ctx.save()
        ctx.strokeStyle = '#ffd700'
        ctx.lineWidth = 4
        ctx.shadowColor = '#ffd700'
        ctx.shadowBlur = 18
        ctx.beginPath()
        ctx.arc(screen.x, screen.y, camera.toScreenDistance(3.5), 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }
    }

    // ── Tor-Overlay ──
    // Bei shot_scored / penalty_scored: goldener Flash + großes "TOR!"
    // sowie Ring um das Tor. Erscheint genau für den Snapshot in dem das
    // Tor-Event hängt (typisch 700 ms bei 1×).
    if (isGoalFrame) {
      const scoringTeam = (() => {
        const scorer = s.players.find(p => p.id === scorerId)
        return scorer?.team ?? 1
      })()
      const goalY = scoringTeam === 1 ? 0 : 100

      // Goldener Halbflash über den Torraum
      const flashTop = camera.toScreen(0, scoringTeam === 1 ? 0 : 75)
      const flashBot = camera.toScreen(100, scoringTeam === 1 ? 25 : 100)
      ctx.save()
      const grad = ctx.createLinearGradient(
        0, flashTop.y, 0, flashBot.y,
      )
      if (scoringTeam === 1) {
        grad.addColorStop(0, 'rgba(255, 215, 0, 0.55)')
        grad.addColorStop(1, 'rgba(255, 215, 0, 0)')
      } else {
        grad.addColorStop(0, 'rgba(255, 215, 0, 0)')
        grad.addColorStop(1, 'rgba(255, 215, 0, 0.55)')
      }
      ctx.fillStyle = grad
      ctx.fillRect(flashTop.x, flashTop.y, flashBot.x - flashTop.x, flashBot.y - flashTop.y)
      ctx.restore()

      // Ring um das Tor
      const goalCenter = camera.toScreen(50, goalY)
      ctx.save()
      ctx.strokeStyle = '#ffd700'
      ctx.lineWidth = 4
      ctx.shadowColor = '#ffd700'
      ctx.shadowBlur = 20
      ctx.beginPath()
      ctx.arc(goalCenter.x, goalCenter.y, 70 * camera.baseScale, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()

      // Zentrierter großer "TOR!"-Text
      ctx.save()
      const fontSize = Math.min(cssW, cssH) * 0.18
      ctx.font = `900 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = Math.max(4, fontSize * 0.06)
      ctx.strokeStyle = '#000'
      ctx.strokeText('TOR!', cssW / 2, cssH / 2)
      ctx.fillStyle = '#ffd700'
      ctx.shadowColor = '#ffd700'
      ctx.shadowBlur = 24
      ctx.fillText('TOR!', cssW / 2, cssH / 2)
      ctx.restore()
    }
  }

  if (!replay) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <button className={styles.backBtn} onClick={() => navigate('arena')}>← Back</button>
        </div>
        <div className={styles.canvasWrap}>
          <div className={styles.hint}>Kein Replay geladen. Starte zuerst ein Match in der Arena.</div>
        </div>
      </div>
    )
  }

  const snap = snapshots[frame]
  const s = snap?.state
  const eventType = s?.lastEvent?.type
  const eventStyle = eventType ? EVENT_STYLES[eventType] : null
  const eventMsg = s?.lastEvent?.message ?? ''
  const progress = snapshots.length > 0 ? (frame / Math.max(1, snapshots.length - 1)) * 100 : 0

  const seekFromClick = (e: React.MouseEvent) => {
    const bar = e.currentTarget.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - bar.left) / bar.width))
    const target = Math.round(pct * (snapshots.length - 1))
    setFrame(target)
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('arena')}>← Back</button>
        <div className={styles.scoreBar}>
          <span className={styles.team}>{home?.shortName}</span>
          <span className={styles.score}>{s ? `${s.score.team1} : ${s.score.team2}` : `${replay.finalScore.team1} : ${replay.finalScore.team2}`}</span>
          <span className={styles.team}>{away?.shortName}</span>
        </div>
        <div className={styles.meta}>
          {s ? `Min ${s.gameTime} · HZ ${s.half} · Team ${s.currentTurn} am Zug` : ''}
        </div>
      </div>

      <div className={styles.canvasWrap}>
        <canvas ref={canvasRef} className={styles.canvas} />
      </div>

      <div className={styles.event}>
        {eventStyle && (
          <span
            key={`${frame}-${eventType}`}  // Re-animiert bei Event-Wechsel
            className={styles.eventBadge}
            style={{ background: eventStyle.bg }}
          >
            <span className={styles.eventIcon}>{eventStyle.icon}</span>
            {eventStyle.label}
          </span>
        )}
        {eventStyle && eventMsg && <span className={styles.eventMsg}>{eventMsg}</span>}
      </div>

      <div className={styles.controls}>
        <button
          className={styles.ctrlBtn}
          onClick={() => setFrame(0)}
          disabled={frame === 0}
          title="Anfang"
        >⏮</button>
        <button
          className={styles.ctrlBtn}
          onClick={() => setFrame(f => Math.max(0, f - 1))}
          disabled={frame === 0}
          title="Zurück"
        >◀</button>
        <button
          className={styles.ctrlBtn}
          onClick={() => setPlaying(p => !p)}
          title={playing ? 'Pause' : 'Abspielen'}
        >{playing ? '⏸' : '▶'}</button>
        <button
          className={styles.ctrlBtn}
          onClick={() => setFrame(f => Math.min(snapshots.length - 1, f + 1))}
          disabled={frame >= snapshots.length - 1}
          title="Vor"
        >▶</button>
        <button
          className={styles.ctrlBtn}
          onClick={() => setFrame(snapshots.length - 1)}
          disabled={frame >= snapshots.length - 1}
          title="Ende"
        >⏭</button>

        <div className={styles.seek}>
          <div className={styles.seekBar} onClick={seekFromClick}>
            <div className={styles.seekFill} style={{ width: `${progress}%` }} />
          </div>
          <span className={styles.seekLabel}>{frame + 1} / {snapshots.length}</span>
        </div>

        {SPEEDS.map(s => (
          <button
            key={s.value}
            className={`${styles.ctrlBtn} ${speed === s.value ? styles.active : ''}`}
            onClick={() => setSpeed(s.value)}
          >{s.label}</button>
        ))}
      </div>
    </div>
  )
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
