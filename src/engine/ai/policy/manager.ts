/**
 * Globaler Policy-Slot für die Engine-AI.
 *
 * Wenn eine Policy registriert ist, wird sie im `executeAITurn` automatisch
 * für die Ballführer-Entscheidung des konfigurierten Teams genutzt — statt
 * der Heuristik. Damit kann der Browser-Match-Screen einfach beim Setup
 * eine geladene ONNX-Policy aktivieren, ohne den restlichen Flow zu ändern.
 *
 * Nutzung im Browser:
 *   const policy = await loadOnnxPolicyWeb('/rl_policy.onnx')
 *   setActivePolicy({ policy, teams: 'all' })
 *
 * Nutzung in Arena-CLI bleibt unverändert (eigener onBeforeAITurn-Hook in
 * runAIMatch — beide Wege sind gleichberechtigt).
 */

import type { TeamSide } from '../../types'
import type { OnnxPolicy } from './types'

export interface ActivePolicy {
  policy: OnnxPolicy
  /** 'all' = beide Teams; 1 oder 2 = nur ein Team (für A/B). */
  teams: TeamSide | 'all'
  /** 'argmax' (deterministisch) für Spielen, 'sample' für Trajectory-Sammeln. */
  mode: 'argmax' | 'sample'
}

let active: ActivePolicy | null = null

export function setActivePolicy(p: ActivePolicy | null): void {
  active = p
}

export function getActivePolicy(): ActivePolicy | null {
  return active
}

export function clearActivePolicy(): void {
  active = null
}

/**
 * Prüft ob die aktuelle Policy für ein bestimmtes Team aktiv ist.
 */
export function isPolicyActiveForTeam(team: TeamSide): boolean {
  if (!active) return false
  return active.teams === 'all' || active.teams === team
}
