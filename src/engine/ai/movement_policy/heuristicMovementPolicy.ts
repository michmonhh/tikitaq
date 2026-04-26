/**
 * Default-Implementierung der MovementPolicy: wählt einfach die Option
 * mit höchstem Heuristik-Score. Spiegelt damit das aktuelle Engine-
 * Verhalten — keine Verhaltensänderung wenn diese Policy aktiv ist.
 *
 * Zweck:
 *  1. Fallback-Garant. Wenn keine ML-Policy aktiv ist, ruft die Engine
 *     trotzdem die Heuristik-Sub-Skills via diese Policy auf — das
 *     erlaubt durchgängiges Trajectory-Recording auch im Default-Modus.
 *  2. BC-Lehrer. Trajectories aus dieser Policy sind das Lehrer-Signal
 *     für Behavior-Cloning der ML-Movement-Policy (Tier 2 Phase 2).
 */

import type {
  MovementChoice, MovementContext, MovementInferenceMode,
  MovementOption, MovementPolicy,
} from './types'

export class HeuristicMovementPolicy implements MovementPolicy {
  async decideMovement(
    _ctx: MovementContext,
    options: MovementOption[],
    mode: MovementInferenceMode,
  ): Promise<MovementChoice> {
    if (options.length === 0) {
      return { chosenIndex: 0 }
    }

    // Argmax über Heuristik-Score. Bei mode='sample' fügen wir leichtes
    // Rauschen hinzu, damit Trajectory-Sammlung Exploration enthält.
    if (mode === 'sample') {
      // Softmax mit Temperatur 1.0 über die Scores → Categorical-Sample
      const scores = options.map(o => o.score)
      const maxScore = Math.max(...scores)
      const exp = scores.map(s => Math.exp(s - maxScore))
      const sumExp = exp.reduce((a, b) => a + b, 0)
      const probs = exp.map(e => e / sumExp)

      // Sample
      let r = Math.random()
      let chosen = 0
      for (let i = 0; i < probs.length; i++) {
        r -= probs[i]
        if (r <= 0) {
          chosen = i
          break
        }
      }
      const logProb = Math.log(probs[chosen] + 1e-12)
      return { chosenIndex: chosen, logProb, probs }
    }

    // Argmax-Modus (Default + Production)
    let bestIdx = 0
    let bestScore = -Infinity
    for (let i = 0; i < options.length; i++) {
      if (options[i].score > bestScore) {
        bestScore = options[i].score
        bestIdx = i
      }
    }
    return { chosenIndex: bestIdx }
  }
}

/** Lazily instantiierter Default-Singleton. */
let _defaultInstance: HeuristicMovementPolicy | null = null
export function getDefaultMovementPolicy(): HeuristicMovementPolicy {
  if (!_defaultInstance) _defaultInstance = new HeuristicMovementPolicy()
  return _defaultInstance
}
