import type { GameState, PlayerData, Position, TeamSide } from '../../../types'
import { distance } from '../../../geometry'
import { getRoleGroup } from '../roles'

/**
 * Findet den gefährlichsten freien Raum in Reichweite eines Gegners.
 *
 * Scannt Punkte im Halbkreis Richtung unser Tor und bewertet:
 * - Abstand zu unseren Verteidigern (weiter = freier)
 * - Nähe zu unserem Tor (näher = gefährlicher)
 * - Zwischen unseren Linien (Zehnerraum = sehr gefährlich)
 * - Erreichbarkeit (innerhalb des Bewegungsradius)
 *
 * Gibt den besten Punkt zurück, oder null wenn kein attraktiver Raum existiert.
 */
export function findDangerousSpace(
  opponent: PlayerData,
  state: GameState,
  ourTeam: TeamSide,
  moveRad: number,
): { pos: Position; score: number } | null {
  const toward = ourTeam === 1 ? 1 : -1
  const ourGoalY = ourTeam === 1 ? 100 : 0
  const ourDefs = state.players.filter(
    p => p.team === ourTeam && p.positionLabel !== 'TW',
  )

  // Berechne unsere Linienpositionen für "zwischen den Linien"-Erkennung
  const defs = state.players.filter(
    p => p.team === ourTeam && getRoleGroup(p) === 'defender',
  )
  const mids = state.players.filter(
    p => p.team === ourTeam && getRoleGroup(p) === 'midfielder',
  )
  const defLineY = defs.length > 0
    ? defs.reduce((s, p) => s + p.position.y, 0) / defs.length : ourGoalY
  const midLineY = mids.length > 0
    ? mids.reduce((s, p) => s + p.position.y, 0) / mids.length : (ourGoalY - toward * 30)

  // Scanne 8 Punkte im Halbkreis Richtung unser Tor + 2 seitlich
  const scanDist = moveRad * 0.75
  let best: { pos: Position; score: number } | null = null

  // Winkel: Halbkreis nach vorne (Richtung unser Tor) + seitliche Optionen
  // 0 = geradeaus Richtung Tor, ±90° = seitlich
  const angles = [-80, -55, -30, -10, 10, 30, 55, 80]

  for (const angleDeg of angles) {
    const angleRad = (angleDeg * Math.PI) / 180
    // Basisrichtung: Richtung unser Tor (toward > 0 → nach unten, toward < 0 → nach oben)
    const baseAngle = toward > 0 ? Math.PI / 2 : -Math.PI / 2
    const finalAngle = baseAngle + angleRad

    const px = opponent.position.x + Math.cos(finalAngle) * scanDist
    const py = opponent.position.y + Math.sin(finalAngle) * scanDist

    // Außerhalb des Spielfelds → ignorieren
    if (px < 4 || px > 96 || py < 3 || py > 97) continue

    // ── Bewertung: Wie attraktiv ist dieser Raum? ──
    let score = 0

    // 1. Freiheit: Wie weit ist der nächste unserer Spieler entfernt?
    let minDefDist = Infinity
    for (const def of ourDefs) {
      const d = distance(def.position, { x: px, y: py })
      if (d < minDefDist) minDefDist = d
    }
    // Freier Raum (>15 Einheiten von jedem Verteidiger) → hoher Bonus
    if (minDefDist > 8) {
      score += Math.min(25, (minDefDist - 8) * 1.5)
    } else {
      score -= 10  // Zu nah an einem Verteidiger → unattraktiv
    }

    // 2. Nähe zu unserem Tor → gefährlicher
    const distToGoal = Math.abs(py - ourGoalY)
    if (distToGoal < 45) {
      score += (45 - distToGoal) * 0.4
    }

    // 3. Zwischen den Linien (der "Zehnerraum") → extrem gefährlich
    const isBetweenLines = toward > 0
      ? (py > Math.min(midLineY, defLineY) && py < Math.max(midLineY, defLineY))
      : (py < Math.max(midLineY, defLineY) && py > Math.min(midLineY, defLineY))
    if (isBetweenLines) score += 15

    // 4. Hinter unserer Abwehrlinie → durchgebrochen
    const behindDefLine = toward > 0
      ? py > defLineY
      : py < defLineY
    if (behindDefLine && minDefDist > 10) score += 20

    // 5. Lücke zwischen zwei Verteidigern (horizontale Lücke in der Kette)
    if (defs.length >= 2) {
      const defsOnLine = defs.filter(d => Math.abs(d.position.y - defLineY) < 10)
      const sortedX = defsOnLine.map(d => d.position.x).sort((a, b) => a - b)
      for (let i = 0; i < sortedX.length - 1; i++) {
        const gap = sortedX[i + 1] - sortedX[i]
        if (gap > 18 && px > sortedX[i] + 3 && px < sortedX[i + 1] - 3) {
          // Punkt liegt in einer Lücke → sehr attraktiv
          score += gap * 0.6
        }
      }
    }

    if (!best || score > best.score) {
      best = { pos: { x: px, y: py }, score }
    }
  }

  // Nur zurückgeben wenn der Raum wirklich attraktiv ist (score > 10)
  return best && best.score > 10 ? best : null
}
