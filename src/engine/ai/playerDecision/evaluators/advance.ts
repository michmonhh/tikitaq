import type { TeamSide, PlayerData } from '../../../types'
import { getMovementRadius, distance, clampToRadius, clampToPitch } from '../../../geometry'
import { calculateDribbleRisk } from '../../../movement'
import type { BallOption } from '../types'
import { clamp } from '../helpers'

/** Vorrücken in freien Raum */
export function evaluateAdvance(
  carrier: PlayerData,
  team: TeamSide,
  opponents: PlayerData[],
  oppGoalY: number,
): BallOption | null {
  const moveRad = getMovementRadius(carrier)
  const dir = team === 1 ? -1 : 1

  // Gegner im Weg zählen
  let blocked = 0
  for (const opp of opponents) {
    const ahead = team === 1 ? opp.position.y < carrier.position.y : opp.position.y > carrier.position.y
    if (ahead && Math.abs(opp.position.x - carrier.position.x) < 12 && distance(carrier.position, opp.position) < 15) {
      blocked++
    }
  }
  if (blocked >= 2) return null

  const target = clampToPitch(clampToRadius(
    { x: carrier.position.x, y: carrier.position.y + dir * moveRad * 0.8 },
    carrier.origin, moveRad,
  ))

  const goalDist = Math.abs(carrier.position.y - oppGoalY)
  const newGoalDist = Math.abs(target.y - oppGoalY)

  // Dribble-Risiko: Laufweg durch gegnerischen Radius → reale Zweikampfgefahr
  const dribbleRisk = calculateDribbleRisk(carrier, carrier.origin, target, opponents)
  const successChance = dribbleRisk > 0
    ? clamp(1 - dribbleRisk, 0.10, 0.85)
    : (blocked === 0 ? 0.95 : 0.65)

  return {
    type: 'advance',
    target,
    successChance,
    reward: 0.30 + (goalDist - newGoalDist) / 100 * 0.40,
    score: 0,
    reason: `Rückt vor (${Math.round(goalDist)}m zum Tor)`,
  }
}
