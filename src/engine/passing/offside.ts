import type { PlayerData, TeamSide } from '../types'

/**
 * Calculate the offside line for a given defending team.
 * Uses origin (position at turn start), not current position.
 * The line is clamped to the halfway line — own half is never offside.
 */
export function getOffsideLine(players: PlayerData[], defendingTeam: TeamSide): number {
  const defenders = players.filter(p => p.team === defendingTeam)

  if (defendingTeam === 2) {
    // Team 2 verteidigt Tor bei y=0 → Abseitslinie = 2. Spieler von unten
    // Origin = Position am Anfang der Runde (maßgeblich für Abseits)
    const sortedByY = defenders.map(p => p.origin.y).sort((a, b) => a - b)
    const raw = sortedByY.length >= 2 ? sortedByY[1] : 0
    return Math.min(raw, 50)  // Maximal bis Mittellinie — eigene Hälfte ist kein Abseits
  } else {
    // Team 1 verteidigt Tor bei y=100 → Abseitslinie = 2. Spieler von oben
    const sortedByY = defenders.map(p => p.origin.y).sort((a, b) => b - a)
    const raw = sortedByY.length >= 2 ? sortedByY[1] : 100
    return Math.max(raw, 50)  // Maximal bis Mittellinie — eigene Hälfte ist kein Abseits
  }
}

/**
 * Check if a receiver would be in an offside position.
 * Benutzt origin (Position am Rundenanfang), nicht aktuelle Position.
 * Kein Abseits wenn der Empfänger hinter dem Ball steht (Querpässe, Rückpässe).
 */
export function isOffside(
  receiver: PlayerData,
  defendingTeam: TeamSide,
  players: PlayerData[],
  ballY: number,
): boolean {
  // Origin = maßgebliche Position für Abseitsberechnung
  const recY = receiver.origin.y

  // Kein Abseits wenn Empfänger auf Ballhöhe oder dahinter
  if (defendingTeam === 2) {
    // Team 1 greift Richtung y=0 an → "hinter dem Ball" = höheres y
    if (recY >= ballY) return false
  } else {
    // Team 2 greift Richtung y=100 an → "hinter dem Ball" = niedrigeres y
    if (recY <= ballY) return false
  }

  const offsideLine = getOffsideLine(players, defendingTeam)

  if (defendingTeam === 2) {
    return recY < offsideLine
  } else {
    return recY > offsideLine
  }
}

/**
 * Berechne die Abseits-Wahrscheinlichkeit für einen Steilpass.
 *
 * - Origin im Abseits → IMMER 100% (egal wie gut der Spieler ist)
 * - Origin knapp onside → Wahrscheinlichkeit abhängig von Spielerqualität
 *   (bessere Spieler timen ihren Lauf besser und riskieren die knappe Position)
 * - Origin klar onside (>3 Einheiten) → 0%
 *
 * Nutzt origin (Rundenstart-Position) für die Berechnung.
 */
export function throughBallOffsideProbability(
  receiver: PlayerData,
  defendingTeam: TeamSide,
  players: PlayerData[],
  ballY: number,
): number {
  const recY = receiver.origin.y

  // Hinter dem Ball = kein Abseits möglich
  if (defendingTeam === 2 && recY >= ballY) return 0
  if (defendingTeam === 1 && recY <= ballY) return 0

  const offsideLine = getOffsideLine(players, defendingTeam)

  // Abstand zur Abseitslinie (positiv = abseits, negativ = onside)
  const distPastLine = defendingTeam === 2
    ? offsideLine - recY   // Team 1 greift Richtung y=0 an
    : recY - offsideLine   // Team 2 greift Richtung y=100 an

  // Origin im Abseits → IMMER abseits, keine Rettung durch Qualität
  if (distPastLine >= 0) return 1.0

  // Klar onside (> 3 Einheiten hinter der Linie): kein Risiko
  if (distPastLine < -3) return 0

  // Knapp onside (-3 bis 0): Wahrscheinlichkeit steigt je näher an der Linie
  // distPastLine ist hier zwischen -3 und 0
  // -3: 0%, -2: ~20%, -1: ~40%, -0.5: ~50%
  const base = Math.min(0.60, (3 + distPastLine) * 0.20)

  // Qualität des Empfängers reduziert Wahrscheinlichkeit (gutes Timing)
  const qualityFactor = (receiver.stats.pacing * 0.6 + receiver.stats.quality * 0.4) / 100
  const reduction = qualityFactor * 0.45  // Max 45% Reduktion bei Weltklasse

  return Math.max(0, base - reduction)
}
