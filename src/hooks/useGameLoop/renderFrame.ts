import type { Camera } from '../../canvas/Camera'
import type { PitchRenderer } from '../../canvas/PitchRenderer'
import type { PlayerRenderer } from '../../canvas/PlayerRenderer'
import type { BallRenderer } from '../../canvas/BallRenderer'
import type { OverlayRenderer } from '../../canvas/OverlayRenderer'
import type { PossessionArrowRenderer } from '../../canvas/PossessionArrowRenderer'
import { animator } from '../../canvas/Animator'
import type { InputState } from '../../canvas/input/types'
import { useGameStore } from '../../stores/gameStore'
import { calculateDribbleRisk } from '../../engine/movement'
import { findReceiver, constrainPass, isPassLaneBlocked, calculatePassSuccess } from '../../engine/passing'
import type { Position } from '../../engine/types'
import { constrainDragPos } from './constrainDragPos'
import { drawRiskLabel } from './riskLabel'
import { drawOverlayLabel } from './overlayLabel'

export interface RenderFrameCtx {
  ctx: CanvasRenderingContext2D
  canvas: HTMLCanvasElement
  camera: Camera
  pitch: PitchRenderer | null
  players: PlayerRenderer | null
  ball: BallRenderer | null
  overlay: OverlayRenderer | null
  arrows: PossessionArrowRenderer | null
  prevBallTeamRef: { current: 1 | 2 | null }
  inputState: InputState
  teamColors?: { team1: string; team2: string }
}

/**
 * Single frame of the canvas render loop. Pulls current game state from the
 * store and draws pitch → possession arrows → overlays → players → ball →
 * risk labels → event overlay, in that order.
 *
 * Returns false if rendering was skipped (no game state or camera not ready)
 * so the caller can still schedule the next RAF without doing any work.
 */
