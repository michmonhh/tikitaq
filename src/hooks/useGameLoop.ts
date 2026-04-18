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
import type { Position } from '../engine/types'
import { renderFrame } from './useGameLoop/renderFrame'

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
  // Hold latest teamColors in a ref so the mount effect stays mount-only while
  // renderFrame/setTeamColors always see current values.
  const teamColorsRef = useRef(teamColors)
  useEffect(() => {
    teamColorsRef.current = teamColors
    if (teamColors && playerRendererRef.current) {
      playerRendererRef.current.setTeamColors(teamColors.team1, teamColors.team2)
    }
  }, [teamColors])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const camera = cameraRef.current
    // Mirror view for Team 2 so they play "from the bottom"
    const localTeamInit = useGameStore.getState().localTeam
    camera.mirror = localTeamInit === 2
    pitchRendererRef.current = new PitchRenderer(camera)
    playerRendererRef.current = new PlayerRenderer(camera)
    const initialColors = teamColorsRef.current
    if (initialColors) {
      playerRendererRef.current.setTeamColors(initialColors.team1, initialColors.team2)
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

        const penaltyLike = gameState.phase === 'penalty' || gameState.phase === 'shootout_kick'
        if (penaltyLike || isInGoalZone(pos, shooter.team)) {
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
      if (ctx) {
        renderFrame({
          ctx,
          canvas,
          camera,
          pitch: pitchRendererRef.current,
          players: playerRendererRef.current,
          ball: ballRendererRef.current,
          overlay: overlayRendererRef.current,
          arrows: arrowRendererRef.current,
          prevBallTeamRef,
          inputState: inputStateRef.current,
          teamColors: teamColorsRef.current,
        })
      }
      rafRef.current = requestAnimationFrame(renderLoop)
    }

    rafRef.current = requestAnimationFrame(renderLoop)

    // --- Sync game state to input handler ---
    const syncInput = () => {
      const s = useGameStore.getState()
      if (s.state && inputRef.current) {
        const isSetup = ['kickoff', 'free_kick', 'corner', 'throw_in'].includes(s.state.phase)
        // Standards (free_kick / corner / throw_in) allow the attacker to drag
        // the ball directly to pass — no confirm button. Kickoff keeps its
        // explicit button. Ausnahme Freistoß (Fall A): Solange !setPieceReady,
        // darf der Ball noch nicht gezogen werden — der Nutzer muss erst "Bereit"
        // klicken, damit die KI defensiv repositioniert.
        const freeKickWaitingForReady = s.state.phase === 'free_kick' && !s.state.setPieceReady
        const allowDirectPassInSetPiece = ['free_kick', 'corner', 'throw_in'].includes(s.state.phase) && !freeKickWaitingForReady
        // Penalty / shootout kick mode: determine if player is shooter or keeper
        let penaltyMode: 'shooter' | 'keeper' | null = null
        if ((s.state.phase === 'penalty' || s.state.phase === 'shootout_kick') && s.penaltyState) {
          penaltyMode = s.penaltyState.shooterTeam === (s.localTeam ?? 1) ? 'shooter' : 'keeper'
        }
        inputRef.current.updateGameState(s.state.players, s.state.ball, s.state.currentTurn, s.localTeam, isSetup, s.state.mustPass, penaltyMode, allowDirectPassInSetPiece)
        // Keep mirror in sync with localTeam
        camera.mirror = s.localTeam === 2
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
