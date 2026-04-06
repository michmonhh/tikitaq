import type { PlayerData, GameState, MoveAction, GameEvent } from './types'
import { distance, getMovementRadius, getTackleRadius, clampToPitch, clampToRadius } from './geometry'

export interface MoveResult {
  updatedPlayer: PlayerData
  ballPickedUp: boolean
  tackle: TackleEncounter | null
  event: GameEvent | null
}

export interface TackleEncounter {
  defender: PlayerData
  attacker: PlayerData
  winProbability: number
}

/**
 * Validate and constrain a move target within the player's movement radius.
 */
export function constrainMove(player: PlayerData, target: { x: number; y: number }): { x: number; y: number } {
  const radius = getMovementRadius(player)
  const constrained = clampToRadius(target, player.origin, radius)
  return clampToPitch(constrained)
}

/**
 * Check if a player can move.
 * Players can move unless they:
 * - received a pass this turn
 * - were involved in a tackle this turn
 * - already have hasActed set (from other events)
 */
export function canPlayerMove(player: PlayerData, state: GameState): boolean {
  if (player.team !== state.currentTurn) return false
  if (player.hasActed) return false
  return true
}

/**
 * Apply a move action to the game state. Returns the move result.
 * Moving does NOT set hasActed — players can keep moving until
 * they receive a pass, have a tackle, or the turn ends.
 * Moving DOES set hasMoved (tracks that the player moved this turn).
 */
export function applyMove(
  action: MoveAction,
  state: GameState
): MoveResult {
  const player = state.players.find(p => p.id === action.playerId)
  if (!player) throw new Error(`Player ${action.playerId} not found`)

  const target = constrainMove(player, action.target)

  const updatedPlayer: PlayerData = {
    ...player,
    position: { ...target },
    // Moving does NOT set hasActed — player can act again
    hasMoved: true,
  }

  // Check if player picks up the ball (ball is unowned and nearby)
  let ballPickedUp = false
  if (!state.ball.ownerId && !state.ballOwnerChangedThisTurn) {
    const distToBall = distance(target, state.ball.position)
    if (distToBall < 3) {
      ballPickedUp = true
    }
  }

  // Check for tackle encounter with opponent ball carriers
  let tackle: TackleEncounter | null = null
  const opponents = state.players.filter(p => p.team !== player.team)
  const ballCarrier = state.ball.ownerId
    ? opponents.find(p => p.id === state.ball.ownerId)
    : null

  if (ballCarrier) {
    const tackleRadius = getTackleRadius(updatedPlayer)
    const distToCarrier = distance(target, ballCarrier.position)

    if (distToCarrier <= tackleRadius) {
      tackle = {
        defender: updatedPlayer,
        attacker: ballCarrier,
        winProbability: calculateTackleWinChance(updatedPlayer, ballCarrier),
      }
    }
  }

  return {
    updatedPlayer,
    ballPickedUp,
    tackle,
    event: {
      type: 'move',
      playerId: player.id,
      position: target,
      message: `${player.positionLabel} moves`,
    },
  }
}

/**
 * Calculate probability that the tackler wins the ball.
 */
function calculateTackleWinChance(tackler: PlayerData, carrier: PlayerData): number {
  const diff = tackler.stats.tackling - carrier.stats.ballShielding
  const chance = 0.5 + diff * 0.005
  return Math.max(0.1, Math.min(0.9, chance))
}
