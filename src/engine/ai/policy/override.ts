/**
 * TIKITAQ — Policy-Override-Slot.
 *
 * Zwischenspeicher für eine asynchron ermittelte Ballführer-Entscheidung
 * (z.B. vom ONNX-Netz). Der `runAIMatch`-Orchestrator füllt den Slot vor
 * `executeAITurn`, und `decideBallAction` liest ihn am Anfang aus.
 *
 * Damit muss die eigentliche Entscheidungs-Pipeline nicht auf async
 * umgestellt werden — nur der Orchestrator wartet einmal auf das Netz,
 * der Rest läuft wie gehabt synchron.
 */

import type { BallOption } from '../playerDecision/types'

export interface PolicyDecision {
  /** Pre-generierte Option-Liste (muss im decideBallAction identisch sein) */
  options: BallOption[]
  /** Index der gewählten Option */
  chosenIndex: number
  /** Provenance-Marker für Logging/Reasoning */
  source: 'bc-policy' | 'custom'
}

let current: Map<string, PolicyDecision> = new Map()

/**
 * Setzt die Policy-Entscheidung für einen bestimmten Spieler im
 * aktuellen Turn. Wird von `decideBallAction` einmal verbraucht.
 */
export function setPolicyDecision(playerId: string, decision: PolicyDecision): void {
  current.set(playerId, decision)
}

/**
 * Konsumiert die Entscheidung für einen Spieler (löscht sie danach).
 */
export function consumePolicyDecision(playerId: string): PolicyDecision | null {
  const d = current.get(playerId)
  if (d) current.delete(playerId)
  return d ?? null
}

/** Alle Einträge löschen — zwischen Matches. */
export function clearPolicyDecisions(): void {
  current = new Map()
}
