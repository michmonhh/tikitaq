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
import { isMovementPolicyActiveForTeam } from './movement_policy/manager'
import { consumeMovementDecision } from './movement_policy/override'

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

  // Torwart — eigener Sonderfall, nicht durch Movement-Policy geleitet
  if (player.positionLabel === 'TW') {
    return goalkeeperPosition(player, state, team, plan)
  }

  // ── Movement-Policy-Override (Tier 2) ────────────────────────────
  // Wenn für dieses Team eine Movement-Policy aktiv ist UND der pre-turn
  // Async-Hook eine Entscheidung für diesen Spieler abgelegt hat, nutzen
  // wir dessen Target. Sonst läuft die Heuristik (wie bisher).
  // Loser Ball + erster Presser bleibt aus dem Override raus, weil das
  // Sonderlogik mit `secondaryTarget` braucht (Path-Finding zum Ball).
  if (isMovementPolicyActiveForTeam(team)) {
    const decision = consumeMovementDecision(player.id)
    if (decision && decision.chosenIndex < decision.options.length) {
      const opt = decision.options[decision.chosenIndex]
      return {
        target: opt.target,
        reason: `MP: ${opt.type}`,
      }
    }
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
      // ── Zweiter Presser: Pass-Linien-Cascade ──
      //
      // Vorher: generischer Versatz "8 Einheiten zur Seite, 8 nach hinten".
      // Verbesserung 2026-04-26: Identifiziere den GEFÄHRLICHSTEN Pass-
      // Empfänger des Carriers (= nächster freier Mitspieler in unserer
      // Tor-Richtung) und stelle dich zwischen Carrier und ihn. Damit
      // wird die wichtigste Pass-Linie aktiv geschlossen, statt nur
      // generisch zu blockieren.
      //
      // Threat-Score eines Mates: y-Position Richtung unser Tor — je
      // näher er am unseren Tor steht, desto gefährlicher ist der Pass
      // zu ihm. Plus Bonus für "frei", d.h. weit weg vom nächsten
      // eigenen Defender. Pragmatischer Score, kein xG-Modell.
      const fwd = team === 1 ? -1 : 1
      const carrierMates = state.players.filter(p =>
        p.team === carrier.team
        && p.id !== carrier.id
        && p.positionLabel !== 'TW',
      )
      const ownDefenders = state.players.filter(p =>
        p.team === team && p.id !== player.id,
      )
      const advancingMates = carrierMates.filter(m => {
        // Mate muss in unsere Tor-Richtung gerichtet sein (oder seitlich)
        const matesAhead = team === 1
          ? m.position.y >= carrier.position.y - 5
          : m.position.y <= carrier.position.y + 5
        const closeEnough = distance(carrier.position, m.position) < 32
        return matesAhead && closeEnough
      })

      if (advancingMates.length > 0) {
        let bestMate = advancingMates[0]
        let bestScore = -Infinity
        for (const m of advancingMates) {
          // y-Position Richtung unser Tor — je tiefer in unsere Hälfte,
          // desto gefährlicher
          const dangerY = team === 1 ? m.position.y : 100 - m.position.y
          // Marken-Distanz zum nächsten eigenen Defender (=unmarked-Bonus)
          const nearestDefDist = ownDefenders.reduce(
            (min, d) => Math.min(min, distance(d.position, m.position)),
            Infinity,
          )
          const score = dangerY + Math.min(15, nearestDefDist)
          if (score > bestScore) {
            bestScore = score
            bestMate = m
          }
        }

        // Stehe zwischen Carrier und gefährlichstem Mate (45/55-Mix mit
        // leichtem Bias zum Mate — wir wollen seine Bewegung antizipieren).
        const cutOff = {
          x: carrier.position.x * 0.42 + bestMate.position.x * 0.58,
          y: carrier.position.y * 0.42 + bestMate.position.y * 0.58,
        }
        return {
          target: cutOff,
          reason: gp ? 'Gegenpressing (Pass-Linie)' : 'Pressing (Pass-Linie)',
        }
      }

      // Fallback: kein Mate erkennbar → generischer Versatz Richtung Tor
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
