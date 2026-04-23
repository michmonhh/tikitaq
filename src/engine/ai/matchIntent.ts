/**
 * TIKITAQ AI — MatchIntent (Stufe 4, GOAP-Light)
 *
 * Zwischen teamPlan (über ganze Spielphasen) und playerDecision (pro Zug)
 * fehlt bisher eine mittelfristige Schicht: "WAS versuchen wir gerade als
 * Team?". Ein MatchIntent hält diese Absicht über 3–5 Züge hinweg und
 * beeinflusst Pass-Bonusse und Positionierungs-Shift.
 *
 * Der Intent ist bewusst minimal gehalten: Angriffsseite (left/right/
 * center) + Gültigkeit. Damit entsteht ein kollektives Muster wo vorher
 * 11 isolierte Einzelentscheidungen die Richtung jeden Zug neu gewürfelt
 * haben.
 *
 * Lebenszyklus:
 * 1. Erster eigener Ballbesitz: Intent wird basierend auf FieldReading
 *    (weakSide, attackDirection) angelegt, Gültigkeit 4 Turns.
 * 2. Jeden Turn: Intent prüft Gültigkeit. Abbruch-Trigger:
 *    - Ballbesitz verloren (Gegner hat den Ball)
 *    - Ball wechselt drastisch die Seite (Δx > 30 gegenüber vor 2 Turns)
 *    - Gültigkeit abgelaufen
 * 3. Nach Abbruch: neuer Intent für den nächsten eigenen Ballbesitz.
 *
 * Intent-Effekte:
 * - playerDecision: Pass-Optionen in Intent-Richtung bekommen +6
 * - offensive.ts: Flügelspieler auf der Intent-Seite rücken 2 Einheiten
 *   höher auf, Spieler der Gegenseite bleiben etwas tiefer (Konter-Anker)
 *
 * GOAP-light ist das, weil ein echter GOAP-Plan mehrstufige Aktionen
 * (Pass → Flanke → Kopfball) modelliert. Hier modellieren wir nur die
 * ANGRIFFS-ACHSE, nicht die Aktionskette. Echter mehrstufiger Plan ist
 * Stufe 5+.
 */

import type { GameState, TeamSide, PlayerData } from '../types'
import type { FieldReading } from './types'

export interface MatchIntent {
  attackSide: 'left' | 'center' | 'right'
  validUntilTurn: number     // absolute turn index, NICHT relative
  createdAtTurn: number
  trigger: string            // Debug: woraus abgeleitet
  lastBallX: number          // für Seitenwechsel-Detection
}

// Modul-interner State pro Team
const intents = new Map<TeamSide, MatchIntent>()

export function resetIntents(): void {
  intents.clear()
}

export function getIntent(team: TeamSide): MatchIntent | null {
  return intents.get(team) ?? null
}

/**
 * Aktualisiert (oder erzeugt) den Intent für das gegebene Team.
 *
 * Wird im Orchestrator pro Turn aufgerufen, NACHDEM der Ballbesitz
 * festgestellt wurde. Übergibt hasBall zur Trigger-Kontrolle.
 */
