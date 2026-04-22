import { useEffect, useMemo, useRef, useState } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useArenaStore } from '../stores/arenaStore'
import { getTeamById } from '../data/teams'
import { Camera } from '../canvas/Camera'
import { PitchRenderer } from '../canvas/PitchRenderer'
import { VISUAL } from '../engine/constants'
import styles from './ReplayScreen.module.css'

const BASE_FRAME_MS = 500  // bei speed=1: 500 ms pro Turn

export function ReplayScreen() {
  const navigate = useUIStore(s => s.navigate)
  const lastResult = useArenaStore(s => s.lastResult)

  const replay = lastResult?.replay
  const snapshots = useMemo(() => replay?.snapshots ?? [], [replay])
  const home = lastResult ? getTeamById(lastResult.homeId) : null
  const away = lastResult ? getTeamById(lastResult.awayId) : null

  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<1 | 2 | 4>(1)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const cameraRef = useRef<Camera | null>(null)
  const pitchRendererRef = useRef<PitchRenderer | null>(null)

  // Canvas-Init (einmal)
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
      redraw()
    }

    const ro = new ResizeObserver(resize)
    if (canvas.parentElement) ro.observe(canvas.parentElement)
    resize()
    return () => ro.disconnect()
    // redraw ist stable genug — eslint ist hier zu streng
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-draw wenn Frame/Snapshots sich ändern
  useEffect(() => {
    redraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, snapshots])

  // Playback-Loop
  useEffect(() => {
    if (!playing) return
    if (frame >= snapshots.length - 1) {
      setPlaying(false)
      return
    }
    const id = window.setTimeout(() => {
      setFrame(f => Math.min(f + 1, snapshots.length - 1))
    }, BASE_FRAME_MS / speed)
    return () => clearTimeout(id)
  }, [playing, frame, speed, snapshots.length])

  function redraw() {
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

    const snap = snapshots[frame]
    if (!snap) return

    // Spieler zeichnen
    for (const p of snap.players) {
      const screen = camera.toScreen(p.position.x, p.position.y)
      const radius = VISUAL.PLAYER_RADIUS * camera.baseScale
      const isBallOwner = snap.ball.ownerId === p.id

      ctx.beginPath()
      ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2)
      ctx.fillStyle = p.team === 1 ? '#e63946' : '#457b9d'
      ctx.fill()
      ctx.strokeStyle = isBallOwner ? '#ffdd00' : 'rgba(0,0,0,0.35)'
      ctx.lineWidth = isBallOwner ? 3 : 1.5
      ctx.stroke()

      // Positions-Label klein
      ctx.fillStyle = '#fff'
      ctx.font = `${Math.max(10, radius * 0.9)}px -apple-system, BlinkMacSystemFont, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(p.positionLabel, screen.x, screen.y)
    }

    // Ball
    const ballScreen = camera.toScreen(snap.ball.position.x, snap.ball.position.y)
    const ballRadius = VISUAL.BALL_RADIUS * camera.baseScale
    ctx.beginPath()
    ctx.arc(ballScreen.x, ballScreen.y, ballRadius, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 1
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

        <button
          className={`${styles.ctrlBtn} ${speed === 1 ? styles.active : ''}`}
          onClick={() => setSpeed(1)}
        >1×</button>
        <button
          className={`${styles.ctrlBtn} ${speed === 2 ? styles.active : ''}`}
          onClick={() => setSpeed(2)}
        >2×</button>
        <button
          className={`${styles.ctrlBtn} ${speed === 4 ? styles.active : ''}`}
          onClick={() => setSpeed(4)}
        >4×</button>
      </div>
    </div>
  )
}
