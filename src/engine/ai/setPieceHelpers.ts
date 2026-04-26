/**
 * Shared helpers for set-piece positioning.
 */

import type { PlayerData, Position, PlayerAction, TeamSide } from '../types'
import { PITCH } from '../constants'

/** Goal-line y for the team's OWN goal (the end they defend). */
export function ownGoalY(team: TeamSide): number {
  return team === 1 ? 100 : 0
}

/** Goal-line y for the team's attacking goal (the end they score at). */
export function attackGoalY(team: TeamSide): number {
  return team === 1 ? 0 : 100
}

/** Center of the goal the team is ATTACKING. */
export function attackGoalCenter(team: TeamSide): Position {
  return { x: 50, y: attackGoalY(team) }
}

/** Center of the team's OWN goal. */
export function ownGoalCenter(team: TeamSide): Position {
  return { x: 50, y: ownGoalY(team) }
}

/**
 * How far the ball is from the opponent's goal line, measured in the
 * attacking direction. Lower values = closer to scoring.
 */
export function distToAttackGoal(ballY: number, team: TeamSide): number {
  return Math.abs(ballY - attackGoalY(team))
}

/**
 * Shift a y-coordinate toward the team's attacking direction.
 * Positive `amount` moves TOWARD the opponent's goal.
 */
export function shiftToward(baseY: number, amount: number, team: TeamSide): number {
  return team === 1 ? baseY - amount : baseY + amount
}

/** Clamp x/y to the playable pitch area. */
export function clamp(pos: Position): Position {
  return {
    x: Math.max(PITCH.MIN_X, Math.min(PITCH.MAX_X, pos.x)),
    y: Math.max(PITCH.MIN_Y, Math.min(PITCH.MAX_Y, pos.y)),
  }
}

/** Check if a position label represents a defender. */
export function isDefender(label: string): boolean {
  return label === 'IV' || label === 'LV' || label === 'RV'
}

/** Check if a position label represents an attacker or attacking midfielder. */
export function isAttacker(label: string): boolean {
  return label === 'ST' || label === 'OM'
}

/** Check if a position label represents a midfielder (not OM). */
export function isMidfielder(label: string): boolean {
  return label === 'ZDM' || label === 'ZM' || label === 'LM' || label === 'RM'
}

/** Build a move action for a player. */
export function moveAction(player: { id: string }, target: Position): PlayerAction {
  return { type: 'move', playerId: player.id, target: clamp(target) }
}

/**
 * Minimum distance between player centres (60% of disc diameter).
 * Disc radius = 4 game units → diameter 8 → 60% = 4.8, rounded to 5.
 */
const MIN_SPACING = 5

/**
 * Push overlapping players apart so no two centres are closer than MIN_SPACING.
 * `fixedPositions` are positions that won't move (e.g. ball carrier, keeper).
 * When a push hits the pitch boundary, tries perpendicular direction instead.
 */
export function enforceSpacing(actions: PlayerAction[], fixedPositions: Position[] = []): void {
  const placed: Position[] = [...fixedPositions]

  for (const action of actions) {
    if (action.type !== 'move') continue

    const pos = { ...action.target }

    for (let iter = 0; iter < 12; iter++) {
      // Find closest conflict
      let closestDist = MIN_SPACING
      let closestIdx = -1
      for (let i = 0; i < placed.length; i++) {
        const dx = pos.x - placed[i].x
        const dy = pos.y - placed[i].y
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < closestDist) { closestDist = d; closestIdx = i }
      }
      if (closestIdx === -1) break

      const other = placed[closestIdx]
      const dx = pos.x - other.x
      const dy = pos.y - other.y
      const dist = closestDist
      const push = MIN_SPACING - dist + 0.3

      if (dist < 0.1) {
        // Nearly coincident: try x push, fall back to y if boundary blocks
        const prevX = pos.x
        pos.x += MIN_SPACING * 0.7
        pos.x = Math.max(PITCH.MIN_X, Math.min(PITCH.MAX_X, pos.x))
        if (Math.abs(pos.x - prevX) < 1) {
          pos.y += MIN_SPACING * 0.7
        }
      } else {
        // Push along the line away from the other player
        pos.x += (dx / dist) * push
        pos.y += (dy / dist) * push
      }

      // Clamp to pitch boundaries
      pos.x = Math.max(PITCH.MIN_X, Math.min(PITCH.MAX_X, pos.x))
      pos.y = Math.max(PITCH.MIN_Y, Math.min(PITCH.MAX_Y, pos.y))

      // Check if still overlapping after clamp (boundary blocked the push)
      const newDx = pos.x - other.x
      const newDy = pos.y - other.y
      const newDist = Math.sqrt(newDx * newDx + newDy * newDy)
      if (newDist < MIN_SPACING && dist > 0.1) {
        // Push perpendicular (slide along boundary)
        const perpPush = MIN_SPACING - newDist + 0.5
        pos.x += (-dy / dist) * perpPush
        pos.y += (dx / dist) * perpPush
        pos.x = Math.max(PITCH.MIN_X, Math.min(PITCH.MAX_X, pos.x))
        pos.y = Math.max(PITCH.MIN_Y, Math.min(PITCH.MAX_Y, pos.y))
      }
    }

    action.target = clamp(pos)
    placed.push({ ...action.target })
  }
}