export function renderFrame(rf: RenderFrameCtx): boolean {
  const { ctx, canvas, camera, pitch, players, ball, overlay, arrows, prevBallTeamRef, inputState, teamColors } = rf

  const storeSnap = useGameStore.getState()
  const gameState = storeSnap.state
  const drag = storeSnap.drag
  const overlayLabel = storeSnap.overlayLabel
  const overlayColor = storeSnap.overlayColor

  if (!gameState || camera.width === 0) return false

  const dpr = window.devicePixelRatio || 1
  ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)

  pitch?.draw(ctx)

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
    arrows?.trigger(dir, color)
  }
  if (currentBallTeam !== null) prevBallTeamRef.current = currentBallTeam
  arrows?.draw(ctx, performance.now())

  // --- Overlays for active player ---
  const activePlayer = drag.activePlayerId
    ? gameState.players.find(p => p.id === drag.activePlayerId)
    : null

  const isSetupPhase = ['kickoff', 'free_kick', 'corner', 'throw_in'].includes(gameState.phase)
  const isPenaltyPhase = gameState.phase === 'penalty'

  // Penalty shooter: show shot line only
  if (isPenaltyPhase && activePlayer && drag.dragPosition && inputState.dragTarget?.type === 'ball') {
    overlay?.drawPassLine(ctx, activePlayer.position, drag.dragPosition)
  }

  if (activePlayer && drag.dragPosition && !isSetupPhase && !isPenaltyPhase) {
    const opponents = gameState.players.filter(p => p.team !== activePlayer.team)
    // Gegner, die den Ball gerade verloren haben, können in diesem Zug nicht tackeln → aus Tackle-Visualisierung ausblenden
    const activeTacklers = opponents.filter(p => !p.cannotTackle)
    if (gameState.ball.ownerId === activePlayer.id && inputState.dragTarget?.type === 'ball') {
      overlay?.drawPassRange(ctx, activePlayer)
      overlay?.drawInterceptRanges(ctx, opponents)
      // No offside line from corners (FIFA Law 11.3)
      if (gameState.lastSetPiece !== 'corner') {
        overlay?.drawOffsideLine(ctx, gameState)
      }
      overlay?.drawPassLine(ctx, activePlayer.position, drag.dragPosition)
    } else if (inputState.dragTarget?.type === 'player') {
      const isDribbling = gameState.ball.ownerId === activePlayer.id
      if (isDribbling) {
        // Dribbling: show heatmap instead of tackle radii
        overlay?.drawDribblingHeatmap(ctx, activePlayer, activeTacklers)
      } else {
        overlay?.drawMovementRange(ctx, activePlayer)
        overlay?.drawTackleRanges(ctx, activeTacklers)
      }
      // Abseitslinie auch beim Bewegen anzeigen
      if (gameState.lastSetPiece !== 'corner') {
        overlay?.drawOffsideLine(ctx, gameState)
      }
    }
  }

  // --- Constrain drag position when dragging a player ---
  let playerDragPos: Position | null = null
  if (activePlayer && drag.dragPosition && inputState.dragTarget?.type === 'player') {
    playerDragPos = constrainDragPos(activePlayer, drag.dragPosition, gameState)
  }

  // Collect animated positions from the Animator
  const animatedPositions = new Map<string, Position>()
  for (const player of gameState.players) {
    const animPos = animator.getPosition(player.id)
    if (animPos) animatedPositions.set(player.id, animPos)
  }

  const selectedPlayerId = storeSnap.selectedPlayerId
  const localTeam = storeSnap.localTeam
  players?.draw(ctx, gameState.players, drag.activePlayerId, playerDragPos, animatedPositions, selectedPlayerId, localTeam, gameState.currentTurn)

  // --- Ball rendering: offset from carrier, drag position, or animated flight ---
  const isDraggingBall = inputState.dragTarget?.type === 'ball' && drag.dragPosition != null
  const carrier = gameState.ball.ownerId
    ? gameState.players.find(p => p.id === gameState.ball.ownerId) ?? null
    : null
  // If the carrier is being dragged or animated, pass that position so ball follows
  const carrierBeingDragged = carrier && inputState.dragTarget?.type === 'player' && drag.activePlayerId === carrier.id
  const carrierAnimPos = carrier ? animatedPositions.get(carrier.id) ?? null : null
  const carrierOverridePos = carrierBeingDragged ? playerDragPos : carrierAnimPos

  // Ball-Fluganimation (Pass/Schuss) — überschreibt alles andere
  const ballAnimPos = animator.getBallPosition()
  ball?.draw(ctx, gameState.ball, isDraggingBall, isDraggingBall ? drag.dragPosition! : undefined, carrier, carrierOverridePos, ballAnimPos)

  // --- Pass risk label (while dragging ball) ---
  if (isDraggingBall && carrier && drag.dragPosition) {
    const target = constrainPass(carrier, drag.dragPosition)
    const receiver = findReceiver(carrier, target, gameState.players)
    if (receiver) {
      const opponents = gameState.players.filter(p => p.team !== carrier.team)
      const laneBlocked = isPassLaneBlocked(carrier, receiver.position, opponents)
      const passType = laneBlocked ? 'high' as const : 'ground' as const
      const chance = calculatePassSuccess(carrier, receiver.position, passType, receiver, opponents)
      const risk = Math.round((1 - chance) * 100)
      drawRiskLabel(ctx, camera, drag.dragPosition, risk, laneBlocked ? ' ⬆' : '')
    }
  }

  // --- Dribble risk label (while dragging ball carrier as a player) ---
  if (activePlayer && playerDragPos && inputState.dragTarget?.type === 'player'
      && gameState.ball.ownerId === activePlayer.id && !isSetupPhase && !isPenaltyPhase) {
    const opponents = gameState.players.filter(p => p.team !== activePlayer.team)
    const risk = calculateDribbleRisk(activePlayer, activePlayer.origin, playerDragPos, opponents)
    const riskPct = Math.round(risk * 100)
    drawRiskLabel(ctx, camera, playerDragPos, riskPct)
  }

  // --- Short overlay label on the pitch for important events ---
  // overlayLabel/overlayColor are snapshotted in showEvent() and survive endTurn clearing lastEvent
  if (overlayLabel) {
    drawOverlayLabel(ctx, camera, overlayLabel, overlayColor)
  }

  return true
}
