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

export interface PolicyChoice {
  /** Index der gewählten Option */
  chosenIndex: number
  /** Log-Wahrscheinlichkeit der gewählten Aktion (für Policy-Gradient) */
  logProb: number
  /** Wahrscheinlichkeitsverteilung über alle valide Options (Länge = numValid) */
  probs: number[]
}

export interface OnnxPolicy {
  /**
   * Wählt eine Option. Im Argmax-Modus deterministisch (für BC-Inferenz),
   * im Sampling-Modus stochastisch entsprechend Softmax (für RL).
   */
  chooseOption(
    state: GameState,
    team: TeamSide,
    carrier: PlayerData,
    options: BallOption[],
    intent: MatchIntent | null,
    mode?: 'argmax' | 'sample',
  ): Promise<number>

  /**
   * Wie chooseOption, gibt aber zusätzlich logProb und Probabilities zurück
   * (gebraucht für RL-Trajectory-Logging).
   */
  chooseOptionWithLogProb(
    state: GameState,
    team: TeamSide,
    carrier: PlayerData,
    options: BallOption[],
    intent: MatchIntent | null,
    mode?: 'argmax' | 'sample',
  ): Promise<PolicyChoice>

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

  /**
   * Numerisch stabile Softmax über die ersten numValid Logits.
   */
  function softmax(logits: Float32Array, numValid: number): number[] {
    let max = -Infinity
    for (let i = 0; i < numValid; i++) {
      if (logits[i] > max) max = logits[i]
    }
    const exps: number[] = new Array(numValid)
    let sum = 0
    for (let i = 0; i < numValid; i++) {
      exps[i] = Math.exp(logits[i] - max)
      sum += exps[i]
    }
    for (let i = 0; i < numValid; i++) exps[i] /= sum
    return exps
  }

  function sampleFromDistribution(probs: number[]): number {
    const r = Math.random()
    let acc = 0
    for (let i = 0; i < probs.length; i++) {
      acc += probs[i]
      if (r <= acc) return i
    }
    return probs.length - 1  // numerischer Fallback
  }

  function pickIndex(scores: Float32Array, numValid: number, mode: 'argmax' | 'sample'): {
    chosenIndex: number; logProb: number; probs: number[]
  } {
    const probs = softmax(scores, numValid)
    let chosen: number
    if (mode === 'sample') {
      chosen = sampleFromDistribution(probs)
    } else {
      // argmax
      chosen = 0
      for (let i = 1; i < numValid; i++) {
        if (probs[i] > probs[chosen]) chosen = i
      }
    }
    const logProb = Math.log(probs[chosen] + 1e-12)  // ε-Schutz vor log(0)
    return { chosenIndex: chosen, logProb, probs }
  }

  return {
    async chooseOption(state, team, carrier, options, intent, mode = 'argmax') {
      const scores = await rawScores(state, team, carrier, options, intent)
      const numOpts = Math.min(options.length, maxOptions)
      const result = pickIndex(scores, numOpts, mode)
      return result.chosenIndex
    },

    async chooseOptionWithLogProb(state, team, carrier, options, intent, mode = 'sample') {
      const scores = await rawScores(state, team, carrier, options, intent)
      const numOpts = Math.min(options.length, maxOptions)
      return pickIndex(scores, numOpts, mode)
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
