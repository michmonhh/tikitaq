/**
 * TIKITAQ — ONNX-Policy-Loader für Node-Inferenz.
 *
 * Lädt ein trainiertes BC-Netz (als .onnx-Datei, exportiert von
 * ml/export_onnx.py) und liefert eine Policy-Funktion, die für einen
 * gegebenen State + Optionen die beste Option zurückgibt.
 *
 * Funktioniert nur in Node (onnxruntime-node). Für Browser würden wir
 * onnxruntime-web nutzen — selber Code, anderes Import.
 *
 * Nutzung:
 *   const policy = await loadOnnxPolicy('/path/to/bc_policy.onnx')
 *   const chosenIdx = await policy.chooseOption(state, team, carrier, options, intent)
 *   const bestOption = options[chosenIdx]
 */

import * as ort from 'onnxruntime-node'
import type { GameState, PlayerData, TeamSide } from '../../types'
import type { BallOption } from '../playerDecision/types'
import type { MatchIntent } from '../matchIntent'
import {
  encodeStateForPolicy,
  GLOBAL_FEATURE_DIM,
  OPTION_FEATURE_DIM,
} from './features'

export interface OnnxPolicy {
  /** Wählt den Index der besten Option per Forward-Pass durchs Netz. */
  chooseOption(
    state: GameState,
    team: TeamSide,
    carrier: PlayerData,
    options: BallOption[],
    intent: MatchIntent | null,
  ): Promise<number>

  /** Gibt die rohen Logits pro Option zurück (für Debugging / log-probs). */
  scoreOptions(
    state: GameState,
    team: TeamSide,
    carrier: PlayerData,
    options: BallOption[],
    intent: MatchIntent | null,
  ): Promise<Float32Array>

  /** Räumt die ONNX-Session auf. */
  release(): Promise<void>
}

/**
 * Lädt das ONNX-Modell und gibt eine Policy zurück.
 *
 * @param modelPath Pfad zur .onnx-Datei
 * @param maxOptions Muss zum Training passen (Default 16).
 */
export async function loadOnnxPolicy(
  modelPath: string,
  maxOptions: number = 16,
): Promise<OnnxPolicy> {
  const session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ['cpu'],  // Node hat kein MPS, CPU reicht für Inferenz
    graphOptimizationLevel: 'all',
  })

  // Input-Namen validieren
  const inputNames = session.inputNames
  const expected = ['global', 'options', 'mask']
  for (const name of expected) {
    if (!inputNames.includes(name)) {
      throw new Error(
        `ONNX-Modell hat falsche Input-Namen: erwartet ${expected}, bekommen ${inputNames}`,
      )
    }
  }

  async function rawScores(
    state: GameState,
    team: TeamSide,
    carrier: PlayerData,
    options: BallOption[],
    intent: MatchIntent | null,
  ): Promise<Float32Array> {
    const enc = encodeStateForPolicy(state, team, carrier, options, intent, maxOptions)

    // Batch-Dimension 1, shape [1, GLOBAL_DIM]
    const globalTensor = new ort.Tensor('float32', enc.globalFeat, [1, GLOBAL_FEATURE_DIM])
    const optionsTensor = new ort.Tensor(
      'float32', enc.optionsFlat, [1, maxOptions, OPTION_FEATURE_DIM],
    )
    const maskTensor = new ort.Tensor('float32', enc.mask, [1, maxOptions])

    const results = await session.run({
      global: globalTensor,
      options: optionsTensor,
      mask: maskTensor,
    })

    // Output "scores" hat shape [1, maxOptions]
    const scoresTensor = results['scores']
    if (!scoresTensor) {
      throw new Error(`ONNX-Output hat nicht "scores": ${Object.keys(results)}`)
    }
    return scoresTensor.data as Float32Array
  }

  return {
    async chooseOption(state, team, carrier, options, intent) {
      const scores = await rawScores(state, team, carrier, options, intent)
      const numOpts = Math.min(options.length, maxOptions)
      // Argmax nur über valide Optionen (erste numOpts)
      let bestIdx = 0
      let bestScore = -Infinity
      for (let i = 0; i < numOpts; i++) {
        if (scores[i] > bestScore) {
          bestScore = scores[i]
          bestIdx = i
        }
      }
      return bestIdx
    },

    scoreOptions(state, team, carrier, options, intent) {
      return rawScores(state, team, carrier, options, intent)
    },

    async release() {
      await session.release()
    },
  }
}

/**
 * Synchrone Policy-Variante: wenn das Netz schon geladen ist, können wir
 * den Forward-Pass blockierend aufrufen. onnxruntime-node's session.run
 * ist aber async — wir wrappen trotzdem, um die Signatur einheitlich zu
 * halten.
 */
