import type { GameState, TeamSide, PlayerData, BallData } from './types'
import { GAME, PITCH } from './constants'

/**
 * End the current turn. Resets player action flags, swaps the active team,
 * advances game time, and checks for half-time / full-time.
 */
export function endTurn(state: GameState): GameState {
  const nextTurn: TeamSide = state.currentTurn === 1 ? 2 : 1
  const newGameTime = state.gameTime + GAME.MINUTES_PER_TURN

  let newHalf = state.half
  let newPhase = state.phase

  if (state.half === 1 && newGameTime >= GAME.HALF_DURATION) {
    newHalf = 2
    newPhase = 'half_time'
  } else if (state.half === 2 && newGameTime >= GAME.HALF_DURATION * 2) {
    newPhase = 'full_time'
  } else {
    newPhase = 'playing'
  }

  return {
    ...state,
    currentTurn: nextTurn,
    gameTime: newGameTime,
    half: newHalf,
    phase: newPhase,
    passUsedThisTurn: false,
    ballOwnerChangedThisTurn: false,
    lastEvent: null,
    players: resetPlayersForNewTurn(state.players),
  }
}

/**
 * Reset all players' turn-specific flags. Also update origins to current positions.
 */
function resetPlayersForNewTurn(players: PlayerData[]): PlayerData[] {
  return players.map(p => ({
    ...p,
    hasActed: false,
    hasMoved: false,
    hasReceivedPass: false,
    origin: { ...p.position },
  }))
}

/**
 * Ensure all players are in their own half.
 * Team 1 defends bottom (y=50..100), Team 2 defends top (y=0..50).
 * The kicking team's striker is placed at the center spot.
 */
function ensurePlayersInOwnHalf(players: PlayerData[]): PlayerData[] {
  return players.map(p => {
    const pos = { ...p.position }

    if (p.team === 1) {
      // Team 1's half is y >= 50
      if (pos.y < 50) pos.y = 50 + (50 - pos.y) // Mirror into own half
    } else {
      // Team 2's half is y <= 50
      if (pos.y > 50) pos.y = 50 - (pos.y - 50) // Mirror into own half
    }

    return { ...p, position: pos, origin: { ...pos } }
  })
}

/**
 * Set up a kickoff after a goal is scored or at the start of a half.
 * All players return to their own half. One striker of the kicking team
 * stands at the center spot with the ball.
 */
export function setupKickoff(state: GameState, kickingTeam: TeamSide): GameState {
  // Reset all players to own half
  let players = ensurePlayersInOwnHalf(state.players)

  // Find a striker on the kicking team to place at center
  const striker = players.find(
    p => p.team === kickingTeam && p.positionLabel === 'ST'
  )

  const ball: BallData = {
    position: { x: PITCH.CENTER_X, y: PITCH.CENTER_Y },
    ownerId: striker?.id ?? null,
  }

  if (striker) {
    players = players.map(p =>
      p.id === striker.id
        ? { ...p, position: { x: PITCH.CENTER_X, y: PITCH.CENTER_Y }, origin: { x: PITCH.CENTER_X, y: PITCH.CENTER_Y } }
        : p
    )
  }

  return {
    ...state,
    ball,
    players: resetPlayersForNewTurn(players),
    currentTurn: kickingTeam,
    phase: 'kickoff',
    passUsedThisTurn: false,
    ballOwnerChangedThisTurn: false,
  }
}

/**
 * After a goal, update score and set up kickoff for the conceding team.
 */
export function handleGoalScored(
  state: GameState,
  scoringTeam: TeamSide
): GameState {
  const newScore = { ...state.score }
  if (scoringTeam === 1) newScore.team1++
  else newScore.team2++

  const kickingTeam: TeamSide = scoringTeam === 1 ? 2 : 1

  return setupKickoff(
    { ...state, score: newScore, phase: 'goal_scored' },
    kickingTeam
  )
}

/**
 * Handle half-time: swap sides and set up kickoff for Team 2.
 */
export function handleHalfTime(state: GameState): GameState {
  return setupKickoff(
    { ...state, phase: 'playing', half: 2 },
    2
  )
}

/**
 * Create the initial game state for a new match.
 * Uses the kickoff formation where all players are in their own half.
 */
export function createInitialGameState(players: PlayerData[]): GameState {
  const initialState: GameState = {
    players,
    ball: { position: { x: PITCH.CENTER_X, y: PITCH.CENTER_Y }, ownerId: null },
    score: { team1: 0, team2: 0 },
    currentTurn: 1,
    gameTime: 0,
    half: 1,
    phase: 'kickoff',
    passUsedThisTurn: false,
    ballOwnerChangedThisTurn: false,
    lastEvent: null,
  }

  return setupKickoff(initialState, 1)
}
