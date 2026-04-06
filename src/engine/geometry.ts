import type { Position, PlayerData } from './types'
import { PITCH, MOVEMENT, PASSING, INTERCEPTION, TACKLING } from './constants'

/**
 * Euclidean distance between two positions, corrected for the visual
 * aspect ratio of the 3D-perspective pitch. Horizontal distances are
 * perceived as longer than vertical ones due to the tilt.
 */
export function distance(a: Position, b: Position): number {
  const dx = (a.x - b.x) * PITCH.ASPECT_RATIO
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

/** Raw (non-aspect-corrected) distance — used for pure coordinate math. */
export function rawDistance(a: Position, b: Position): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Shortest distance from a point to a line segment (a→b).
 * Used for checking if a player can intercept a pass lane.
 */
export function pointToSegmentDistance(
  point: Position,
  segA: Position,
  segB: Position
): number {
  const ax = (segB.x - segA.x) * PITCH.ASPECT_RATIO
  const ay = segB.y - segA.y
  const bx = (point.x - segA.x) * PITCH.ASPECT_RATIO
  const by = point.y - segA.y

  const lenSq = ax * ax + ay * ay
  if (lenSq === 0) return distance(point, segA)

  const t = Math.max(0, Math.min(1, (bx * ax + by * ay) / lenSq))
  const projX = segA.x + t * (segB.x - segA.x)
  const projY = segA.y + t * (segB.y - segA.y)

  return distance(point, { x: projX, y: projY })
}

/** Clamp a position within pitch boundaries. */
export function clampToPitch(pos: Position): Position {
  return {
    x: Math.max(PITCH.MIN_X, Math.min(PITCH.MAX_X, pos.x)),
    y: Math.max(PITCH.MIN_Y, Math.min(PITCH.MAX_Y, pos.y)),
  }
}

/** Clamp a position to a circle around an origin. */
export function clampToRadius(
  pos: Position,
  origin: Position,
  radius: number
): Position {
  const dist = distance(pos, origin)
  if (dist <= radius) return pos

  const ratio = radius / dist
  return {
    x: origin.x + (pos.x - origin.x) * ratio,
    y: origin.y + (pos.y - origin.y) * ratio,
  }
}

// --- Radius Calculations (stat-driven) ---

export function getMovementRadius(player: PlayerData): number {
  const factor = MOVEMENT.MIN_FACTOR + player.stats.pacing * MOVEMENT.STAT_WEIGHT
  return MOVEMENT.BASE_RADIUS * factor
}

export function getPassRadius(player: PlayerData): number {
  const factor = PASSING.MIN_FACTOR + player.stats.longPassing * PASSING.STAT_WEIGHT
  return PASSING.BASE_RADIUS * factor
}

export function getTackleRadius(player: PlayerData): number {
  const factor = TACKLING.MIN_FACTOR + player.stats.defensiveRadius * TACKLING.STAT_WEIGHT
  return TACKLING.BASE_RADIUS * factor
}

export function getInterceptRadius(player: PlayerData): number {
  switch (player.positionLabel) {
    case 'TW': return INTERCEPTION.GOALKEEPER_RADIUS
    case 'IV': case 'LV': case 'RV': return INTERCEPTION.DEFENDER_RADIUS
    case 'ZDM': case 'LM': case 'RM': case 'OM': return INTERCEPTION.MIDFIELDER_RADIUS
    case 'ST': return INTERCEPTION.FORWARD_RADIUS
    default: return INTERCEPTION.MIDFIELDER_RADIUS
  }
}

/** Linear interpolation between two positions. */
export function lerp(a: Position, b: Position, t: number): Position {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  }
}

/** Angle from a to b in radians. */
export function angle(a: Position, b: Position): number {
  return Math.atan2(b.y - a.y, b.x - a.x)
}
