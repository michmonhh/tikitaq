/**
 * TIKITAQ AI — Positionierung (Schicht 3)
 *
 * Berechnet die Wunsch-Position jedes Spielers ohne Ball.
 * Berücksichtigt: Mannschaftsplan, Feldanalyse, Bedrohungsvorhersage.
 *
 * Modi:
 * - Eigener Ballbesitz → offensivePosition (Räume öffnen)
 * - Gegnerischer Ballbesitz → defensivePosition (Räume schließen)
 * - Gegenpress → sofort nachsetzen (zustandsbasiert)
 * - Manndeckung → feste Zuordnung mit Antizipation
 *
 * Submodule:
 *   positioning/config.ts       — Verhaltens-Tabellen (ATK/DEF/PRESS)
 *   positioning/state.ts        — Gegenpress-Zustand + Manndeckungs-Map
 *   positioning/roles.ts        — Formation/Rolle/Seite aus positionLabel
 *   positioning/anticipation.ts — Antizipation aus Stats
 *   positioning/threats.ts      — Bedrohungsvorhersage (Gegner-Prediction)
 *   positioning/gegenpress.ts   — Gegenpress-Zustand + Presser-Auswahl
 *   positioning/marking.ts      — Manndeckungs-Zuordnung
 *   positioning/offensive.ts    — Angriffs-Position + Konter-Absicherung
 *   positioning/defensive.ts    — Defensiv-/Manndeckungs-/Torwart-Position
 */

import type { GameState, TeamSide, PlayerData, Position } from '../types'
import type { TeamPlan, FieldReading } from './types'
import { distance, getMovementRadius } from '../geometry'
import { isGegenpressActive, getMarkingAssignments, resetPositioningState } from './positioning/state'
import { isFirstPresser } from './positioning/gegenpress'
import { offensivePosition } from './positioning/offensive'
import { defensivePosition, manMarkingPosition, goalkeeperPosition } from './positioning/defensive'

// ── Öffentliche API (re-exportiert aus Submodulen) ──
export { selectPressers, updateGegenpress } from './positioning/gegenpress'
export { computeMarkingAssignments } from './positioning/marking'

/** Zurücksetzen bei neuem Spiel */
export function resetPositioning(): void {
  resetPositioningState()
}

/** Berechnet die Wunsch-Position eines Spielers ohne Ball */
export function decidePositioning(
  player: PlayerData,
  state: GameState,
  team: TeamSide,
  plan: TeamPlan | null,
  fieldReading: FieldReading | null,
  hasBall: boolean,
  ballLoose: boolean,
  pressers: Set<string>,
): { target: Position; secondaryTarget?: Position; reason: string } {

  // Torwart
  if (player.positionLabel === 'TW') {
    return goalkeeperPosition(player, state, team, plan)
  }

  // Pressing (inkl. Gegenpress + loser Ball)
  if (pressers.has(player.id)) {
    if (ballLoose) {
      // Loser Ball: erster Presser direkt zum Ball. Wenn der Ball in diesem
      // Zug erreichbar ist, setzt der Presser ein SEKUNDÄRES Target Richtung
      // gegnerisches Tor — applyMove nimmt den Ball am primären Target auf
      // und läuft mit dem Restradius weiter. Zweiter Presser: Absicherung.
      const fwd = team === 1 ? -1 : 1
      const isClosest = isFirstPresser(player, state, pressers)
      if (isClosest) {
        const ballReachable = distance(player.position, state.ball.position)
          <= getMovementRadius(player)
        if (ballReachable) {
          return {
            target: state.ball.position,
            secondaryTarget: {
              x: state.ball.position.x,
              y: state.ball.position.y + fwd * 12,
            },
            reason: 'Läuft zum losen Ball',
          }
        }
        // Ball noch außer Reichweite — nur annähern
        return { target: state.ball.position, reason: 'Läuft zum losen Ball' }
      }
      // Zweiter Presser: abfangen statt identische Position
      return {
        target: { x: state.ball.position.x, y: state.ball.position.y + fwd * 6 },
        reason: 'Sichert losen Ball ab',
      }
    }
    const carrier = state.players.find(p => p.id === state.ball.ownerId)
    if (carrier) {
      const isClosest = isFirstPresser(player, state, pressers)
      const gp = isGegenpressActive()
      if (isClosest) {
        // Erster Presser: direkt auf den Ballführer
        return { target: carrier.position, reason: gp ? 'Gegenpressing' : 'Pressing' }
      }
      // Zweiter Presser: Passweg abschneiden (Richtung eigenes Tor versetzt)
      const fwd = team === 1 ? -1 : 1
      const cutOff = {
        x: carrier.position.x + (player.position.x > carrier.position.x ? 8 : -8),
        y: carrier.position.y + fwd * 8,
      }
      return { target: cutOff, reason: gp ? 'Gegenpressing (Passweg)' : 'Pressing (Passweg)' }
    }
    return { target: state.ball.position, reason: 'Pressing' }
  }

  // Eigener Ballbesitz → Angriff
  if (hasBall) {
    return offensivePosition(player, state, team, plan, fieldReading)
  }

  // Manndeckung
  if (plan?.strategy.defense === 'man_marking') {
    const assignedId = getMarkingAssignments().get(player.id)
    if (assignedId) {
      const opponent = state.players.find(p => p.id === assignedId)
      if (opponent) return manMarkingPosition(player, opponent, state, team)
    }
  }

  // Defensiv-Position
  return defensivePosition(player, state, team, plan, fieldReading)
}
