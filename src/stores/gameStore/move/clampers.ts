import type { PlayerData, Position, TeamSide } from '../../../engine/types'

/**
 * Clamp a target position for kickoff-phase player repositioning.
 * - Own half only (x 4–96, y 3–50 or 50–97)
 * - Non-kicking team must stay outside the 9.65 centre circle
 */
export function clampKickoffTarget(
  player: PlayerData,
  target: Position,
  currentTurn: TeamSide,
): Position {
  const clamped = { ...target }
  if (player.team === 1) clamped.y = Math.max(50, Math.min(97, clamped.y))
  else clamped.y = Math.max(3, Math.min(50, clamped.y))
  clamped.x = Math.max(4, Math.min(96, clamped.x))

  if (player.team !== currentTurn) {
    const dx = clamped.x - 50
    const dy = clamped.y - 50
    const dist = Math.sqrt(dx * dx + dy * dy)
    const minDist = 9.65
    if (dist < minDist) {
      const angle = Math.atan2(dy, dx)
      clamped.x = 50 + Math.cos(angle) * minDist
      clamped.y = 50 + Math.sin(angle) * minDist
    }
  }
  return clamped
}

/**
 * Clamp a target position for penalty-phase player repositioning.
 * - TW snaps to goal line (x 32–68, y fixed at 97 or 3)
 * - Others: anywhere on pitch (x 4–96, y 3–97)
 */
export function clampPenaltyTarget(player: PlayerData, target: Position): Position {
  if (player.positionLabel === 'TW') {
    const goalLineY = player.team === 1 ? 97 : 3
    return { x: Math.max(32, Math.min(68, target.x)), y: goalLineY }
  }
  return {
    x: Math.max(4, Math.min(96, target.x)),
    y: Math.max(3, Math.min(97, target.y)),
  }
}

/**
 * Clamp a target position for set-piece-phase (free kick / corner / throw-in)
 * player repositioning. Anywhere on pitch within bounds.
 */
export function clampSetPieceTarget(target: Position): Position {
  return {
    x: Math.max(4, Math.min(96, target.x)),
    y: Math.max(3, Math.min(97, target.y)),
  }
}
