import type { PlayerData, GameState, TeamSide, Position } from '../types'
import { PITCH } from '../constants'
import { distance, getPassRadius, getInterceptRadius } from '../geometry'
import { pointToSegmentDistance } from '../geometry'
import { isOffside } from '../passing'

export interface PassCandidate {
  receiver: PlayerData
  score: number
}

export interface ShotOpportunity {
  canShoot: boolean
  score: number
}

/**
 * Evaluate the best pass option from a ball carrier to a teammate.
 * Returns candidates sorted by score (best first).
 */
export function evaluateBestPass(
  carrier: PlayerData,
  state: GameState
): PassCandidate[] {
  const teammates = state.players.filter(
    p => p.team === carrier.team && p.id !== carrier.id
  )
  const opponents = state.players.filter(p => p.team !== carrier.team)
  const defendingTeam: TeamSide = carrier.team === 1 ? 2 : 1
  const passRadius = getPassRadius(carrier)
  const oppGoalY = carrier.team === 1 ? 0 : 100

  const candidates: PassCandidate[] = []

  for (const mate of teammates) {
    const dist = distance(carrier.position, mate.position)
    if (dist > passRadius) continue
    if (dist < 5) continue // Too close, no point passing

    // Skip offside receivers
    if (isOffside(mate, defendingTeam, state.players)) continue

    let score = 0

    // Reward forward passes (closer to opponent goal)
    const progressToGoal = carrier.team === 1
      ? carrier.position.y - mate.position.y
      : mate.position.y - carrier.position.y
    score += progressToGoal * 1.5

    // Reward proximity to opponent goal
    const distToGoal = Math.abs(mate.position.y - oppGoalY)
    score += (100 - distToGoal) * 0.5

    // Penalize backward passes
    if (progressToGoal < 0) score += progressToGoal * 2

    // Check pass lane for interception risk
    let interceptRisk = 0
    for (const opp of opponents) {
      const interceptR = getInterceptRadius(opp)
      const distToLane = pointToSegmentDistance(opp.position, carrier.position, mate.position)
      if (distToLane < interceptR) {
        interceptRisk += (interceptR - distToLane) * 10
      }
    }
    score -= interceptRisk

    // Bonus if receiver is in space (far from opponents)
    const nearestOppToMate = Math.min(
      ...opponents.map(o => distance(mate.position, o.position))
    )
    if (nearestOppToMate > 10) score += 10
    if (nearestOppToMate > 20) score += 5

    // Bonus for wide passes (switch play)
    const xDiff = Math.abs(mate.position.x - carrier.position.x)
    if (xDiff > 30) score += 8

    candidates.push({ receiver: mate, score })
  }

  return candidates.sort((a, b) => b.score - a.score)
}

/**
 * Evaluate whether the ball carrier should attempt a shot.
 */
export function evaluateShotOpportunity(
  carrier: PlayerData,
  state: GameState
): ShotOpportunity {
  const oppGoalY = carrier.team === 1 ? 0 : 100
  const goalCenter: Position = { x: PITCH.CENTER_X, y: oppGoalY }
  const distToGoal = distance(carrier.position, goalCenter)
  const opponents = state.players.filter(p => p.team !== carrier.team)

  // Must be in attacking third
  const inAttackingThird = carrier.team === 1
    ? carrier.position.y < 35
    : carrier.position.y > 65

  if (!inAttackingThird) {
    return { canShoot: false, score: 0 }
  }

  // Check if lane to goal is open
  let laneBlocked = false
  for (const opp of opponents) {
    const distToLane = pointToSegmentDistance(opp.position, carrier.position, goalCenter)
    if (distToLane < 6) {
      laneBlocked = true
      break
    }
  }

  // Very close to goal — always worth a shot
  const veryClose = carrier.team === 1
    ? carrier.position.y < 15
    : carrier.position.y > 85

  if (veryClose) {
    return { canShoot: true, score: 80 + (laneBlocked ? -20 : 0) }
  }

  // Medium range — only if lane is open
  if (!laneBlocked && distToGoal < 40) {
    return { canShoot: true, score: 60 - distToGoal }
  }

  return { canShoot: false, score: 0 }
}

/**
 * Determine if a player should move towards the ball to challenge for it.
 */
export function shouldChallengeBall(
  player: PlayerData,
  state: GameState
): boolean {
  const ballPos = state.ball.position
  const dist = distance(player.position, ballPos)

  // Only defenders and defensive mids should chase
  const isDefensive = ['IV', 'LV', 'RV', 'ZDM'].includes(player.positionLabel)
  if (!isDefensive) return false

  // Only if ball is nearby
  if (dist > 20) return false

  // Only if opponent has the ball
  const carrier = state.ball.ownerId
    ? state.players.find(p => p.id === state.ball.ownerId)
    : null
  if (!carrier || carrier.team === player.team) return false

  return true
}
