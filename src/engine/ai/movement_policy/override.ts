/**
 * Movement-Policy-Override-Slot.
 *
 * Analog zu src/engine/ai/policy/override.ts (Carrier): Zwischenspeicher
 * für asynchron ermittelte Movement-Entscheidungen. Der Pre-Turn-Async-
 * Hook (in runAIMatch / aiArena) befragt die ML-Policy für jeden Off-Ball-
 * Spieler und legt das Ergebnis hier ab. `decidePositioning` (sync)
 * liest dann.
 */

import type { MovementOption } from './types'

export interface MovementDecision {
  options: MovementOption[]
  chosenIndex: number
  /** Log-prob für PPO-Training (nur bei sample-Mode gesetzt). */
  logProb?: number
  /** Probabilities über alle Optionen (nur bei sample-Mode). */
  probs?: number[]
  source: 'heuristic' | 'ml-policy' | 'custom'
}

let current: Map<string, MovementDecision> = new Map()

export function setMovementDecision(playerId: string, decision: MovementDecision): void {
  current.set(playerId, decision)
}

export function consumeMovementDecision(playerId: string): MovementDecision | null {
  const d = current.get(playerId)
  if (d) current.delete(playerId)
  return d ?? null
}

export function clearMovementDecisions(): void {
  current = new Map()
}

/** Anzahl gespeicherter Decisions (für Diagnose). */
export function movementDecisionCount(): number {
  return current.size
}
