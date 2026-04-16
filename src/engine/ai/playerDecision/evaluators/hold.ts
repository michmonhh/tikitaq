import type { TeamSide, PlayerData } from '../../../types'
import { getMovementRadius, distance, clampToRadius, clampToPitch } from '../../../geometry'
import type { BallOption } from '../types'
import { clamp } from '../helpers'

/** Ball behaupten — weicht vom nächsten Gegner aus */
export function evaluateHold(
  carrier: PlayerData,
  _team: TeamSide,
  opponents: PlayerData[],
): BallOption {
  let closestDist = Infinity
  let closestOpp: PlayerData | null = null

  for (const opp of opponents) {
    const d = distance(carrier.position, opp.position)
    if (d < closestDist) { closestDist = d; closestOpp = opp }
  }

  // Vom Gegner weg bewegen
  let target = { ...carrier.position }
  if (closestOpp && closestDist < 12) {
    const dx = carrier.position.x - closestOpp.position.x
    const dy = carrier.position.y - closestOpp.position.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len > 0) {
      const moveRad = getMovementRadius(carrier)
      target = clampToPitch(clampToRadius(
        {
          x: carrier.position.x + (dx / len) * moveRad * 0.3,
          y: carrier.position.y + (dy / len) * moveRad * 0.3,
        },
        carrier.origin, moveRad,
      ))
    }
  }

  // Druck bewerten
  let pressure = 0
  for (const opp of opponents) {
    const d = distance(carrier.position, opp.position)
    if (d < 10) pressure += (10 - d) / 10
  }

  return {
    type: 'hold',
    target,
    successChance: clamp(0.50 + carrier.stats.ballShielding / 200 - pressure * 0.20, 0.30, 0.95),
    reward: 0.15,
    score: 0,
    reason: 'Behauptet den Ball',
  }
}