export function refreshIntent(
  team: TeamSide,
  state: GameState,
  fieldReading: FieldReading | null,
  hasBall: boolean,
  carrier: PlayerData | null,
): MatchIntent | null {
  const existing = intents.get(team)
  const turnIdx = Math.floor(state.gameTime * 2)  // 0.5 min/turn → gameTime * 2
  const ballX = state.ball.position.x

  // Kein Ballbesitz: Intent stehen lassen, aber NICHT aktualisieren.
  // Wenn ein alter Intent abläuft während Gegner Ball hat, wird er beim
  // nächsten eigenen Ballbesitz neu gesetzt.
  if (!hasBall) {
    return existing ?? null
  }

  // Intent abbrechen?
  let invalidateReason: string | null = null
  if (existing) {
    if (turnIdx >= existing.validUntilTurn) {
      invalidateReason = 'expired'
    } else if (Math.abs(ballX - existing.lastBallX) > 30) {
      invalidateReason = 'side-switch'
    }
  }

  // Gültig? Dann nur lastBallX updaten und zurückgeben
  if (existing && !invalidateReason) {
    existing.lastBallX = ballX
    return existing
  }

  // Neuen Intent erzeugen, abgeleitet aus FieldReading
  let attackSide: 'left' | 'center' | 'right' = 'center'
  let trigger = 'default-center'

  if (fieldReading) {
    // weakSide ist die ungeschützte Seite des Gegners — dort angreifen
    if (fieldReading.weakSide === 'left') {
      attackSide = 'left'
      trigger = 'weakSide-left'
    } else if (fieldReading.weakSide === 'right') {
      attackSide = 'right'
      trigger = 'weakSide-right'
    } else if (fieldReading.attackDirection === 'left') {
      attackSide = 'left'
      trigger = 'attackDir-left'
    } else if (fieldReading.attackDirection === 'right') {
      attackSide = 'right'
      trigger = 'attackDir-right'
    }
  }

  // Mit Ballposition überschreiben, falls Ball weit außen liegt
  // (pragmatisch: Intent soll zur aktuellen Spielphase passen)
  if (ballX < 30) {
    attackSide = 'left'
    trigger = `${trigger}+ballX=${ballX.toFixed(0)}`
  } else if (ballX > 70) {
    attackSide = 'right'
    trigger = `${trigger}+ballX=${ballX.toFixed(0)}`
  }

  // Carrier-Position als Zusatz-Signal (wenn carrier vorhanden)
  if (carrier) {
    if (carrier.position.x < 30) {
      attackSide = 'left'
    } else if (carrier.position.x > 70) {
      attackSide = 'right'
    }
  }

  const newIntent: MatchIntent = {
    attackSide,
    // 4 Turns Gültigkeit (~2 simulierte Minuten)
    validUntilTurn: turnIdx + 4,
    createdAtTurn: turnIdx,
    trigger: invalidateReason ? `${invalidateReason} → ${trigger}` : trigger,
    lastBallX: ballX,
  }

  intents.set(team, newIntent)
  return newIntent
}

/**
 * Pass-Score-Bonus für eine Pass-Option aus MatchIntent-Sicht.
 * Pässe in Intent-Richtung bekommen Bonus, gegen +Malus.
 */
export function getIntentPassBonus(
  intent: MatchIntent | null,
  targetX: number,
): number {
  if (!intent || intent.attackSide === 'center') return 0
  const isLeft = targetX < 35
  const isRight = targetX > 65

  if (intent.attackSide === 'left') {
    if (isLeft) return 6
    if (isRight) return -4
  }
  if (intent.attackSide === 'right') {
    if (isRight) return 6
    if (isLeft) return -4
  }
  return 0
}

/**
 * Positionierungs-Shift für Offensivspieler basierend auf Intent.
 * Positiv (+) = Bewegung in Intent-Richtung (x-Verschiebung für Team 1).
 *
 * Wird in offensive.ts als additiver x-Shift angewendet.
 */
export function getIntentPositionShift(
  intent: MatchIntent | null,
  player: PlayerData,
): number {
  if (!intent || intent.attackSide === 'center') return 0

  // Nur Offensivspieler verschieben (Stürmer, OM, LM, RM)
  const offensiveLabels = ['ST', 'OM', 'LM', 'RM']
  if (!offensiveLabels.includes(player.positionLabel)) return 0

  // Intent-Achse: nach links (negativ) oder rechts (positiv)
  const shift = intent.attackSide === 'left' ? -2 : +2

  // LM/RM auf der Intent-Seite rücken stärker, die Gegenseite bleibt
  // etwas tiefer (kleinerer Shift, teilweise als Konter-Anker)
  const isLeftWinger = player.positionLabel === 'LM'
  const isRightWinger = player.positionLabel === 'RM'
  const onIntentSide = (intent.attackSide === 'left' && isLeftWinger)
                    || (intent.attackSide === 'right' && isRightWinger)
  const onAwaySide = (intent.attackSide === 'left' && isRightWinger)
                  || (intent.attackSide === 'right' && isLeftWinger)

  if (onIntentSide) return shift * 1.5  // 3 Einheiten stärker außen
  if (onAwaySide) return shift * 0.3    // bleibt näher am Zentrum

  return shift
}
