import type { TeamSide, PlayerData } from '../../../types'
import { PITCH } from '../../../constants'
import { calculateShotAccuracy } from '../../../shooting'
import type { BallOption } from '../types'

/** Torschuss */
export function evaluateShoot(
  carrier: PlayerData,
  team: TeamSide,
  oppGoalY: number,
): BallOption | null {
  const distToGoal = Math.abs(carrier.position.y - oppGoalY)
  if (distToGoal > 24) return null

  const accuracy = calculateShotAccuracy(carrier, carrier.position, team)
  if (accuracy < 0.05) return null

  const tx = PITCH.CENTER_X + (Math.random() - 0.5) * 8
  return {
    type: 'shoot',
    target: { x: tx, y: oppGoalY },
    successChance: accuracy,
    reward: 1.0,
    score: 0,
    reason: `Torschuss (${Math.round(accuracy * 100)}%)`,
  }
}
