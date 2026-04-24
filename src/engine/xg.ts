/**
 * Expected-Goals (xG) aus einer Position heraus.
 *
 * Schätzt die Tor-Wahrscheinlichkeit, wenn von dieser Position aus JETZT
 * geschossen würde — unabhängig von einem konkreten Schuss-Event. Wird für
 * das Reward-Shaping im RL-Training genutzt ("wird die Situation besser
 * oder schlechter?") und als Feature-Signal für das Policy-Netz.
 *
 * Formel basiert auf vier Komponenten:
 *
 * 1. **Distanz zum Tor** — der stärkste Faktor. Aus 6 m ist xG ~0.4, aus
 *    18 m ~0.07, aus 25 m ~0.02.
 *
 * 2. **Winkel zum Tor** — wie viel von der Tor-Linie ist vom Ball aus
 *    sichtbar? Seitliche Positionen haben kleineren Winkel, kleineres xG.
 *    Mit Goal width = ~10 Einheiten.
 *
 * 3. **Gegner-Dichte im Schuss-Korridor** — jeder Verteidiger zwischen
 *    Ball und Tor reduziert xG.
 *
 * 4. **TW-Position** — schlecht positionierter TW (nicht auf Torlinie)
 *    erhöht xG leicht.
 *
 * Die Kalibrierung orientiert sich an realen xG-Modellen aus der
 * Forschungs-Literatur (Spearman 2018, McHale 2021). Unsere Positions-
 * Einheiten sind 0-100 für den Pitch (nicht Meter), deshalb Konstanten
 * angepasst: 10 Einheiten ≈ 10 m, 20 Einheiten ≈ 16 m (Strafraum-Rand).
 */

import type { PlayerData, Position, TeamSide } from './types'
import { PITCH } from './constants'
import { pointToSegmentDistance, rawDistance } from './geometry'

const GOAL_HALF_WIDTH = 5  // Torbreite 7.32 m → ~5 Einheiten halbe Breite auf 100er Pitch

/** Tor-Mittelpunkt des angegriffenen Teams. */
function attackGoalCenter(attackingTeam: TeamSide): Position {
  return {
    x: PITCH.CENTER_X,
    y: attackingTeam === 1 ? PITCH.GOAL_TOP_Y : PITCH.GOAL_BOTTOM_Y,
  }
}

/**
 * Winkel-Bewertung: wie "breit" ist das Tor vom Schuss-Punkt aus sichtbar?
 *
 * Aus einem Schusswinkel 0° (direkt vor dem Tor) ist die sichtbare Tor-
 * Breite maximal. Je schiefer die Position, desto schmaler.
 *
 * Rückgabe: normalisierter Wert [0, 1], 1 = optimal zentral.
 */
function angleFactor(pos: Position, goal: Position): number {
  const dx = goal.x - pos.x
  const dy = goal.y - pos.y
  const dist = Math.hypot(dx, dy)
  if (dist < 1) return 1  // direkt im Tor
  // Effektive Tor-Öffnung aus Sicht des Schützen: atan2(goal_half_width, dist)
  // skaliert auf [0, 1] mit 90° = 1 (unrealistisch) und 0° = 0.
  const halfAngleRad = Math.atan2(GOAL_HALF_WIDTH, dist)
  const maxHalfAngle = Math.atan2(GOAL_HALF_WIDTH, 3)  // bei 3 Einheiten Abstand
  return Math.min(1, halfAngleRad / maxHalfAngle)
}

/**
 * Haupt-Funktion: xG aus Position.
 *
 * @param pos           Ball-Position
 * @param attackingTeam Team, das angreift (bestimmt welches Tor)
 * @param opponents     Gegnerische Spieler (für Korridor-Block)
 * @returns xG als Wahrscheinlichkeit [0, 1]
 */
export function xgFromPosition(
  pos: Position,
  attackingTeam: TeamSide,
  opponents: PlayerData[] = [],
): number {
  const goal = attackGoalCenter(attackingTeam)
  const dist = rawDistance(pos, goal)

  // 1. Distanz-xG-Kurve (grob kalibriert auf reale Werte)
  //    0-5  → ~0.50 (6-Yard-Box, Top-Chance)
  //    5-10 → ~0.25
  //    10-15→ ~0.12
  //    15-20→ ~0.06 (Strafraum-Rand)
  //    20-30→ ~0.03
  //    >30  → <0.02
  let distXg: number
  if (dist < 5) {
    distXg = 0.50 - dist * 0.025       // 0.50 → 0.375
  } else if (dist < 10) {
    distXg = 0.40 - (dist - 5) * 0.030  // 0.40 → 0.25
  } else if (dist < 15) {
    distXg = 0.25 - (dist - 10) * 0.025 // 0.25 → 0.125
  } else if (dist < 20) {
    distXg = 0.13 - (dist - 15) * 0.014 // 0.13 → 0.06
  } else if (dist < 30) {
    distXg = 0.06 - (dist - 20) * 0.003 // 0.06 → 0.03
  } else {
    distXg = Math.max(0.005, 0.03 - (dist - 30) * 0.001)
  }

  // 2. Winkel-Modulation
  const angle = angleFactor(pos, goal)
  let xg = distXg * (0.3 + angle * 0.7)  // seitliche Positionen kriegen 30-100 %

  // 3. Gegner im Schuss-Korridor — jeder dazwischen reduziert xG
  const keeper = opponents.find(p => p.positionLabel === 'TW')
  const fieldOpponents = opponents.filter(p => p.positionLabel !== 'TW')

  let blockedFactor = 1.0
  for (const opp of fieldOpponents) {
    // Gegner muss VOR dem Ball (Richtung Tor) stehen, nicht hinter
    const oppToGoal = rawDistance(opp.position, goal)
    if (oppToGoal >= dist) continue  // Gegner hinter dem Ball — ignorieren

    const distToLine = pointToSegmentDistance(opp.position, pos, goal)
    if (distToLine < 3) {
      blockedFactor *= 0.55  // direkt im Pfad → starker Block
    } else if (distToLine < 6) {
      blockedFactor *= 0.85  // in der Nähe → leichte Reduktion
    }
    if (blockedFactor < 0.1) break  // unter 10 % → macht kaum noch Unterschied
  }
  xg *= blockedFactor

  // 4. TW-Position: weit vom Tor-Mittelpunkt → xG steigt leicht
  if (keeper) {
    const keeperDistFromGoal = rawDistance(keeper.position, goal)
    if (keeperDistFromGoal > 3) {
      const factor = Math.min(1.3, 1 + (keeperDistFromGoal - 3) * 0.05)
      xg *= factor
    }
  } else {
    // Kein TW? Leeres Tor → xG verdoppelt (bis max 0.9)
    xg *= 2.0
  }

  return Math.max(0, Math.min(0.9, xg))
}

/**
 * xG-Delta zwischen zwei Positionen — wie viel besser/schlechter ist die
 * neue Position? Positive Delta = Team kommt dem Tor näher.
 */
export function xgDelta(
  from: Position,
  to: Position,
  attackingTeam: TeamSide,
  opponents: PlayerData[] = [],
): number {
  return xgFromPosition(to, attackingTeam, opponents)
       - xgFromPosition(from, attackingTeam, opponents)
}
