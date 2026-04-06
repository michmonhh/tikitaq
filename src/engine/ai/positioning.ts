import type { PlayerData, TeamSide, Position, GameState } from '../types'
import { distance, clampToPitch } from '../geometry'
import { getOffsideLine } from '../passing'

/**
 * Calculate the safe Y limit for forward movement to avoid offside.
 * Returns the minimum Y that attacking team 1 (or max Y for team 2) can go.
 */
export function getSafeOffsideY(state: GameState, team: TeamSide): number {
  const defendingTeam: TeamSide = team === 1 ? 2 : 1
  const line = getOffsideLine(state.players, defendingTeam)

  // Add a small buffer to stay onside
  if (team === 1) {
    return line + 1 // Team 1 attacks toward y=0, can't go below this line
  } else {
    return line - 1 // Team 2 attacks toward y=100, can't go above this line
  }
}

/**
 * Evaluate where a player should ideally be positioned based on their role,
 * the ball location, and game context (attacking/defending).
 */
export function evaluatePositionalTarget(
  player: PlayerData,
  state: GameState
): Position {
  const isAITeam = player.team
  const hasBall = state.ball.ownerId !== null &&
    state.players.find(p => p.id === state.ball.ownerId)?.team === isAITeam
  const ballPos = state.ball.position

  const safeY = getSafeOffsideY(state, isAITeam)
  const attackDir = isAITeam === 1 ? -1 : 1 // Team 1 attacks upward (y decreases)
  const ownGoalY = isAITeam === 1 ? 97 : 3

  // Goalkeeper: stay near goal, track ball's X
  if (player.positionLabel === 'TW') {
    const clampedX = Math.max(35, Math.min(65, ballPos.x))
    return { x: clampedX, y: ownGoalY }
  }

  let targetX = player.origin.x
  let targetY = player.origin.y

  if (hasBall) {
    // AI has possession — push forward
    switch (player.positionLabel) {
      case 'IV':
        // Center backs: hold line, push up slightly
        targetY = isAITeam === 1 ? 72 : 28
        targetX = player.origin.x + (ballPos.x - 50) * 0.15
        break
      case 'LV':
        // Left back: overlap on attacks
        targetY = isAITeam === 1 ? 55 : 45
        targetX = Math.max(10, player.origin.x - 5)
        break
      case 'RV':
        targetY = isAITeam === 1 ? 55 : 45
        targetX = Math.min(90, player.origin.x + 5)
        break
      case 'ZDM':
        // Defensive mid: stay behind ball, provide passing option
        targetY = ballPos.y + attackDir * -10
        targetX = 50 + (ballPos.x - 50) * 0.3
        break
      case 'LM':
        // Wide midfielder: stretch play
        targetY = ballPos.y + attackDir * 5
        targetX = 15
        break
      case 'RM':
        targetY = ballPos.y + attackDir * 5
        targetX = 85
        break
      case 'OM':
        // Attacking mid: get into space behind midfield
        targetY = ballPos.y + attackDir * 12
        targetX = ballPos.x + (Math.random() - 0.5) * 20
        break
      case 'ST':
        // Strikers: push into penalty area, seek goal
        targetY = isAITeam === 1 ? 15 : 85
        targetX = 50 + (player.origin.x - 50) * 0.6
        break
    }
  } else {
    // Defending — compress, track ball
    switch (player.positionLabel) {
      case 'IV':
        targetY = isAITeam === 1 ? 82 : 18
        targetX = player.origin.x + (ballPos.x - 50) * 0.2
        break
      case 'LV': case 'RV':
        targetY = isAITeam === 1 ? 78 : 22
        targetX = player.origin.x + (ballPos.x - player.origin.x) * 0.15
        break
      case 'ZDM':
        // Screen in front of defense
        targetY = isAITeam === 1 ? 68 : 32
        targetX = ballPos.x * 0.6 + 50 * 0.4
        break
      case 'LM': case 'RM':
        targetY = isAITeam === 1 ? 62 : 38
        targetX = player.origin.x + (ballPos.x - player.origin.x) * 0.3
        break
      case 'OM':
        // Drop back to help midfield
        targetY = isAITeam === 1 ? 55 : 45
        targetX = ballPos.x
        break
      case 'ST':
        // Striker stays high even when defending
        targetY = isAITeam === 1 ? 40 : 60
        targetX = player.origin.x
        break
    }
  }

  // Enforce offside safety
  if (isAITeam === 1 && targetY < safeY) targetY = safeY
  if (isAITeam === 2 && targetY > safeY) targetY = safeY

  return clampToPitch({ x: targetX, y: targetY })
}

/**
 * Apply repulsion from nearby teammates to avoid clumping.
 */
export function applyRepulsion(
  target: Position,
  player: PlayerData,
  teammates: PlayerData[]
): Position {
  let dx = 0
  let dy = 0
  const minDist = 8 // Minimum comfortable distance between teammates

  for (const mate of teammates) {
    if (mate.id === player.id) continue
    const dist = distance(target, mate.position)
    if (dist < minDist && dist > 0) {
      const strength = (minDist - dist) / minDist
      const angle = Math.atan2(target.y - mate.position.y, target.x - mate.position.x)
      dx += Math.cos(angle) * strength * 3
      dy += Math.sin(angle) * strength * 3
    }
  }

  return clampToPitch({
    x: target.x + dx,
    y: target.y + dy,
  })
}

/**
 * Heatmap-based position evaluation. Searches a grid of candidates
 * around the target and picks the best one considering:
 * - Proximity to ideal target
 * - Distance from opponents
 * - Distance from teammates (avoid clumping)
 */
export function calculateHeatmapTarget(
  player: PlayerData,
  idealTarget: Position,
  state: GameState
): Position {
  const teammates = state.players.filter(p => p.team === player.team && p.id !== player.id)
  const opponents = state.players.filter(p => p.team !== player.team)

  let bestPos = idealTarget
  let bestScore = -Infinity

  // Search 5x5 grid around ideal target
  const step = 4
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      const candidate = clampToPitch({
        x: idealTarget.x + dx * step,
        y: idealTarget.y + dy * step,
      })

      let score = 0

      // Proximity to ideal position
      score -= distance(candidate, idealTarget) * 0.5

      // Stay away from opponents
      for (const opp of opponents) {
        const dist = distance(candidate, opp.position)
        if (dist < 10) score -= (10 - dist) * 2
        else score += Math.min(dist * 0.1, 3)
      }

      // Stay away from teammates
      for (const mate of teammates) {
        const dist = distance(candidate, mate.position)
        if (dist < 8) score -= (8 - dist) * 1.5
      }

      // Bonus for being in open space
      const nearestOpp = Math.min(...opponents.map(o => distance(candidate, o.position)))
      if (nearestOpp > 15) score += 5

      if (score > bestScore) {
        bestScore = score
        bestPos = candidate
      }
    }
  }

  return bestPos
}
