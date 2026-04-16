import type { TeamSide, PlayerData, Position } from '../../../types'
import { getMovementRadius, distance, clampToRadius, clampToPitch } from '../../../geometry'
import { calculateDribbleRisk } from '../../../movement'
import type { BallOption } from '../types'
import { clamp } from '../helpers'

/** Dribbling-Optionen gegen nahe Gegner */
export function evaluateDribbleOptions(
  carrier: PlayerData,
  team: TeamSide,
  opponents: PlayerData[],
  oppGoalY: number,
): BallOption[] {
  const options: BallOption[] = []
  const moveRad = getMovementRadius(carrier)

  for (const opp of opponents) {
    const dist = distance(carrier.position, opp.position)
    if (dist > 15 || dist < 2) continue

    // Richtung: am Gegner vorbei (Verlängerung Ballführer → Gegner)
    const dx = opp.position.x - carrier.position.x
    const dy = opp.position.y - carrier.position.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len === 0) continue

    let target: Position = {
      x: opp.position.x + (dx / len) * 5,
      y: opp.position.y + (dy / len) * 5,
    }
    target = clampToRadius(target, carrier.origin, moveRad)
    target = clampToPitch(target)

    // Erfolgswahrscheinlichkeit: Pfad-basiertes Dribble-Risiko (Engine-konsistent)
    const dribbleRisk = calculateDribbleRisk(carrier, carrier.origin, target, [opp])
    const successChance = dribbleRisk > 0
      ? clamp(1 - dribbleRisk, 0.10, 0.85)
      : clamp(0.50 + (carrier.stats.dribbling - opp.stats.tackling) / 100, 0.10, 0.90)

    // Reward: was gewinnen wir?
    const goalDistBefore = Math.abs(carrier.position.y - oppGoalY)
    const goalDistAfter = Math.abs(target.y - oppGoalY)
    let reward = 0.40 + (goalDistBefore - goalDistAfter) / 100 * 0.50

    // Dribbeln im eigenen Drittel: stark bestrafen
    const inOwnThird = team === 1 ? carrier.position.y > 66 : carrier.position.y < 34
    if (inOwnThird) reward *= 0.30

    // Bonus im letzten Drittel: Gegner überspielen ist besonders wertvoll
    const inFinalThird = team === 1 ? carrier.position.y < 34 : carrier.position.y > 66
    if (inFinalThird) reward = Math.min(1, reward + 0.15)

    reward = clamp(reward, 0.05, 1.0)

    options.push({
      type: 'dribble',
      target,
      successChance,
      reward,
      score: 0,
      reason: `Dribbelt an ${opp.positionLabel} vorbei`,
    })
  }

  return options
}
