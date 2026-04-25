/**
 * Gemeinsames Interface für ONNX-Policies in Node und Browser.
 *
 * Implementations:
 *   - onnxPolicy.ts      → onnxruntime-node (Arena-CLI)
 *   - onnxPolicyWeb.ts   → onnxruntime-web (Browser)
 *
 * Beide liefern das gleiche Interface; der Aufrufer wählt das passende
 * Modul je nach Laufzeit.
 */

import type { GameState, PlayerData, TeamSide } from '../../types'
import type { BallOption } from '../playerDecision/types'
import type { MatchIntent } from '../matchIntent'

export interface PolicyChoice {
  /** Index der gewählten Option */
  chosenIndex: number
  /** Log-Wahrscheinlichkeit der gewählten Aktion (für Policy-Gradient) */
  logProb: number
  /** Wahrscheinlichkeitsverteilung über alle valide Options */
  probs: number[]
}

export interface OnnxPolicy {
  chooseOption(
    state: GameState,
    team: TeamSide,
    carrier: PlayerData,
    options: BallOption[],
    intent: MatchIntent | null,
    mode?: 'argmax' | 'sample',
  ): Promise<number>

  chooseOptionWithLogProb(
    state: GameState,
    team: TeamSide,
    carrier: PlayerData,
    options: BallOption[],
    intent: MatchIntent | null,
    mode?: 'argmax' | 'sample',
  ): Promise<PolicyChoice>

  scoreOptions(
    state: GameState,
    team: TeamSide,
    carrier: PlayerData,
    options: BallOption[],
    intent: MatchIntent | null,
  ): Promise<Float32Array>

  release(): Promise<void>
}
