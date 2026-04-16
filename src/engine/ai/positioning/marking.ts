import type { PlayerData } from '../../types'
import { distance } from '../../geometry'
import { setMarkingAssignments } from './state'
import { getRoleGroup } from './roles'
import type { RoleGroup } from './config'

/** Berechnet die Zuordnung: welcher eigene Spieler deckt welchen Gegner */
export function computeMarkingAssignments(
  ownPlayers: PlayerData[],
  opponents: PlayerData[],
): void {
  const assignments = new Map<string, string>()
  const taken = new Set<string>()

  // Angreifer bleiben vorn für Konter — nur Verteidiger + Mittelfeld decken
  const markers = ownPlayers
    .filter(p => p.positionLabel !== 'TW' && getRoleGroup(p) !== 'attacker')
    .sort((a, b) => {
      // Verteidiger zuerst zuordnen (wichtigste Deckung)
      const roleOrder: Record<RoleGroup, number> = { defender: 0, midfielder: 1, attacker: 2 }
      return roleOrder[getRoleGroup(a)] - roleOrder[getRoleGroup(b)]
    })

  const availableOpponents = opponents.filter(o => o.positionLabel !== 'TW')

  for (const marker of markers) {
    // Nächsten ungedeckten Gegner auf ähnlicher Feldhöhe und Seite finden
    let bestOpp: PlayerData | null = null
    let bestScore = -Infinity

    for (const opp of availableOpponents) {
      if (taken.has(opp.id)) continue

      const dist = distance(marker.position, opp.position)
      if (dist > 50) continue  // Zu weit weg

      // Score: Nähe + Seiten-Übereinstimmung + Gefährlichkeit
      let score = 50 - dist

      // Gleiche Feldseite bevorzugen
      const sameSide = Math.abs(marker.origin.x - opp.position.x) < 30
      if (sameSide) score += 15

      // Gefährliche Gegner (nah am Tor) bevorzugen für Verteidiger
      if (getRoleGroup(marker) === 'defender') {
        const ownGoalY = marker.team === 1 ? 100 : 0
        const threatToGoal = 50 - Math.abs(opp.position.y - ownGoalY)
        score += threatToGoal * 0.3
      }

      if (score > bestScore) {
        bestScore = score
        bestOpp = opp
      }
    }

    if (bestOpp) {
      assignments.set(marker.id, bestOpp.id)
      taken.add(bestOpp.id)
    }
  }

  setMarkingAssignments(assignments)
}
