import { useEffect, useMemo, useRef, useState } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useArenaStore } from '../stores/arenaStore'
import { getTeamById } from '../data/teams'
import { Camera } from '../canvas/Camera'
import { PitchRenderer } from '../canvas/PitchRenderer'
import { VISUAL } from '../engine/constants'
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

  // Canvas-Init + Resize
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const camera = new Camera()
    cameraRef.current = camera
    pitchRendererRef.current = new PitchRenderer(camera)

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
    if (!canvas || !camera || !pitch) return
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

    // ── Spieler (linear interpoliert) ──
    const nextById = new Map(next.players.map(p => [p.id, p]))
    const radius = VISUAL.PLAYER_RADIUS * camera.baseScale

    for (const p of snap.players) {
      const np = nextById.get(p.id) ?? p
      const x = lerp(p.position.x, np.position.x, progress)
      const y = lerp(p.position.y, np.position.y, progress)
      const screen = camera.toScreen(x, y)
      const isBallOwner = snap.ball.ownerId === p.id || (progress > 0.5 && next.ball.ownerId === p.id)

      // Schatten
      ctx.beginPath()
      ctx.ellipse(screen.x, screen.y + radius * 0.3, radius * 0.75, radius * 0.22, 0, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,0,0,0.28)'
      ctx.fill()

      // Glow für Ballbesitzer
      if (isBallOwner) {
        ctx.save()
        ctx.shadowColor = '#ffd84d'
        ctx.shadowBlur = radius * 0.9
        ctx.beginPath()
        ctx.arc(screen.x, screen.y, radius + 2, 0, Math.PI * 2)
        ctx.fillStyle = p.team === 1 ? '#e63946' : '#457b9d'
        ctx.fill()
        ctx.restore()
      }

      // Disc
      ctx.beginPath()
      ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2)
      ctx.fillStyle = p.team === 1 ? '#e63946' : '#457b9d'
      ctx.fill()

      // Rand
      ctx.strokeStyle = isBallOwner ? '#ffd84d' : 'rgba(0,0,0,0.4)'
      ctx.lineWidth = isBallOwner ? 2.5 : 1.2
      ctx.stroke()

      // Label: Positions-Label
      ctx.fillStyle = '#fff'
      ctx.font = `700 ${Math.max(9, radius * 0.85)}px -apple-system, BlinkMacSystemFont, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(p.positionLabel, screen.x, screen.y)
    }

    // ── Ball ──
    // Ball bewegt sich schneller als Spieler (Pässe/Schüsse fliegen in einem Bruchteil
    // der Turn-Zeit ans Ziel). Wir komprimieren die Ball-Bewegung auf BALL_SPEED_BOOST × Frame-Dauer.
    const bt = Math.min(1, progress / BALL_SPEED_BOOST)
    const bx = lerp(snap.ball.position.x, next.ball.position.x, bt)
    const by = lerp(snap.ball.position.y, next.ball.position.y, bt)
    const ballScreen = camera.toScreen(bx, by)
    const ballRadius = VISUAL.BALL_RADIUS * camera.baseScale

    // Ball-Schatten
    ctx.beginPath()
    ctx.ellipse(ballScreen.x, ballScreen.y + ballRadius * 0.4, ballRadius * 0.8, ballRadius * 0.3, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.fill()

    // Ball
    ctx.beginPath()
    ctx.arc(ballScreen.x, ballScreen.y, ballRadius, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.strokeStyle = '#222'
    ctx.lineWidth = 1.2
    ctx.stroke()
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
  const lastEventMsg = snap?.lastEvent?.message ?? ''
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
          <span className={styles.score}>{replay.finalScore.team1} : {replay.finalScore.team2}</span>
          <span className={styles.team}>{away?.shortName}</span>
        </div>
        <div className={styles.meta}>
          {snap ? `Min ${snap.minute} · HZ ${snap.half} · Team ${snap.currentTurn} am Zug` : ''}
        </div>
      </div>

      <div className={styles.canvasWrap}>
        <canvas ref={canvasRef} className={styles.canvas} />
      </div>

      <div className={styles.event}>{lastEventMsg}</div>

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
