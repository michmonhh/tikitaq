/**
 * TIKITAQ RL — Anti-Hacking-Counter pro Team und Match.
 *
 * Verhindert Reward-Exploits durch wiederholte Aktionen:
 *
 * 1. **Ecken-Hacking**: 3+ Ecken in Folge ohne Torschuss → Reward × 0.33
 * 2. **Foul-Spam**: 3+ gezogene Fouls in Folge → Reward × 0.5
 * 3. **Rückpass-Spam**: 5+ Rückpässe in Folge → −0.2 pro weiterem
 *
 * Counter werden bei runAIMatch.init zurückgesetzt und im Modul-State
 * gehalten. Da immer nur ein Match in einem Prozess läuft, ist Module-
 * Globals hier sicher.
 */

import type { TeamSide } from '../types'

interface TeamCounters {
  /** Ecken in Folge ohne dass das Team einen Schuss abgeben hat */
  cornersInARow: number
  /** Fouls in Folge gezogen (vom Team) */
  foulsDrawnInARow: number
  /** Rückpässe in Folge */
  backwardPassesInARow: number
}

const emptyCounters = (): TeamCounters => ({
  cornersInARow: 0,
  foulsDrawnInARow: 0,
  backwardPassesInARow: 0,
})

let team1: TeamCounters = emptyCounters()
let team2: TeamCounters = emptyCounters()

export function resetRewardState(): void {
  team1 = emptyCounters()
  team2 = emptyCounters()
}

export function getCounters(team: TeamSide): TeamCounters {
  return team === 1 ? team1 : team2
}

// ── Reward-Multiplikatoren basierend auf Counter-Stand ─────────────

export function cornerRewardFactor(team: TeamSide): number {
  const c = getCounters(team).cornersInARow
  if (c >= 3) return 0.33  // 3. Ecke in Folge ohne Torschuss → ⅓
  return 1.0
}

export function foulDrawnRewardFactor(team: TeamSide): number {
  const c = getCounters(team).foulsDrawnInARow
  if (c >= 3) return 0.5
  return 1.0
}

/** Zusätzlicher Malus für Rückpass-Spam (>5 in Folge): −0.2 pro weiterem. */
export function backwardPassExtraMalus(team: TeamSide): number {
  const c = getCounters(team).backwardPassesInARow
  if (c <= 5) return 0
  return -(c - 5) * 0.2
}

// ── State-Updater (werden vor reward-Berechnung aufgerufen) ────────

export function noteCorner(team: TeamSide): void {
  getCounters(team).cornersInARow++
}

export function noteShotByTeam(team: TeamSide): void {
  // Schuss → Ecken-Counter zurück (Angriff hat eine Chance erzeugt)
  getCounters(team).cornersInARow = 0
}

export function noteFoulDrawn(team: TeamSide): void {
  getCounters(team).foulsDrawnInARow++
}

export function notePossessionChange(team: TeamSide): void {
  // Bei Ballverlust/-gewinn werden alle "in Folge"-Counter resettet
  // außer cornersInARow (das ist eine Angriffs-Sequenz)
  const c = getCounters(team)
  c.foulsDrawnInARow = 0
  c.backwardPassesInARow = 0
}

export function noteBackwardPass(team: TeamSide): void {
  getCounters(team).backwardPassesInARow++
}

export function noteForwardPass(team: TeamSide): void {
  getCounters(team).backwardPassesInARow = 0
}
