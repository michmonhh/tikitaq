import type { TeamSide, PlayerData } from '../../../types'
import { getMovementRadius, distance, clampToRadius, clampToPitch } from '../../../geometry'
import { calculateDribbleRisk } from '../../../movement'
import { PITCH } from '../../../constants'
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

  // Gegner im Weg zählen
  let blocked = 0
  for (const opp of opponents) {
    const ahead = team === 1 ? opp.position.y < carrier.position.y : opp.position.y > carrier.position.y
    if (ahead && Math.abs(opp.position.x - carrier.position.x) < 12 && distance(carrier.position, opp.position) < 15) {
      blocked++
    }
  }
  if (blocked >= 2) return null

  // 2026-04-23: Richtung = Tor-Zentrum, nicht stur geradeaus.
  // Vorher lief ein LM am Flügel (x=15) entlang seiner Linie Richtung
  // Grundlinie (x=15, y=0) statt Richtung Tor (x=50, y=0) — daraus
  // entstanden unlogische Flügel-Sprints und unnötige Fouls im Strafraum.
  // Jetzt zielt der advance immer auf den Tor-Mittelpunkt; die
  // Movement-Radius-Clamp begrenzt die Schrittweite.
  const goalCenter = { x: PITCH.CENTER_X, y: oppGoalY }
  const toGoalDx = goalCenter.x - carrier.position.x
  const toGoalDy = goalCenter.y - carrier.position.y
  const toGoalLen = Math.hypot(toGoalDx, toGoalDy) || 1
  const stride = moveRad * 0.95
  const target = clampToPitch(clampToRadius(
    {
      x: carrier.position.x + (toGoalDx / toGoalLen) * stride,
      y: carrier.position.y + (toGoalDy / toGoalLen) * stride,
    },
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
