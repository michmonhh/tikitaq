import type { Position, PlayerData, MatchState, PlayerAction } from './types.ts'

const ASPECT_RATIO = 1.5
const MOVEMENT_BASE = 10
const MOVEMENT_MIN = 0.5
const MOVEMENT_STAT_WEIGHT = 0.01

export function distance(a: Position, b: Position): number {
  const dx = (a.x - b.x) * ASPECT_RATIO
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

export function getMovementRadius(player: PlayerData): number {
  const factor = MOVEMENT_MIN + player.stats.pacing * MOVEMENT_STAT_WEIGHT
  return MOVEMENT_BASE * factor
}

export function clampToPitch(pos: Position): Position {
  return {
    x: Math.max(4, Math.min(96, pos.x)),
    y: Math.max(3, Math.min(97, pos.y)),
  }
}

/**
 * Validate and apply a single player action to the match state.
 * Returns the updated state. Throws on invalid actions.
 */
export function validateAndApplyAction(
  state: MatchState,
  action: PlayerAction
): MatchState {
  const player = state.players.find(p => p.id === action.playerId)
  if (!player) throw new Error(`Player ${action.playerId} not found`)
  if (player.team !== state.currentTurn) throw new Error('Not this player\'s turn')

  switch (action.type) {
    case 'move':
      return applyMoveAction(state, player, action)
    case 'pass':
      return applyPassAction(state, player, action)
    case 'shoot':
      return applyShootAction(state, player, action)
    default:
      throw new Error(`Unknown action type`)
  }
}

function applyMoveAction(state: MatchState, player: PlayerData, action: PlayerAction): MatchState {
  const radius = getMovementRadius(player)
  const dist = distance(action.target, player.origin)

  if (dist > radius * 1.1) {
    throw new Error('Move target exceeds movement radius')
  }

  const target = clampToPitch(action.target)
  const updatedPlayers = state.players.map(p =>
    p.id === player.id
      ? { ...p, position: target, hasActed: true, hasMoved: true }
      : p
  )

  // Check ball pickup
  let ball = { ...state.ball }
  if (!ball.ownerId && distance(target, ball.position) < 3) {
    ball = { ...ball, ownerId: player.id }
  }

  return { ...state, players: updatedPlayers, ball }
}

function applyPassAction(state: MatchState, player: PlayerData, action: PlayerAction): MatchState {
  if (state.ball.ownerId !== player.id) throw new Error('Player does not have the ball')
  if (state.passUsedThisTurn) throw new Error('Pass already used this turn')

  const target = clampToPitch(action.target)

  // Find nearest teammate to target
  const teammates = state.players.filter(p => p.team === player.team && p.id !== player.id)
  let receiver: PlayerData | null = null
  let closestDist = 5

  for (const mate of teammates) {
    const d = distance(mate.position, target)
    if (d < closestDist) {
      closestDist = d
      receiver = mate
    }
  }

  const updatedPlayers = state.players.map(p =>
    p.id === player.id ? { ...p, hasActed: true } : p
  )

  const ball = receiver
    ? { position: { ...receiver.position }, ownerId: receiver.id }
    : { position: target, ownerId: null }

  return {
    ...state,
    players: updatedPlayers,
    ball,
    passUsedThisTurn: true,
  }
}

function applyShootAction(state: MatchState, player: PlayerData, _action: PlayerAction): MatchState {
  if (state.ball.ownerId !== player.id) throw new Error('Player does not have the ball')

  // Simple server-side resolution
  const goalkeeper = state.players.find(
    p => p.team !== player.team && p.positionLabel === 'TW'
  )

  const saveChance = goalkeeper
    ? 0.5 + goalkeeper.stats.quality * 0.004 - player.stats.finishing * 0.004
    : 0

  const saved = Math.random() < Math.max(0.05, Math.min(0.95, saveChance))

  const updatedPlayers = state.players.map(p =>
    p.id === player.id ? { ...p, hasActed: true } : p
  )

  if (saved && goalkeeper) {
    return {
      ...state,
      players: updatedPlayers,
      ball: { position: { ...goalkeeper.position }, ownerId: goalkeeper.id },
    }
  }

  // Goal!
  const score = { ...state.score }
  if (player.team === 1) score.team1++
  else score.team2++

  return {
    ...state,
    players: updatedPlayers,
    ball: { position: { x: 50, y: 50 }, ownerId: null },
    score,
    phase: 'goal_scored',
  }
}
