import type { GameState, PlayerData, Position } from '../../engine/types'
import { constrainMove } from '../../engine/movement'

/**
 * Compute the constrained drag position for a player being dragged.
 *
 * Returns `null` when the drag overlay should not be shown at all
 * (penalty ball carrier, set-piece taker).
 *
 * Phases:
 *   - penalty: TW snaps to goal line (x 32–68), ball carrier immovable, others anywhere
 *   - kickoff: own half only; non-kicking team must stay ≥9.65 from centre
 *   - free_kick / corner / throw_in: anywhere on pitch except taker
 *   - playing / others: standard movement range via constrainMove()
 */
export function constrainDragPos(
  activePlayer: PlayerData,
  dragPos: Position,
  gameState: GameState,
): Position | null {
  const isPenaltyPhase = gameState.phase === 'penalty' || gameState.phase === 'shootout_kick'
  const isSetupPhase = ['kickoff', 'free_kick', 'corner', 'throw_in'].includes(gameState.phase)

  if (isPenaltyPhase) {
    if (gameState.ball.ownerId === activePlayer.id) return null
    if (activePlayer.positionLabel === 'TW') {
      const goalLineY = activePlayer.team === 1 ? 97 : 3
      return {
        x: Math.max(32, Math.min(68, dragPos.x)),
        y: goalLineY,
      }
    }
    return {
      x: Math.max(4, Math.min(96, dragPos.x)),
      y: Math.max(3, Math.min(97, dragPos.y)),
    }
  }

  if (isSetupPhase) {
    if (gameState.phase === 'kickoff') {
      let ky = activePlayer.team === 1
        ? Math.max(50, Math.min(97, dragPos.y))
        : Math.max(3, Math.min(50, dragPos.y))
      let kx = Math.max(4, Math.min(96, dragPos.x))

      // FIFA: non-kicking team must stay outside the centre circle (9.15m ≈ 9.65 in our units)
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
      return { x: kx, y: ky }
    }

    // Free kick / corner / throw-in: taker is immovable, others anywhere
    if (gameState.ball.ownerId === activePlayer.id) return null
    return {
      x: Math.max(4, Math.min(96, dragPos.x)),
      y: Math.max(3, Math.min(97, dragPos.y)),
    }
  }

  return constrainMove(activePlayer, dragPos)
}
