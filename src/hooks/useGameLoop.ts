import { useEffect, useRef } from 'react'
import { Camera } from '../canvas/Camera'
import { PitchRenderer } from '../canvas/PitchRenderer'
import { PlayerRenderer } from '../canvas/PlayerRenderer'
import { BallRenderer } from '../canvas/BallRenderer'
import { OverlayRenderer } from '../canvas/OverlayRenderer'
import { InputHandler, type DragTarget, type InputState } from '../canvas/InputHandler'
import { useGameStore } from '../stores/gameStore'
import { isInGoalZone } from '../engine/shooting'
import type { Position } from '../engine/types'

/**
 * Core hook that wires the engine, canvas renderers, and input together.
 */
export function useGameLoop(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  containerRef: React.RefObject<HTMLDivElement | null>
) {
  const cameraRef = useRef(new Camera())
  const pitchRendererRef = useRef<PitchRenderer | null>(null)
  const playerRendererRef = useRef<PlayerRenderer | null>(null)
  const ballRendererRef = useRef<BallRenderer | null>(null)
  const overlayRendererRef = useRef<OverlayRenderer | null>(null)
  const inputRef = useRef<InputHandler | null>(null)
  const rafRef = useRef<number>(0)
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
    ballRendererRef.current = new BallRenderer(camera)
    overlayRendererRef.current = new OverlayRenderer(camera)

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

        if (isInGoalZone(pos, shooter.team)) {
          store.shootBall(ballOwnerId, pos)
        } else {
          store.passBall(ballOwnerId, pos)
        }
      }
    }

    inputRef.current = new InputHandler(camera, canvas, handleInputChange, handleDragEnd)

    // --- Resize ---
    // Observe the container. Set canvas buffer size + camera from container dimensions.
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

      const gameState = useGameStore.getState().state
      const drag = useGameStore.getState().drag
      const eventMessage = useGameStore.getState().eventMessage

      if (!gameState) { rafRef.current = requestAnimationFrame(renderLoop); return }

      const dpr = window.devicePixelRatio || 1
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)

      pitchRendererRef.current?.draw(ctx)

      // Overlays for active player
      const activePlayer = drag.activePlayerId
        ? gameState.players.find(p => p.id === drag.activePlayerId)
        : null

      if (activePlayer && drag.dragPosition) {
        const opponents = gameState.players.filter(p => p.team !== activePlayer.team)
        if (gameState.ball.ownerId === activePlayer.id && inputStateRef.current.dragTarget?.type === 'ball') {
          overlayRendererRef.current?.drawPassRange(ctx, activePlayer)
          overlayRendererRef.current?.drawInterceptRanges(ctx, opponents)
          overlayRendererRef.current?.drawOffsideLine(ctx, gameState)
          overlayRendererRef.current?.drawPassLine(ctx, activePlayer.position, drag.dragPosition)
        } else if (inputStateRef.current.dragTarget?.type === 'player') {
          overlayRendererRef.current?.drawMovementRange(ctx, activePlayer)
          overlayRendererRef.current?.drawTackleRanges(ctx, opponents)
        }
      }

      playerRendererRef.current?.draw(ctx, gameState.players, drag.activePlayerId)

      const isDraggingBall = inputStateRef.current.dragTarget?.type === 'ball' && drag.dragPosition != null
      ballRendererRef.current?.draw(ctx, gameState.ball, isDraggingBall, isDraggingBall ? drag.dragPosition! : undefined)

      if (eventMessage && gameState.lastEvent) {
        overlayRendererRef.current?.drawEventMessage(ctx, eventMessage, gameState.lastEvent.position)
      }

      rafRef.current = requestAnimationFrame(renderLoop)
    }

    rafRef.current = requestAnimationFrame(renderLoop)

    // --- Sync game state to input handler ---
    const syncInput = () => {
      const s = useGameStore.getState()
      if (s.state && inputRef.current) {
        inputRef.current.updateGameState(s.state.players, s.state.ball, s.state.currentTurn, s.localTeam)
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
