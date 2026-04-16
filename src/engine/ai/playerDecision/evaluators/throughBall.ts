import type { GameState, TeamSide, PlayerData } from '../../../types'
import {
  getMovementRadius, distance, clampToPitch,
  getPassRadius, pointToSegmentDistance, getTackleRadius,
} from '../../../geometry'
import { PITCH } from '../../../constants'
import { isOffside, getOffsideLine } from '../../../passing'
import type { BallOption } from '../types'
import { clamp } from '../helpers'

/** Sucht Raum hinter der gegnerischen Abwehrkette für einen Steilpass */
export function evaluateThroughBallSpace(
  carrier: PlayerData,
  state: GameState,
  team: TeamSide,
  opponents: PlayerData[],
  teammates: PlayerData[],
  defTeam: TeamSide,
  oppGoalY: number,
): BallOption | null {
  const offsideLine = getOffsideLine(state.players, defTeam)
  const dir = team === 1 ? -1 : 1

  // Ist genug Raum hinter der Abwehr?
  const spaceBehind = team === 1 ? offsideLine : (100 - offsideLine)
  if (spaceBehind < 10) return null

  // Finde Spieler, die NICHT im Abseits stehen und einen Lauf machen können
  const runners = teammates.filter(mate => {
    if (mate.positionLabel === 'TW') return false
    if (isOffside(mate, defTeam, state.players, carrier.position.y)) return false

    // Muss in der vorderen 2/3 des Feldes sein (auch Mittelfeldspieler dürfen laufen)
    const inRange = team === 1 ? mate.position.y < 70 : mate.position.y > 30
    if (!inRange) return false

    // Muss erreichbar nah an der Abseitslinie sein
    const distToLine = Math.abs(mate.position.y - offsideLine)
    if (distToLine > 25) return false

    // Braucht etwas Tempo
    if (mate.stats.pacing < 50) return false

    return true
  })

  if (runners.length === 0) return null

  // Bester Läufer: schnell + nah an der Linie
  const best = runners.reduce((a, b) => {
    const aDistToLine = Math.abs(a.position.y - offsideLine)
    const bDistToLine = Math.abs(b.position.y - offsideLine)
    const aScore = a.stats.pacing * 0.6 + (20 - Math.min(aDistToLine, 20)) * 2
    const bScore = b.stats.pacing * 0.6 + (20 - Math.min(bDistToLine, 20)) * 2
    return aScore > bScore ? a : b
  })

  // Zielpunkt: hinter der Abwehrkette, etwas Richtung Mitte
  const moveRad = getMovementRadius(best)
  const depth = Math.min(moveRad * 0.9, 12)
  const targetY = offsideLine + dir * depth
  const targetX = best.position.x * 0.7 + PITCH.CENTER_X * 0.3

  const target = clampToPitch({ x: targetX, y: targetY })

  // Passreichweite prüfen
  const passRange = getPassRadius(carrier)
  if (distance(carrier.position, target) > passRange) return null

  // Kann der Läufer das Ziel erreichen?
  if (distance(best.position, target) > moveRad * 1.3) return null

  // Zu nah am Torwart? (Nicht in den Fünfmeterraum spielen)
  if (Math.abs(target.y - oppGoalY) < 6) return null

  // Erfolgswahrscheinlichkeit
  const stat = carrier.stats.highPassing
  let successChance = 0.40 + stat / 200  // 0.40–0.90

  // Gegner im Passweg
  for (const opp of opponents) {
    const d = pointToSegmentDistance(opp.position, carrier.position, target)
    if (d < getTackleRadius(opp)) { successChance -= 0.10; break }
    else if (d < getTackleRadius(opp) * 2) { successChance -= 0.05 }
  }

  // Tempo des Läufers hilft
  successChance += (best.stats.pacing - 60) / 150

  successChance = clamp(successChance, 0.15, 0.80)

  // Reward: hoch — potenziell Torchance
  const goalDist = Math.abs(target.y - oppGoalY)
  let reward = 0.70 + (35 - Math.min(goalDist, 35)) / 35 * 0.30
  reward = clamp(reward, 0.60, 1.0)

  const label = `${best.positionLabel} ${best.lastName}`

  return {
    type: 'through_ball',
    target,
    receiverId: best.id,
    successChance,
    reward,
    score: 0,
    reason: `Steilpass in den Raum für ${label}`,
  }
}
