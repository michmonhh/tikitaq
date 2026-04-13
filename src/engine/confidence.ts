import type { PlayerData } from './types'

/**
 * Adjust a player's confidence based on an event.
 * Confidence ranges from 0-100, starting at 50.
 * Affects dribbling, passing, shooting, and tackle success.
 */
export function adjustConfidence(player: PlayerData, event: ConfidenceEvent): PlayerData {
  const delta = CONFIDENCE_DELTAS[event] ?? 0
  const newConfidence = Math.max(0, Math.min(100, player.confidence + delta))
  return { ...player, confidence: newConfidence }
}

export type ConfidenceEvent =
  | 'pass_complete'
  | 'pass_failed'
  | 'shot_scored'
  | 'shot_saved'
  | 'shot_missed'
  | 'tackle_won'
  | 'tackle_lost'
  | 'dribble_success'
  | 'dribble_failed'
  | 'intercept'
  | 'got_intercepted'
  | 'assist'

const CONFIDENCE_DELTAS: Record<ConfidenceEvent, number> = {
  pass_complete: 2,
  pass_failed: -3,
  shot_scored: 15,
  shot_saved: -2,
  shot_missed: -5,
  tackle_won: 5,
  tackle_lost: -4,
  dribble_success: 8,
  dribble_failed: -6,
  intercept: 4,
  got_intercepted: -3,
  assist: 10,
}

/**
 * Get the confidence modifier for action success probability.
 * Returns a multiplier: 0.85 (low confidence) to 1.15 (high confidence).
 */
export function getConfidenceModifier(player: PlayerData): number {
  // 0 confidence → 0.85x, 50 → 1.0x, 100 → 1.15x
  return 0.85 + (player.confidence / 100) * 0.3
}
