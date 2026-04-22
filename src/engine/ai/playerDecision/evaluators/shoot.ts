import type { TeamSide, PlayerData } from '../../../types'
import { PITCH } from '../../../constants'
import { calculateShotAccuracy } from '../../../shooting'
import { rawDistance } from '../../../geometry'
import type { BallOption } from '../types'

/**
 * Maximale echte Distanz zum Tor-Mittelpunkt, ab der die KI noch schießen will.
 * 2026-04-22: 30 → 20 — User sah im Replay Schüsse von außerhalb des 16ers.
 * Der Strafraum reicht bis ~18 m, wir lassen 2 m Rand zu. Alles darüber soll
 * die KI durchs Vorrücken / Passen lösen, nicht durch Weitschüsse.
 */
const MAX_SHOOT_DISTANCE = 20

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
