/**
 * Slot für die letzte Ballführer-Entscheidung des aktuellen Turns.
 *
 * `decideBallAction` (oder der Policy-Hook) füllt den Slot mit
 *   - State-Snapshot VOR der Entscheidung
 *   - Option-Liste + chosenIndex
 *   - optional log_prob (für RL)
 *
 * Der Orchestrator (`runAIMatch`) liest und konsumiert ihn nach dem Turn:
 *   - State-Snapshot NACH der Entscheidung wird hinzugefügt
 *   - Reward wird über `computeStepReward(before, after, team, event)` berechnet
 *   - `recordDecision(...)` wird mit allen Feldern aufgerufen
 */

import type { GameState, PlayerData, TeamSide } from '../../types'
import type { BallOption } from '../playerDecision/types'

export interface LastDecision {
  state: GameState           // State VOR dem Turn (für Reward-Berechnung)
  team: TeamSide
  carrier: PlayerData
  options: BallOption[]
  chosenIndex: number
  /** Nur gesetzt wenn ONNX-Policy mit log_prob entschieden hat */
  logProb?: number
  probs?: number[]
}

let current: LastDecision | null = null

export function setLastDecision(d: LastDecision): void {
  current = d
}

export function consumeLastDecision(): LastDecision | null {
  const d = current
  current = null
  return d
}

export function clearLastDecision(): void {
  current = null
}
