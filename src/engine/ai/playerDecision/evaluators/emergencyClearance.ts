/**
 * Notfall-Klärung (emergency clearance).
 *
 * Wenn ein Verteidiger im eigenen 16er unter starkem Druck steht UND
 * keinen sicheren Pass findet, haut er den Ball hoch und weit nach vorne
 * — realistisch: "Sicherheit geht vor Ballbesitz". Der Ball landet
 * häufig im Niemandsland, beim Gegner, oder ins Seiten-/Toraus → Ecke.
 *
 * Diese Option wird nur generiert, wenn:
 * - Carrier ist Verteidiger (IV/LV/RV) oder TW
 * - Carrier steht im eigenen 16er
 * - Mindestens ein Gegner < 8 Einheiten entfernt (Druck)
 *
 * Die Action ist ein langer Pass Richtung gegnerische Hälfte mit hoher
 * Streuung. Die bestehende Pass-Mechanik (applyPass) wickelt den Ausgang
 * dann realistisch ab.
 */

import type { TeamSide, PlayerData, Position } from '../../../types'
import type { BallOption } from '../types'
import { PITCH } from '../../../constants'
import { getPassRadius, clampToPitch, clampToRadius } from '../../../geometry'

export function evaluateEmergencyClearance(
  carrier: PlayerData,
  team: TeamSide,
  opponents: PlayerData[],
): BallOption | null {
  // Nur defensive Rollen machen Klärungsschläge
  const defensiveLabels = ['TW', 'IV', 'LV', 'RV']
  if (!defensiveLabels.includes(carrier.positionLabel)) return null

  // Im eigenen 16er?
  const ownGoalY = team === 1 ? 100 : 0
  const distFromGoal = Math.abs(carrier.position.y - ownGoalY)
  if (distFromGoal > PITCH.PENALTY_AREA_DEPTH) return null
  if (carrier.position.x < PITCH.PENALTY_AREA_LEFT - 5) return null
  if (carrier.position.x > PITCH.PENALTY_AREA_RIGHT + 5) return null

  // Druck messen
  let nearestOppDist = Infinity
  for (const opp of opponents) {
    if (opp.positionLabel === 'TW') continue
    const d = Math.hypot(
      carrier.position.x - opp.position.x,
      carrier.position.y - opp.position.y,
    )
    if (d < nearestOppDist) nearestOppDist = d
  }
  if (nearestOppDist > 8) return null  // Kein Druck → keine Klärung

  // Ziel: weit nach vorne, zufällig Richtung Flügel (simuliert "lange und
  // weit"). Basis-Ziel ist auf Höhe der Mittellinie, x auf die näher
  // liegende Flügelseite (damit der Ball wahrscheinlich ins Seitenaus
  // oder hinters Tor geht wenn er weiter rollt).
  const goalward = team === 1 ? -1 : 1  // Richtung gegnerisches Tor (negativ für Team 1)
  const targetY = 50 + goalward * 10    // etwa Mittellinie, leicht voraus
  // Flügelseite: näher zur dominanten Flanke des carriers
  const targetX = carrier.position.x < 50
    ? 15 + Math.random() * 20    // 15-35
    : 65 + Math.random() * 20    // 65-85

  const target: Position = clampToPitch({ x: targetX, y: targetY })

  // Pass-Radius limitieren (auch ein Klärungsschlag kann nicht beliebig
  // weit fliegen, aber sehr weit)
  const passRange = getPassRadius(carrier) * 1.3  // erweitert für Notfall
  const clamped = clampToRadius(target, carrier.position, passRange)

  // Sehr niedrige Erfolgschance (oft landet er beim Gegner oder im Aus).
  // Aber: "Erfolg" ist hier relativ — sogar ein Ballverlust in der
  // gegnerischen Hälfte ist besser als ein verlorener Zweikampf im 16er.
  // Hoher reward, niedrige successChance. Durch Score-Bonus attraktiv
  // für die bedrängte Situation.
  const pressurePenalty = (8 - nearestOppDist) * 0.05  // 0–0.4
  return {
    type: 'long_ball',
    target: clamped,
    receiverId: undefined,   // kein gezielter Empfänger
    successChance: Math.max(0.15, 0.45 - pressurePenalty),
    reward: 0.35,  // besser als hold in dieser Situation
    score: 0,
    reason: 'Klärungsschlag',
  }
}