/**
 * After both teams are repositioned, push any cross-team overlaps apart.
 * Modifies player positions in-place.  `fixedIds` (e.g. ball carrier) are untouched.
 */
/**
 * FIFA-konformer Mindestabstand vom Ball für Gegner bei Standards.
 * Freistoß / Ecke / Einwurf: 9.15 m (wir nutzen 9.15 Pitch-Einheiten,
 * weil PITCH-Koordinaten grob ~1 Einheit ≈ 1 m approximieren).
 */
export const SET_PIECE_OPP_MIN_DIST = 9.15

/**
 * Alle Gegner des kickenden Teams mindestens `minDist` vom Ball weg schieben.
 * In-place Mutation der player.position. Eigene Spieler und der Taker
 * bleiben unangetastet.
 */
export function enforceOpponentMinDistFromBall(
  players: PlayerData[],
  ballPos: Position,
  kickingTeam: TeamSide,
  minDist: number = SET_PIECE_OPP_MIN_DIST,
): void {
  for (const p of players) {
    if (p.team === kickingTeam) continue
    if (p.positionLabel === 'TW') continue  // Keeper darf nah am eigenen Tor
    const dx = p.position.x - ballPos.x
    const dy = p.position.y - ballPos.y
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d >= minDist) continue
    if (d < 0.1) {
      // Exakt auf dem Ball — nach hinten (Richtung eigenes Tor) schieben
      const awayY = p.team === 1 ? ballPos.y + minDist : ballPos.y - minDist
      p.position = clamp({ x: ballPos.x, y: awayY })
    } else {
      const ux = dx / d
      const uy = dy / d
      p.position = clamp({ x: ballPos.x + ux * minDist, y: ballPos.y + uy * minDist })
    }
  }
}

export function enforceCrossTeamSpacing(
  players: { id: string; position: Position }[],
  fixedIds: Set<string>,
): void {
  for (let pass = 0; pass < 6; pass++) {
    let anyPush = false
    for (let i = 0; i < players.length; i++) {
      if (fixedIds.has(players[i].id)) continue
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i]
        const b = players[j]
        const dx = a.position.x - b.position.x
        const dy = a.position.y - b.position.y
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d >= MIN_SPACING) continue

        anyPush = true
        const push = (MIN_SPACING - d + 0.3) / 2

        if (d < 0.1) {
          // Nearly coincident — push apart on both axes
          const movA = fixedIds.has(a.id) ? 0 : 1
          const movB = fixedIds.has(b.id) ? 0 : 1
          if (movA) a.position = clamp({ x: a.position.x + 3, y: a.position.y + 2 })
          if (movB) b.position = clamp({ x: b.position.x - 3, y: b.position.y - 2 })
        } else {
          const ux = dx / d
          const uy = dy / d
          if (!fixedIds.has(a.id)) {
            a.position = clamp({ x: a.position.x + ux * push, y: a.position.y + uy * push })
          }
          if (!fixedIds.has(b.id)) {
            b.position = clamp({ x: b.position.x - ux * push, y: b.position.y - uy * push })
          }
        }
      }
    }
    if (!anyPush) break
  }
}
