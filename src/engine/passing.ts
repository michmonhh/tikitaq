import type { PlayerData, GameState, PassAction, GameEvent, TeamSide, Position } from './types'
import { distance, getPassRadius, getInterceptRadius, pointToSegmentDistance, clampToRadius } from './geometry'
import { PASSING } from './constants'

export interface PassResult {
  success: boolean
  interceptedBy: PlayerData | null
  receiver: PlayerData | null
  event: GameEvent
}

/**
 * Validate that a pass is possible: player has ball, pass radius OK, receiver valid.
 */
export function canPass(player: PlayerData, state: GameState): boolean {
  if (player.team !== state.currentTurn) return false
  if (state.ball.ownerId !== player.id) return false
  if (state.passUsedThisTurn) return false
  return true
}

/**
 * Constrain a pass target within the player's pass radius.
 */
export function constrainPass(player: PlayerData, target: Position): Position {
  const radius = getPassRadius(player)
  return clampToRadius(target, player.position, radius)
}

/**
 * Find the closest teammate near a target position (for pass reception).
 */
export function findReceiver(
  passer: PlayerData,
  target: Position,
  players: PlayerData[]
): PlayerData | null {
  const teammates = players.filter(
    p => p.team === passer.team && p.id !== passer.id
  )

  let closest: PlayerData | null = null
  let closestDist: number = PASSING.RECEIVE_RADIUS

  for (const mate of teammates) {
    const dist = distance(mate.position, target)
    if (dist < closestDist) {
      closestDist = dist
      closest = mate
    }
  }

  return closest
}

/**
 * Check if any opponent can intercept a pass between passer and target.
 * Returns the intercepting player or null.
 */
export function checkInterception(
  passer: PlayerData,
  target: Position,
  opponents: PlayerData[]
): PlayerData | null {
  let bestInterceptor: PlayerData | null = null
  let bestDist = Infinity

  for (const opp of opponents) {
    const interceptRadius = getInterceptRadius(opp)
    const distToLane = pointToSegmentDistance(opp.position, passer.position, target)

    if (distToLane <= interceptRadius) {
      // This opponent is close enough to intercept
      if (distToLane < bestDist) {
        bestDist = distToLane
        bestInterceptor = opp
      }
    }
  }

  return bestInterceptor
}

/**
 * Calculate the offside line for a given defending team.
 * Returns the Y coordinate of the second-to-last defender.
 */
export function getOffsideLine(players: PlayerData[], defendingTeam: TeamSide): number {
  const defenders = players.filter(p => p.team === defendingTeam)

  if (defendingTeam === 2) {
    // Team 2 defends top (y=0). Offside line = second lowest Y among team 2
    const sortedByY = defenders.map(p => p.position.y).sort((a, b) => a - b)
    return sortedByY.length >= 2 ? sortedByY[1] : 0
  } else {
    // Team 1 defends bottom (y=100). Offside line = second highest Y among team 1
    const sortedByY = defenders.map(p => p.position.y).sort((a, b) => b - a)
    return sortedByY.length >= 2 ? sortedByY[1] : 100
  }
}

/**
 * Check if a receiver would be in an offside position.
 */
export function isOffside(
  receiver: PlayerData,
  defendingTeam: TeamSide,
  players: PlayerData[]
): boolean {
  const offsideLine = getOffsideLine(players, defendingTeam)

  if (defendingTeam === 2) {
    // Team 1 attacks towards y=0. Offside if receiver.y < offsideLine
    return receiver.position.y < offsideLine
  } else {
    // Team 2 attacks towards y=100. Offside if receiver.y > offsideLine
    return receiver.position.y > offsideLine
  }
}

/**
 * Execute a pass action. Checks interception, offside, and resolves the result.
 */
export function applyPass(
  action: PassAction,
  state: GameState
): PassResult {
  const passer = state.players.find(p => p.id === action.playerId)!
  const opponents = state.players.filter(p => p.team !== passer.team)
  const target = constrainPass(passer, action.target)

  // Find receiver near target
  const receiver = findReceiver(passer, target, state.players)

  if (!receiver) {
    return {
      success: false,
      interceptedBy: null,
      receiver: null,
      event: {
        type: 'pass_intercepted',
        playerId: passer.id,
        position: target,
        message: 'Pass into empty space!',
      },
    }
  }

  // Check offside
  const defendingTeam: TeamSide = passer.team === 1 ? 2 : 1
  if (isOffside(receiver, defendingTeam, state.players)) {
    return {
      success: false,
      interceptedBy: null,
      receiver,
      event: {
        type: 'offside',
        playerId: passer.id,
        targetId: receiver.id,
        position: receiver.position,
        message: `Offside! ${receiver.positionLabel}`,
      },
    }
  }

  // Check interception
  const interceptor = checkInterception(passer, receiver.position, opponents)
  if (interceptor) {
    return {
      success: false,
      interceptedBy: interceptor,
      receiver,
      event: {
        type: 'pass_intercepted',
        playerId: passer.id,
        targetId: interceptor.id,
        position: interceptor.position,
        message: `Intercepted by ${interceptor.positionLabel}!`,
      },
    }
  }

  // Pass successful
  return {
    success: true,
    interceptedBy: null,
    receiver,
    event: {
      type: 'pass_complete',
      playerId: passer.id,
      targetId: receiver.id,
      position: receiver.position,
      message: `${passer.positionLabel} → ${receiver.positionLabel}`,
    },
  }
}
