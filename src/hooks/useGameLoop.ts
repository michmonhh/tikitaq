import { useEffect, useRef } from 'react'
import { Camera } from '../canvas/Camera'
import { PitchRenderer } from '../canvas/PitchRenderer'
import { PlayerRenderer } from '../canvas/PlayerRenderer'
import { BallRenderer } from '../canvas/BallRenderer'
import { OverlayRenderer } from '../canvas/OverlayRenderer'
import { PossessionArrowRenderer } from '../canvas/PossessionArrowRenderer'
import { animator } from '../canvas/Animator'
import { InputHandler, type DragTarget, type InputState } from '../canvas/InputHandler'
import { useGameStore } from '../stores/gameStore'
import { isInGoalZone } from '../engine/shooting'
import { constrainMove, calculateDribbleRisk } from '../engine/movement'
import { findReceiver, constrainPass, isPassLaneBlocked, calculatePassSuccess } from '../engine/passing'
import type { Position } from '../engine/types'

/**
 * Core hook that wires the engine, canvas renderers, and input together.
 */
export function useGameLoop(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  teamColors?: { team1: string; team2: string }
) {
  const cameraRef = useRef(new Camera())
  const pitchRendererRef = useRef<PitchRenderer | null>(null)
  const playerRendererRef = useRef<PlayerRenderer | null>(null)
  const ballRendererRef = useRef<BallRenderer | null>(null)
  const overlayRendererRef = useRef<OverlayRenderer | null>(null)
  const arrowRendererRef = useRef<PossessionArrowRenderer | null>(null)
  const inputRef = useRef<InputHandler | null>(null)
  const rafRef = useRef<number>(0)
  const prevBallTeamRef = useRef<1 | 2 | null>(null)
  const inputStateRef = useRef<InputState>({
    isDragging: false,
    dragTarget: null,
    dragPosition: null,
    pointerDown: false,
  })

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const camera = cameraRef.current
    pitchRendererRef.current = new PitchRenderer(camera)
    playerRendererRef.current = new PlayerRenderer(camera)
    if (teamColors) {
      playerRendererRef.current.setTeamColors(teamColors.team1, teamColors.team2)
    }
    ballRendererRef.current = new BallRenderer(camera)
    overlayRendererRef.current = new OverlayRenderer(camera)
    arrowRendererRef.current = new PossessionArrowRenderer(camera)

    // --- Input Handling ---
    const handleInputChange = (state: InputState) => {
      inputStateRef.current = state
      const store = useGameStore.getState()

      if (state.dragTarget?.type === 'player') {
        store.setActivePlayer(state.dragTarget.player.id)
        if (state.dragPosition) store.updateDragPosition(state.dragPosition)
      } else if (state.dragTarget?.type === 'ball') {
        const ballOwner = store.state?.ball.ownerId
        if (ballOwner) store.setActivePlayer(ballOwner)
        store.setDragBall(true, state.dragPosition ?? undefined)
        if (state.dragPosition) store.updateDragPosition(state.dragPosition)
      }

      if (!state.isDragging) store.setDragBall(false)
    }

    const handleDragEnd = (target: DragTarget, pos: Position) => {
      const store = useGameStore.getState()
      const gameState = store.state
      if (!gameState || !target) return

      if (target.type === 'player') {
        store.movePlayer(target.player.id, pos)
      } else if (target.type === 'ball') {
        const ballOwnerId = gameState.ball.ownerId
        if (!ballOwnerId) return
        const shooter = gameState.players.find(p => p.id === ballOwnerId)
        if (!shooter) return

        // If ball dragged back to carrier → cancel (no pass)
        const distToCarrier = Math.hypot(pos.x - shooter.position.x, pos.y - shooter.position.y)
        if (distToCarrier < 5) {
          // Cancelled — ball stays with carrier
          return
        }

        // Ball-Position VOR der Aktion merken
        const ballFrom = { ...store.state!.ball.position }

        if (isInGoalZone(pos, shooter.team)) {
          store.shootBall(ballOwnerId, pos)
        } else {
          store.passBall(ballOwnerId, pos)
        }

        // Ball-Fluganimation NACH der Aktion — Ziel ist die tatsächliche Endposition
        // (bei Fehlpass/Interception weicht diese vom Zielpunkt ab)
        const actualBallPos = useGameStore.getState().state!.ball.position
        animator.animateBall(ballFrom, actualBallPos)
      }
    }

    const handleTap = (player: import('../engine/types').PlayerData | null) => {
      useGameStore.getState().selectPlayer(player?.id ?? null)
    }

    inputRef.current = new InputHandler(camera, canvas, handleInputChange, handleDragEnd, handleTap)

    // --- Resize ---
    const doResize = (width: number, height: number) => {
      if (width === 0 || height === 0) return
      const dpr = window.devicePixelRatio || 1

      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`

      const ctx = canvas.getContext('2d')
      if (ctx) ctx.scale(dpr, dpr)

      camera.resize(width, height)
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect
        doResize(cr.width, cr.height)
      }
    })
    observer.observe(container)

    // ResizeObserver may not fire in StrictMode due to mount/unmount/remount.
    // Schedule a fallback resize check.
    const fallbackTimer = setTimeout(() => {
      const rect = container.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        doResize(rect.width, rect.height)
      }
    }, 50)

    // --- Render Loop ---
    const renderLoop = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) { rafRef.current = requestAnimationFrame(renderLoop); return }

      const storeSnap = useGameStore.getState()
      const gameState = storeSnap.state
      const drag = storeSnap.drag
      const eventMessage = storeSnap.eventMessage
      const overlayLabel = storeSnap.overlayLabel
      const overlayColor = storeSnap.overlayColor

      if (!gameState || camera.width === 0) { rafRef.current = requestAnimationFrame(renderLoop); return }

      const dpr = window.devicePixelRatio || 1
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)

      pitchRendererRef.current?.draw(ctx)

      // --- Possession-change arrows (between pitch and players) ---
      const ballOwner = gameState.ball.ownerId
        ? gameState.players.find(p => p.id === gameState.ball.ownerId) ?? null
        : null
      const currentBallTeam = ballOwner?.team ?? null
      if (
        currentBallTeam !== null &&
        prevBallTeamRef.current !== null &&
        currentBallTeam !== prevBallTeamRef.current
      ) {
        // Team 1 attacks upward (y decreasing), Team 2 attacks downward
        const dir = currentBallTeam === 1 ? 'up' as const : 'down' as const
        const color = currentBallTeam === 1
          ? (teamColors?.team1 ?? '#ffffff')
          : (teamColors?.team2 ?? '#ffffff')
        arrowRendererRef.current?.trigger(dir, color)
      }
      if (currentBallTeam !== null) prevBallTeamRef.current = currentBallTeam
      arrowRendererRef.current?.draw(ctx, performance.now())

      // Overlays for active player
      const activePlayer = drag.activePlayerId
        ? gameState.players.find(p => p.id === drag.activePlayerId)
        : null

      const isSetupPhase = ['kickoff', 'free_kick', 'corner', 'throw_in'].includes(gameState.phase)
      const isPenaltyPhase = gameState.phase === 'penalty'
      // Penalty shooter: show shot line only
      if (isPenaltyPhase && activePlayer && drag.dragPosition && inputStateRef.current.dragTarget?.type === 'ball') {
        overlayRendererRef.current?.drawPassLine(ctx, activePlayer.position, drag.dragPosition)
      }

      if (activePlayer && drag.dragPosition && !isSetupPhase && !isPenaltyPhase) {
        const opponents = gameState.players.filter(p => p.team !== activePlayer.team)
        if (gameState.ball.ownerId === activePlayer.id && inputStateRef.current.dragTarget?.type === 'ball') {
          overlayRendererRef.current?.drawPassRange(ctx, activePlayer)
          overlayRendererRef.current?.drawInterceptRanges(ctx, opponents)
          // No offside line from corners (FIFA Law 11.3)
          if (gameState.lastSetPiece !== 'corner') {
            overlayRendererRef.current?.drawOffsideLine(ctx, gameState)
          }
          overlayRendererRef.current?.drawPassLine(ctx, activePlayer.position, drag.dragPosition)
        } else if (inputStateRef.current.dragTarget?.type === 'player') {
          const isDribbling = gameState.ball.ownerId === activePlayer.id
          if (isDribbling) {
            // Dribbling: show heatmap instead of tackle radii
            overlayRendererRef.current?.drawDribblingHeatmap(ctx, activePlayer, opponents)
          } else {
            overlayRendererRef.current?.drawMovementRange(ctx, activePlayer)
            overlayRendererRef.current?.drawTackleRanges(ctx, opponents)
          }
          // Abseitslinie auch beim Bewegen anzeigen
          if (gameState.lastSetPiece !== 'corner') {
            overlayRendererRef.current?.drawOffsideLine(ctx, gameState)
          }
        }
      }

      // When dragging a player, show the disc at the drag position
      let playerDragPos: { x: number; y: number } | null = null
      if (activePlayer && drag.dragPosition && inputStateRef.current.dragTarget?.type === 'player') {
        if (isPenaltyPhase) {
          // Penalty: ball carrier can't be moved, TW on goal line, others free
          if (gameState.ball.ownerId === activePlayer.id) {
            playerDragPos = null
          } else if (activePlayer.positionLabel === 'TW') {
            const goalLineY = activePlayer.team === 1 ? 97 : 3
            playerDragPos = {
              x: Math.max(32, Math.min(68, drag.dragPosition.x)),
              y: goalLineY,
            }
          } else {
            playerDragPos = {
              x: Math.max(4, Math.min(96, drag.dragPosition.x)),
              y: Math.max(3, Math.min(97, drag.dragPosition.y)),
            }
          }
        } else if (isSetupPhase) {
          if (gameState.phase === 'kickoff') {
            // Kickoff: own half only
            let ky = activePlayer.team === 1
              ? Math.max(50, Math.min(97, drag.dragPosition.y))
              : Math.max(3, Math.min(50, drag.dragPosition.y))
            let kx = Math.max(4, Math.min(96, drag.dragPosition.x))

            if (activePlayer.team !== gameState.currentTurn) {
              const dx = kx - 50
              const dy = ky - 50
              const dist = Math.sqrt(dx * dx + dy * dy)
              const minDist = 9.65
              if (dist < minDist) {
                const angle = Math.atan2(dy, dx)
                kx = 50 + Math.cos(angle) * minDist
                ky = 50 + Math.sin(angle) * minDist
              }
            }
            playerDragPos = { x: kx, y: ky }
          } else {
            // Free kick / corner / throw-in: anywhere on pitch
            // But ball carrier (set piece taker) can't be moved
            if (gameState.ball.ownerId === activePlayer.id) {
              playerDragPos = null
            } else {
              playerDragPos = {
                x: Math.max(4, Math.min(96, drag.dragPosition.x)),
                y: Math.max(3, Math.min(97, drag.dragPosition.y)),
              }
            }
          }
        } else {
          playerDragPos = constrainMove(activePlayer, drag.dragPosition)
        }
      }

      // Collect animated positions from the Animator
      const animatedPositions = new Map<string, { x: number; y: number }>()
      for (const player of gameState.players) {
        const animPos = animator.getPosition(player.id)
        if (animPos) animatedPositions.set(player.id, animPos)
      }

      const selectedPlayerId = storeSnap.selectedPlayerId
      const localTeam = storeSnap.localTeam
      playerRendererRef.current?.draw(ctx, gameState.players, drag.activePlayerId, playerDragPos, animatedPositions, selectedPlayerId, localTeam, gameState.currentTurn)

      // Ball rendering: offset from carrier, drag position, or animated flight
      const isDraggingBall = inputStateRef.current.dragTarget?.type === 'ball' && drag.dragPosition != null
      const carrier = gameState.ball.ownerId
        ? gameState.players.find(p => p.id === gameState.ball.ownerId) ?? null
        : null
      // If the carrier is being dragged or animated, pass that position so ball follows
      const carrierBeingDragged = carrier && inputStateRef.current.dragTarget?.type === 'player' && drag.activePlayerId === carrier.id
      const carrierAnimPos = carrier ? animatedPositions.get(carrier.id) ?? null : null
      const carrierOverridePos = carrierBeingDragged ? playerDragPos : carrierAnimPos

      // Ball-Fluganimation (Pass/Schuss) — überschreibt alles andere
      const ballAnimPos = animator.getBallPosition()
      ballRendererRef.current?.draw(ctx, gameState.ball, isDraggingBall, isDraggingBall ? drag.dragPosition! : undefined, carrier, carrierOverridePos, ballAnimPos)

      // Show pass risk while dragging ball
      if (isDraggingBall && carrier && drag.dragPosition) {
        const target = constrainPass(carrier, drag.dragPosition)
        const receiver = findReceiver(carrier, target, gameState.players)
        if (receiver) {
          const opponents = gameState.players.filter(p => p.team !== carrier.team)
          const laneBlocked = isPassLaneBlocked(carrier, receiver.position, opponents)
          const passType = laneBlocked ? 'high' as const : 'ground' as const
          const chance = calculatePassSuccess(carrier, receiver.position, passType, receiver, opponents)
          const risk = Math.round((1 - chance) * 100)

          // Draw risk percentage above the drag position
          const screenPos = camera.toScreen(drag.dragPosition.x, drag.dragPosition.y)
          const fontSize = Math.max(11, 14 * camera.baseScale)
          ctx.save()
          ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'bottom'

          // Color: green for low risk, yellow for medium, red for high
          const color = risk <= 20 ? '#4caf50' : risk <= 50 ? '#ffc107' : '#f44336'

          // Background pill
          const text = `RISK: ${risk}%${laneBlocked ? ' ⬆' : ''}`
          const metrics = ctx.measureText(text)
          const pad = 3
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
          ctx.beginPath()
          ctx.roundRect(
            screenPos.x - metrics.width / 2 - pad,
            screenPos.y - fontSize - pad * 2 - 12,
            metrics.width + pad * 2,
            fontSize + pad * 2,
            3
          )
          ctx.fill()

          ctx.fillStyle = color
          ctx.fillText(text, screenPos.x, screenPos.y - 14)
          ctx.restore()
        }
      }

      // Show dribble risk while dragging ball carrier
      if (activePlayer && playerDragPos && inputStateRef.current.dragTarget?.type === 'player'
          && gameState.ball.ownerId === activePlayer.id && !isSetupPhase && !isPenaltyPhase) {
        const opponents = gameState.players.filter(p => p.team !== activePlayer.team)
        const risk = calculateDribbleRisk(activePlayer, activePlayer.origin, playerDragPos, opponents)
        const riskPct = Math.round(risk * 100)

        const screenPos = camera.toScreen(playerDragPos.x, playerDragPos.y)
        const fontSize = Math.max(11, 14 * camera.baseScale)
        ctx.save()
        ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'

        // Color: green for low risk, yellow for medium, red for high
        const color = riskPct <= 20 ? '#4caf50' : riskPct <= 50 ? '#ffc107' : '#f44336'

        const text = `RISK: ${riskPct}%`
        const metrics = ctx.measureText(text)
        const pad = 3
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
        ctx.beginPath()
        ctx.roundRect(
          screenPos.x - metrics.width / 2 - pad,
          screenPos.y - fontSize - pad * 2 - 12,
          metrics.width + pad * 2,
          fontSize + pad * 2,
          3
        )
        ctx.fill()

        ctx.fillStyle = color
        ctx.fillText(text, screenPos.x, screenPos.y - 14)
        ctx.restore()
      }

      // Show short overlay label on the pitch for important events
      // overlayLabel/overlayColor are snapshotted in showEvent() and survive endTurn clearing lastEvent
      if (overlayLabel) {
        // Render at screen center so it's always visible, even when zoomed
        const centerScreen = { x: camera.width / 2, y: camera.height * 0.4 }
        const fontSize = Math.max(14, 18 * camera.baseScale)
        ctx.save()
        ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        // Background pill
        const metrics = ctx.measureText(overlayLabel)
        const padX = 12, padY = 8
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
        ctx.beginPath()
        ctx.roundRect(
          centerScreen.x - metrics.width / 2 - padX,
          centerScreen.y - fontSize / 2 - padY,
          metrics.width + padX * 2,
          fontSize + padY * 2,
          8
        )
        ctx.fill()

        ctx.fillStyle = overlayColor ?? '#ffffff'
        ctx.fillText(overlayLabel, centerScreen.x, centerScreen.y)
        ctx.restore()
      }

      rafRef.current = requestAnimationFrame(renderLoop)
    }

    rafRef.current = requestAnimationFrame(renderLoop)

    // --- Sync game state to input handler ---
    const syncInput = () => {
      const s = useGameStore.getState()
      if (s.state && inputRef.current) {
        const isSetup = ['kickoff', 'free_kick', 'corner', 'throw_in'].includes(s.state.phase)
        // Penalty mode: determine if player is shooter or keeper
        let penaltyMode: 'shooter' | 'keeper' | null = null
        if (s.state.phase === 'penalty' && s.penaltyState) {
          penaltyMode = s.penaltyState.shooterTeam === (s.localTeam ?? 1) ? 'shooter' : 'keeper'
        }
        inputRef.current.updateGameState(s.state.players, s.state.ball, s.state.currentTurn, s.localTeam, isSetup, s.state.mustPass, penaltyMode)
      }
    }
    syncInput()
    const unsub = useGameStore.subscribe(syncInput)

    return () => {
      cancelAnimationFrame(rafRef.current)
      clearTimeout(fallbackTimer)
      inputRef.current?.destroy()
      inputRef.current = null
      observer.disconnect()
      unsub()
    }
  }, [canvasRef, containerRef])
}
