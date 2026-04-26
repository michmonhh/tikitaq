/**
 * TIKITAQ AI — Off-Ball Movement Policy (Tier 2)
 * ===============================================
 *
 * Die existierende Carrier-Policy (src/engine/ai/policy/*) entscheidet,
 * was der Ball-Carrier tut. Tier 2 fügt eine PARALLELE Policy für jeden
 * NICHT-Carrier-Spieler hinzu, die seine Bewegung wählt.
 *
 * Architektur ist 1:1 zur Carrier-Policy:
 *   - Kontextabhängig generierte Optionen (variable Anzahl, 4-7 typisch)
 *   - Jede Option hat ein konkretes Target (von Sub-Heuristik berechnet)
 *   - Policy wählt via Softmax aus den Optionen
 *
 * Damit ist die ML-Schicht hierarchisch: sie entscheidet das **WAS**
 * (welche taktische Sub-Aktion), nicht das **WIE** (Pixel-Geometrie).
 * Die Sub-Heuristiken in positioning/defensive.ts, offensive.ts, etc.
 * werden als "Sub-Skills" wiederverwendet.
 *
 * Personality-Erhalt: derselbe Sub-Skill produziert für verschiedene
 * Spieler andere Targets, weil die Heuristik die Spieler-Stats liest
 * (defensiveRadius, pacing, anticipation aus Stats etc.).
 */

import type { GameState, Position, TeamSide, PlayerData } from '../../types'
import type { TeamPlan, FieldReading } from '../types'

/**
 * Semantische Movement-Aktionen. Jede entspricht einer existierenden
 * Sub-Heuristik in positioning/. Die Policy wählt zwischen den hier
 * verfügbaren — nicht alle sind in jeder Situation sinnvoll, daher
 * generiert der Options-Generator pro State nur die passenden.
 */
export type MovementOptionType =
  | 'defensive_position'    // klassische Defensiv-Position aus defensive.ts
  | 'offensive_position'    // klassische Offensiv-Position aus offensive.ts
  | 'press_carrier'         // sprintet auf den Ballführer zu
  | 'block_pass_lane'       // schließt eine konkrete Pass-Linie ab
  | 'man_marking'           // markiert einen spezifischen Gegner
  | 'cover_counter'         // bleibt defensiv als Konter-Anker
  | 'overlap_run'           // hochrückender Außen-Run für Flanken
  | 'cut_inside'            // diagonal in den Halbraum
  | 'support_carrier'       // bietet sich als Pass-Empfänger an
  | 'stay'                  // halte aktuelle Position

export interface MovementOption {
  type: MovementOptionType
  /** Konkretes Ziel im Spielfeld (0..100 × 0..100) */
  target: Position
  /** Heuristik-Score [0..1] — höhere = situativ sinnvoller. Optional für
   *  BC-Pretraining (Imitations-Lernen aus heuristischer Wahl). */
  score: number
  /** Optional: Bezug zu einem konkreten Spieler (z.B. bei man_marking
   *  oder block_pass_lane = der zu deckende/blockende Spieler-ID). */
  contextId?: string
}

/**
 * Eingabe-Kontext für den Options-Generator und Policy.
 * Bündelt alle Daten, die eine Sub-Heuristik bzw. die Policy braucht.
 */
export interface MovementContext {
  state: GameState
  team: TeamSide
  player: PlayerData
  plan: TeamPlan | null
  fieldReading: FieldReading | null
  /** Pressers für diese Runde (pre-computed in positioning.ts) */
  pressers: Set<string>
  hasBall: boolean
  ballLoose: boolean
}

/**
 * Inferenz-Modus. Identisch zur Carrier-Policy:
 * - 'argmax': deterministisch wähle Option mit höchstem Score
 * - 'sample': stochastisch sampeln (für Trajectory-Sammlung mit Exploration)
 */
export type MovementInferenceMode = 'argmax' | 'sample'

/**
 * Ergebnis einer Policy-Entscheidung.
 */
export interface MovementChoice {
  chosenIndex: number
  /** Log-Wahrscheinlichkeit der gewählten Option (für PPO). */
  logProb?: number
  /** Vollständige Wahrscheinlichkeitsverteilung über Optionen. */
  probs?: number[]
}

/**
 * Interface aller Movement-Policies. Die heuristische Default-Policy
 * implementiert das (max-score-pick), und ML-Policies (ONNX-geladen)
 * ebenfalls.
 */
export interface MovementPolicy {
  /**
   * Wählt eine Option für den gegebenen Spieler.
   * Async erlaubt ML-Inferenz (ONNX) ohne Engine-Loop zu blockieren.
   */
  decideMovement(
    ctx: MovementContext,
    options: MovementOption[],
    mode: MovementInferenceMode,
  ): Promise<MovementChoice>
}
