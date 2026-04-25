/**
 * Browser-Variante des ONNX-Policy-Loaders (onnxruntime-web).
 *
 * Identische Schnittstelle wie `onnxPolicy.ts` (Node-Variante), nur das
 * Backend ist anders. Wird von der React-UI in Arena-Screen und Match-
 * Screen genutzt.
 */

import * as ort from 'onnxruntime-web'
import type { GameState, PlayerData, TeamSide } from '../../types'
import type { BallOption } from '../playerDecision/types'
import type { MatchIntent } from '../matchIntent'
import {
  encodeStateForPolicy,
  GLOBAL_FEATURE_DIM,
  OPTION_FEATURE_DIM,
} from './features'
import type { OnnxPolicy, PolicyChoice } from './types'

/**
 * Lädt das ONNX-Modell aus einer URL (z.B. `/bc_policy.onnx`).
 * Im Browser-Build sollte das Modell als statisches Asset in `public/`
 * verfügbar sein.
 */
export async function loadOnnxPolicyWeb(
  modelUrl: string,
  maxOptions: number = 16,
): Promise<OnnxPolicy> {
  // Wir verwenden den WASM-Backend von onnxruntime-web (kompatibel mit
  // allen Browsern, kein WebGPU nötig).
  const session = await ort.InferenceSession.create(modelUrl, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  })

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
    const scoresTensor = results['scores']
    if (!scoresTensor) {
      throw new Error(`ONNX-Output hat nicht "scores": ${Object.keys(results)}`)
    }
    return scoresTensor.data as Float32Array
  }

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
    return probs.length - 1
  }

  function pickIndex(scores: Float32Array, numValid: number, mode: 'argmax' | 'sample'): PolicyChoice {
    const probs = softmax(scores, numValid)
    let chosen: number
    if (mode === 'sample') {
      chosen = sampleFromDistribution(probs)
    } else {
      chosen = 0
      for (let i = 1; i < numValid; i++) {
        if (probs[i] > probs[chosen]) chosen = i
      }
    }
    const logProb = Math.log(probs[chosen] + 1e-12)
    return { chosenIndex: chosen, logProb, probs }
  }

  return {
    async chooseOption(state, team, carrier, options, intent, mode = 'argmax') {
      const scores = await rawScores(state, team, carrier, options, intent)
      const numOpts = Math.min(options.length, maxOptions)
      const result = pickIndex(scores, numOpts, mode)
      return result.chosenIndex
    },

    async chooseOptionWithLogProb(state, team, carrier, options, intent, mode = 'argmax') {
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
