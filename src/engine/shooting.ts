import type { PlayerData, GameState, ShootAction, GameEvent, TeamSide } from './types'
import { distance } from './geometry'
import { SHOOTING, PITCH } from './constants'
import { getGoalkeeper } from './formation'

export interface ShotResult {
  scored: boolean
  savedBy: PlayerData | null
  event: GameEvent
}

/**
 * Check if a target position is within the goal zone for the attacking team.
 */
export function isInGoalZone(target: { x: number; y: number }, attackingTeam: TeamSide): boolean {
  const xOk = target.x >= SHOOTING.GOAL_ZONE_X_LEFT && target.x <= SHOOTING.GOAL_ZONE_X_RIGHT

  if (attackingTeam === 1) {
    // Team 1 attacks top goal (y → 0)
    return xOk && target.y <= SHOOTING.GOAL_ZONE_Y_TOP
  } else {
    // Team 2 attacks bottom goal (y → 100)
    return xOk && target.y >= SHOOTING.GOAL_ZONE_Y_BOTTOM
  }
}

/**
 * Get the center of the goal being attacked.
 */
function getGoalCenter(attackingTeam: TeamSide): { x: number; y: number } {
  return {
    x: PITCH.CENTER_X,
    y: attackingTeam === 1 ? PITCH.GOAL_TOP_Y : PITCH.GOAL_BOTTOM_Y,
  }
}

/**
 * Calculate the probability that the goalkeeper saves the shot.
 * Factors: keeper quality, shooter finishing, distance to goal.
 */
function calculateSaveProbability(
  shooter: PlayerData,
  keeper: PlayerData | undefined,
  goalCenter: { x: number; y: number }
): number {
  if (!keeper) return 0 // No keeper = always scores

  const keeperBonus = keeper.stats.quality * SHOOTING.KEEPER_QUALITY_WEIGHT
  const shooterBonus = shooter.stats.finishing * SHOOTING.SHOOTER_FINISHING_WEIGHT
  const distFromGoal = distance(shooter.position, goalCenter)
  const distancePenalty = distFromGoal * SHOOTING.DISTANCE_PENALTY

  const saveChance = SHOOTING.BASE_SAVE_CHANCE + keeperBonus - shooterBonus + distancePenalty
  return Math.max(0.05, Math.min(0.95, saveChance))
}

/**
 * Execute a shot action.
 */
export function applyShot(
  action: ShootAction,
  state: GameState
): ShotResult {
  const shooter = state.players.find(p => p.id === action.playerId)!
  const attackingTeam = shooter.team
  const defendingTeam: TeamSide = attackingTeam === 1 ? 2 : 1
  const goalCenter = getGoalCenter(attackingTeam)
  const keeper = getGoalkeeper(state.players, defendingTeam)

  const saveProbability = calculateSaveProbability(shooter, keeper, goalCenter)
  const roll = Math.random()

  if (roll < saveProbability && keeper) {
    return {
      scored: false,
      savedBy: keeper,
      event: {
        type: 'shot_saved',
        playerId: shooter.id,
        targetId: keeper.id,
        position: goalCenter,
        message: `Save! ${keeper.positionLabel} stops ${shooter.positionLabel}`,
      },
    }
  }

  return {
    scored: true,
    savedBy: null,
    event: {
      type: 'shot_scored',
      playerId: shooter.id,
      position: goalCenter,
      message: `GOAL! ${shooter.positionLabel} scores!`,
    },
  }
}
