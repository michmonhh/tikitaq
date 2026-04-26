/**
 * Sync-Runner für die Movement-Policy.
 *
 * Wird vor der Position-Loop in executeAITurn aufgerufen. Generiert
 * Movement-Optionen pro Off-Ball-Spieler, lässt eine HEURISTISCHE
 * Policy entscheiden (max-score), legt das Ergebnis im Override-Slot
 * ab, und ruft das Trajectory-Recording auf.
 *
 * Für ML-Policy gibt es einen separaten async-Pfad in aiArena.ts /
 * runAIMatch.ts (onBeforeAITurn-Hook), der die ONNX-Inferenz ausführt.
 * Beide Pfade nutzen denselben Override-Slot.
 *
 * Sync-Pfad ist immer aktiv wenn:
 *   1. eine Movement-Policy registriert ist (manager.isActive=true), ODER
 *   2. Training-Export aktiv ist (für Heuristik-Trajectory-Sammlung)
 *
 * Andernfalls läuft die Engine wie bisher (decidePositioning ohne
 * Override → klassische Heuristik).
 */

import type { GameState, PlayerData, TeamSide } from '../../types'
import type { TeamPlan, FieldReading } from '../types'
import { isTrainingExportActive, recordMovementDecision } from '../training'
import { generateMovementOptions } from './options'
import { setMovementDecision, clearMovementDecisions } from './override'
import { isMovementPolicyActiveForTeam } from './manager'
import type { MovementContext, MovementOption } from './types'

/**
 * Default-Wahl: höchster Heuristik-Score (= argmax). Sample-Mode wird
 * vom Async-ML-Pfad gehandhabt, nicht hier.
 */
function maxScoreIndex(options: MovementOption[]): number {
  let best = 0
  for (let i = 1; i < options.length; i++) {
    if (options[i].score > options[best].score) best = i
  }
  return best
}

export function runMovementHeuristic(
  state: GameState,
  team: TeamSide,
  players: PlayerData[],
  plan: TeamPlan | null,
  fieldReading: FieldReading | null,
  acted: Set<string>,
  pressers: Set<string>,
  hasBall: boolean,
  ballLoose: boolean,
): void {
  // Wenn weder Policy noch Recording aktiv → nichts zu tun (Performance)
  const policyActive = isMovementPolicyActiveForTeam(team)
  const recordingActive = isTrainingExportActive()
  if (!policyActive && !recordingActive) return

  // Bei aktiver Movement-Policy werden die Override-Slots vom async Pfad
  // (onBeforeAITurn) gefüllt. Die Heuristik-Variante hier ist nur ein
  // Fallback wenn Override fehlt + Recording-Pfad.
  for (const player of players) {
    if (acted.has(player.id)) continue
    if (player.positionLabel === 'TW') continue

    const ctx: MovementContext = {
      state, team, player, plan, fieldReading, pressers, hasBall, ballLoose,
    }
    const options = generateMovementOptions(ctx)
    if (options.length === 0) continue

    const chosen = maxScoreIndex(options)

    // Wenn Movement-Policy aktiv ist, hat der async-Hook (ggf.) bereits
    // einen Override gesetzt — wir überschreiben den NICHT, sondern
    // fallen nur ein wenn nichts da ist. Daher: nur setzen wenn Recording
    // aktiv ist (ML-Override hat Vorrang).
    if (recordingActive) {
      setMovementDecision(player.id, {
        options,
        chosenIndex: chosen,
        source: 'heuristic',
      })
      recordMovementDecision(state, team, player, options, chosen)
    } else if (policyActive) {
      // Policy aktiv aber kein Recording → nur Default-Override falls
      // async-Hook nichts gesetzt hat. setMovementDecision ist idempotent
      // (Map-set), aber wir wollen nicht den ML-Override überschreiben.
      // Daher: hier nichts tun, der async-Hook übernimmt.
    }
  }
}

/** Wrapper für vor-Match-Reset. */
export function resetMovementState(): void {
  clearMovementDecisions()
}
