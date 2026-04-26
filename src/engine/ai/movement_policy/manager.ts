/**
 * Globaler Slot für die aktive Movement-Policy.
 *
 * Im Default-Spielbetrieb ist KEINE ML-Policy registriert — die Engine
 * nutzt dann die existierenden Heuristiken in positioning/. Wenn eine
 * Movement-Policy registriert wird (im Browser oder im Trainings-Loop),
 * wird sie pro Off-Ball-Spieler abgefragt.
 *
 * Spiegel zur Carrier-Policy in src/engine/ai/policy/manager.ts.
 */

import type { TeamSide } from '../../types'
import type { MovementInferenceMode, MovementPolicy } from './types'

interface ActiveMovementPolicy {
  policy: MovementPolicy
  teams: TeamSide | 'all'   // welche Teams nutzen die Policy?
  mode: MovementInferenceMode
}

let active: ActiveMovementPolicy | null = null

export function setActiveMovementPolicy(p: ActiveMovementPolicy | null): void {
  active = p
}

export function getActiveMovementPolicy(): ActiveMovementPolicy | null {
  return active
}

/** True wenn für dieses Team eine Movement-Policy registriert ist. */
export function isMovementPolicyActiveForTeam(team: TeamSide): boolean {
  if (!active) return false
  return active.teams === 'all' || active.teams === team
}

export function clearActiveMovementPolicy(): void {
  active = null
}
