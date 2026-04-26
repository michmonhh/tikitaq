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

/**
 * Distance matching the visual circle on the canvas.
 * The canvas draws circles using toScreenDistance which averages X/Y scale.
 * Pitch aspect is 2:3 (width:height), so scaleX < scaleY.
 * This function weights dx/dy to match the on-screen circle.
 */
export function visualDistance(a: Position, b: Position): number {
  // Pitch is rendered at 2:3 aspect, so pitchW/pitchH = 2/3
  // scaleX = pitchW/100, scaleY = pitchH/100
  // avgScale = (scaleX + scaleY) / 2
  // In game coords: screenDist = sqrt((dx*scaleX)^2 + (dy*scaleY)^2)
  // But the circle uses avgScale for radius, so we need:
  // sqrt((dx*scaleX/avgScale)^2 + (dy*scaleY/avgScale)^2) <= radius
  const pitchRatio = 2 / 3 // pitchW / pitchH
  const avgFactor = (pitchRatio + 1) / 2 // average of pitchRatio and 1
  const wx = pitchRatio / avgFactor
  const wy = 1 / avgFactor
  const dx = (a.x - b.x) * wx
  const dy = (a.y - b.y) * wy
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Clamp a position to a circle around an origin.
 * Uses visualDistance so the constraint matches the circle drawn on screen.
 */
export function clampToRadius(
  pos: Position,
  origin: Position,
  radius: number
): Position {
  const dist = visualDistance(pos, origin)
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
  // Fitness reduces movement: at 100% fitness = full radius, at 5% = 50% radius
  const fitnessFactor = 0.5 + (player.fitness / 100) * 0.5
  return MOVEMENT.BASE_RADIUS * factor * fitnessFactor
}

export function getPassRadius(player: PlayerData): number {
  const factor = PASSING.MIN_FACTOR + player.stats.highPassing * PASSING.STAT_WEIGHT
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
    case 'ZDM': case 'ZM': case 'LM': case 'RM': case 'OM':
      return INTERCEPTION.MIDFIELDER_RADIUS
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
