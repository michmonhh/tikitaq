import type { TeamSide, PlayerData } from '../../../types'
import { PITCH } from '../../../constants'
import { calculateShotAccuracy } from '../../../shooting'
import { rawDistance } from '../../../geometry'
import type { BallOption } from '../types'

/**
 * Maximale echte Distanz zum Tor-Mittelpunkt, ab der die KI noch schießen will.
 * Davor: 24 Einheiten reine Y-Distanz — führte dazu, dass Schüsse vom Flügel
 * (Y-nah, aber seitlich weit) fälschlich abgelehnt wurden und die KI fast nie
 * schoss. Arena-Befund: 0.54 Tore/Match statt ~2.8.
 * 30 deckt den Strafraum (~18) + etwa 12 Einheiten davor komfortabel ab.
 */
const MAX_SHOOT_DISTANCE = 30

/** Torschuss */
export function evaluateShoot(
  carrier: PlayerData,
  team: TeamSide,
  oppGoalY: number,
): BallOption | null {
  const goalCenter = { x: PITCH.CENTER_X, y: oppGoalY }
  const distToGoal = rawDistance(carrier.position, goalCenter)
  if (distToGoal > MAX_SHOOT_DISTANCE) return null

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
