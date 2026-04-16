import type { PlayerData, BallData, Position } from '../../engine/types'
import { rawDistance } from '../../engine/geometry'
import type { DragTarget } from './types'

export interface PickerContext {
  pos: Position
  players: PlayerData[]
  ball: BallData
  currentTeam: 1 | 2
  localTeam: 1 | 2 | null
  hitRadius: number
  isKickoffPhase: boolean
  allowDirectPassInSetPiece: boolean
  mustPass: boolean
  penaltyMode: 'shooter' | 'keeper' | null
}

export function findClosestPlayer(
  players: PlayerData[], pos: Position, team: 1 | 2, maxDist: number,
): PlayerData | null {
  let closest: PlayerData | null = null
  let closestDist = maxDist
  for (const player of players) {
    if (player.team !== team) continue
    const dist = rawDistance(pos, player.position)
    if (dist < closestDist) {
      closestDist = dist
      closest = player
    }
  }
  return closest
}

export function findClosestPlayerAnyTeam(
  players: PlayerData[], pos: Position, maxDist: number,
): PlayerData | null {
  let closest: PlayerData | null = null
  let closestDist = maxDist
  for (const player of players) {
    const dist = rawDistance(pos, player.position)
    if (dist < closestDist) {
      closestDist = dist
      closest = player
    }
  }
  return closest
}

/** Ball is drawn offset from the carrier — match that offset for hit-testing. */
function ballDisplayPos(ball: BallData, ballOwner: PlayerData | null): Position {
  return ballOwner
    ? { x: ballOwner.position.x + 2.5, y: ballOwner.position.y + 1.5 }
    : ball.position
}

function findBallOwner(players: PlayerData[], ball: BallData): PlayerData | null {
  return ball.ownerId ? players.find(p => p.id === ball.ownerId) ?? null : null
}

/**
 * Decide what the pointer-down grabs: ball, a player, or nothing (→ caller may pan).
 * Mirrors the branching in InputHandler.handlePointerDown for each phase.
 */
export function pickDragTarget(ctx: PickerContext): DragTarget {
  const { pos, players, ball, currentTeam, localTeam, hitRadius } = ctx

  // Must pass (playing phase right after kickoff): only ball interaction
  // allowed for the active team, no player movement. Set piece phases are
  // handled below so the taker can still reposition teammates freely.
  if (ctx.mustPass && !ctx.isKickoffPhase) {
    const ballOwner = findBallOwner(players, ball)
    if (ballOwner && ballOwner.team === currentTeam) {
      const distToBall = rawDistance(pos, ballDisplayPos(ball, ballOwner))
      if (distToBall < hitRadius) return { type: 'ball' }
    }
    return null
  }

  // Penalty mode: both sides can reposition own players freely
  if (ctx.penaltyMode) {
    const activeTeam = localTeam ?? currentTeam
    if (ctx.penaltyMode === 'shooter') {
      const ballOwner = findBallOwner(players, ball)
      const canClickBall = ballOwner && ballOwner.team === activeTeam
      const distToBall = canClickBall
        ? rawDistance(pos, ballDisplayPos(ball, ballOwner))
        : Infinity
      if (distToBall < hitRadius) return { type: 'ball' }

      // Otherwise allow dragging own players (except ball carrier)
      const clickedPlayer = findClosestPlayer(players, pos, activeTeam, hitRadius)
      if (clickedPlayer && clickedPlayer.id !== ball.ownerId) {
        return { type: 'player', player: clickedPlayer }
      }
    } else {
      // Keeper: allow dragging any own team player (free positioning)
      const clickedPlayer = findClosestPlayer(players, pos, activeTeam, hitRadius)
      if (clickedPlayer) return { type: 'player', player: clickedPlayer }
    }
    return null
  }

  // During kickoff / set piece phase: both sides can reposition own players.
  // The attacking side may additionally drag the ball to execute the pass
  // directly (no explicit "Free Kick" button — the first pass from the taker
  // ends the set piece phase automatically).
  if (ctx.isKickoffPhase) {
    const activeTeam = localTeam ?? currentTeam
    const isAttacker = localTeam == null || localTeam === currentTeam
    const ballOwner = findBallOwner(players, ball)

    // Attacker: drag ball to pass (only for standards, not kickoff — kickoff
    // still needs the explicit "Kickoff" button to preserve the pre-marked
    // taker rule).
    if (ctx.allowDirectPassInSetPiece && isAttacker && ballOwner && ballOwner.team === currentTeam) {
      const distToBall = rawDistance(pos, ballDisplayPos(ball, ballOwner))
      if (distToBall < hitRadius) return { type: 'ball' }
    }

    // Both sides: drag own non-taker players to reposition
    const ownPlayer = findClosestPlayer(players, pos, activeTeam, hitRadius)
    if (ownPlayer && ownPlayer.id !== ball.ownerId) {
      return { type: 'player', player: ownPlayer }
    }
    return null
  }

  // Default: closest player or ball
  const activeTeam = localTeam ?? currentTeam
  const clickablePlayer = findClosestPlayer(players, pos, activeTeam, hitRadius)
  const distToPlayer = clickablePlayer ? rawDistance(pos, clickablePlayer.position) : Infinity

  const ballOwner = findBallOwner(players, ball)
  const canClickBall = ballOwner && ballOwner.team === currentTeam
  const distToBall = canClickBall ? rawDistance(pos, ballDisplayPos(ball, ballOwner)) : Infinity

  // Pick whichever is closer to the click
  if (distToBall < hitRadius && distToBall < distToPlayer) return { type: 'ball' }
  if (clickablePlayer && !clickablePlayer.hasActed && distToPlayer < hitRadius) {
    return { type: 'player', player: clickablePlayer }
  }
  return null
}
