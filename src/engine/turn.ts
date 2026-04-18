import type { GameState, TeamSide, PlayerData, BallData, TeamMatchStats, Half } from './types'
import { GAME, PITCH } from './constants'

const REGULATION_END = GAME.HALF_DURATION * 2            // 90
const ET1_END        = REGULATION_END + GAME.ET_HALF_DURATION  // 105
const ET2_END        = ET1_END + GAME.ET_HALF_DURATION         // 120

export function emptyMatchStats(): TeamMatchStats {
  return {
    xG: 0, possession: 0, tacklesWon: 0, tacklesLost: 0,
    distanceCovered: 0, fouls: 0, corners: 0, yellowCards: 0, redCards: 0,
    shotsOnTarget: 0, shotsOff: 0, passesCompleted: 0, passesTotal: 0,
  }
}

/**
 * End the current turn. Resets player action flags, swaps the active team,
 * advances game time, and checks for half-time / full-time.
 */
export function endTurn(state: GameState): GameState {
  const nextTurn: TeamSide = state.currentTurn === 1 ? 2 : 1
  const newGameTime = state.gameTime + GAME.MINUTES_PER_TURN

  let newHalf: Half = state.half
  let newPhase = state.phase

  const tied = state.score.team1 === state.score.team2

  if (state.half === 1 && newGameTime >= GAME.HALF_DURATION) {
    newHalf = 2
    newPhase = 'half_time'
  } else if (state.half === 2 && newGameTime >= REGULATION_END) {
    // Ende regulärer Spielzeit: Bei Gleichstand + mustDecide → Verlängerung, sonst Abpfiff.
    if (tied && state.mustDecide) {
      newHalf = 3
      newPhase = 'half_time'
    } else {
      newPhase = 'full_time'
    }
  } else if (state.half === 3 && newGameTime >= ET1_END) {
    // Ende ET1 → Pause vor ET2
    newHalf = 4
    newPhase = 'half_time'
  } else if (state.half === 4 && newGameTime >= ET2_END) {
    // Ende ET2: Bei Gleichstand → Elfmeterschießen, sonst Abpfiff.
    if (tied) {
      newPhase = 'shootout'
    } else {
      newPhase = 'full_time'
    }
  } else {
    newPhase = 'playing'
  }

  // Track possession and distance for ending team
  const stats = { ...state.matchStats }
  const teamKey = state.currentTurn === 1 ? 'team1' : 'team2'
  const teamStats = { ...stats[teamKey] }

  // Possession: count this turn
  const hasBall = state.ball.ownerId !== null &&
    state.players.find(p => p.id === state.ball.ownerId)?.team === state.currentTurn
  if (hasBall) teamStats.possession++

  // Distance: sum how far each player moved from origin
  const teamPlayers = state.players.filter(p => p.team === state.currentTurn)
  for (const p of teamPlayers) {
    const dx = p.position.x - p.origin.x
    const dy = p.position.y - p.origin.y
    teamStats.distanceCovered += Math.sqrt(dx * dx + dy * dy)
  }

  stats[teamKey] = teamStats
  const totalTurns = { ...state.totalTurns }
  totalTurns[teamKey]++

  return {
    ...state,
    currentTurn: nextTurn,
    gameTime: newGameTime,
    half: newHalf,
    phase: newPhase,
    passesThisTurn: 0,
    ballOwnerChangedThisTurn: false,
    mustPass: false,
    setPieceReady: true,
    lastSetPiece: null,
    lastEvent: null,
    tackleAttemptedThisTurn: false,
    players: resetPlayersForNewTurn(state.players, state.currentTurn),
    matchStats: stats,
    totalTurns,
  }
}

/**
 * Reset all players' turn-specific flags. Also update origins to current positions.
 */
function resetPlayersForNewTurn(players: PlayerData[], endingTeam?: TeamSide): PlayerData[] {
  return players.map(p => {
    // Fitness drain: based on distance moved this turn
    const dx = p.position.x - p.origin.x
    const dy = p.position.y - p.origin.y
    const distMoved = Math.sqrt(dx * dx + dy * dy)
    const fatigue = distMoved * 0.108 + 0.15 // Base drain per turn + distance (+35%)
    const newFitness = Math.max(5, p.fitness - fatigue) // Never below 5

    return {
      ...p,
      fitness: newFitness,
      hasActed: false,
      hasMoved: false,
      hasPassed: false,
      hasReceivedPass: false,
      // Tackle lock: clear for the ending team (or all on kickoff)
      tackleLocked: (endingTeam == null || p.team === endingTeam) ? false : p.tackleLocked,
      // Cannot-tackle: clear at end of opponent's turn (or on kickoff). The player lost the ball
      // in a tackle and sits out the opponent's next turn — flag drops once that turn ends.
      cannotTackle: (endingTeam == null || p.team !== endingTeam) ? false : p.cannotTackle,
      origin: { ...p.position },
    }
  })
}

// --- Kickoff formation positions ---
// Each position's ideal Y in own half (Team 1 defends y=100, half is y=50..100)
// Team 2 values are mirrored (100 - y)
interface KickoffSlot {
  positionLabel: string
  x: number
  y: number      // Basis (defensiv/Underdog)
  push: number   // Vorwärtsschub bei Selbstvertrauen
  xSpread: number // Breitenstreuung bei Selbstvertrauen
}

const KICKOFF_FORMATION: KickoffSlot[] = [
  { positionLabel: 'TW', x: 50, y: 93,  push: 20, xSpread: 0 },
  { positionLabel: 'LV', x: 22, y: 82,  push: 40, xSpread: 12 },
  { positionLabel: 'IV', x: 42, y: 84,  push: 40, xSpread: 4 },
  { positionLabel: 'IV', x: 58, y: 84,  push: 40, xSpread: 4 },
  { positionLabel: 'RV', x: 78, y: 82,  push: 40, xSpread: 12 },
  { positionLabel: 'ZDM', x: 50, y: 72, push: 18, xSpread: 0 },
  { positionLabel: 'LM', x: 25, y: 66,  push: 20, xSpread: 12 },
  { positionLabel: 'RM', x: 75, y: 66,  push: 20, xSpread: 12 },
  { positionLabel: 'OM', x: 50, y: 62,  push: 10, xSpread: 0 },
  { positionLabel: 'ST', x: 40, y: 56,  push: 8,  xSpread: 8 },
  { positionLabel: 'ST', x: 60, y: 56,  push: 8,  xSpread: 8 },
]

/**
 * Reset all players to their proper kickoff formation positions.
 * Each player is matched to their slot by positionLabel.
 * Team 2 positions are mirrored vertically.
 */
function resetToFormation(players: PlayerData[]): PlayerData[] {
  // Track which slots have been used per team (for duplicate labels like IV, ST)
  const usedSlots1: Set<number> = new Set()
  const usedSlots2: Set<number> = new Set()

  return players.map(p => {
    const usedSlots = p.team === 1 ? usedSlots1 : usedSlots2

    // Find the next unused slot matching this position label
    let slotIndex = -1
    for (let i = 0; i < KICKOFF_FORMATION.length; i++) {
      if (KICKOFF_FORMATION[i].positionLabel === p.positionLabel && !usedSlots.has(i)) {
        slotIndex = i
        break
      }
    }

    if (slotIndex === -1) {
      // Fallback — shouldn't happen, but keep current position in own half
      const y = p.team === 1
        ? Math.max(50, Math.min(97, p.position.y))
        : Math.max(3, Math.min(50, p.position.y))
      const pos = { x: p.position.x, y }
      return { ...p, position: pos, origin: { ...pos } }
    }

    usedSlots.add(slotIndex)

    const slot = KICKOFF_FORMATION[slotIndex]
    const cf = p.confidence / 100  // 0–1, Spieler-Confidence als Proxy
    // X: Breitenstreuung — starke Teams nutzen die Flügel
    const xOffset = slot.x < 50 ? -slot.xSpread * cf
                  : slot.x > 50 ?  slot.xSpread * cf : 0
    const baseX = Math.max(3, Math.min(97, slot.x + xOffset))
    const x = p.team === 1 ? baseX : (100 - baseX)
    // Y: Clamp: Spieler bleiben immer in eigener Hälfte (baseY >= 50)
    const baseY = Math.max(50, slot.y - slot.push * cf)
    const y = p.team === 1 ? baseY : (100 - baseY)
    const pos = { x, y }

    return { ...p, position: pos, origin: { ...pos } }
  })
}

/**
 * Push all players outside the center circle, except the kickoff striker.
 */
function pushOutOfCenterCircle(players: PlayerData[], exemptId: string | null): PlayerData[] {
  const cx = PITCH.CENTER_X
  const cy = PITCH.CENTER_Y
  const r = PITCH.CENTER_CIRCLE_RADIUS + 0.5

  return players.map(p => {
    if (p.id === exemptId) return p

    const dx = p.position.x - cx
    const dy = p.position.y - cy
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist >= r) return p

    // Player exactly at center → push toward own goal to avoid atan2(0,0)
    let angle: number
    if (dist < 0.1) {
      angle = p.team === 1 ? Math.PI / 2 : -Math.PI / 2
    } else {
      angle = Math.atan2(dy, dx)
    }
    const newX = cx + Math.cos(angle) * r
    const newY = cy + Math.sin(angle) * r
    const pos = { x: newX, y: newY }

    return { ...p, position: pos, origin: { ...pos } }
  })
}

/**
 * Set up a kickoff after a goal is scored or at the start of a half.
 * All players return to their formation positions. One striker of the
 * kicking team stands at the center spot with the ball.
 */
export function setupKickoff(state: GameState, kickingTeam: TeamSide): GameState {
  // Reset ALL players to their proper formation positions
  let players = resetToFormation(state.players)

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

  // Push all other players outside the center circle
  players = pushOutOfCenterCircle(players, striker?.id ?? null)

  return {
    ...state,
    ball,
    players: resetPlayersForNewTurn(players),
    currentTurn: kickingTeam,
    phase: 'kickoff',
    passesThisTurn: 0,
    ballOwnerChangedThisTurn: false,
    mustPass: false,
    setPieceReady: true,
    lastSetPiece: null,
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
 * Handle half-time pause: set up kickoff for the next half.
 * - Half 1 → 2: Team 2 stößt an (Seitenwechsel der Regulärzeit)
 * - Half 2 → 3: Team 1 stößt die Verlängerung an
 * - Half 3 → 4: Team 2 stößt die zweite ET-Hälfte an
 */
export function handleHalfTime(state: GameState): GameState {
  // state.half wurde bereits in endTurn auf die kommende Halbzeit gesetzt
  const nextHalf: Half = state.half
  const kickingTeam: TeamSide = (nextHalf === 2 || nextHalf === 4) ? 2 : 1
  return setupKickoff(
    { ...state, phase: 'playing', half: nextHalf },
    kickingTeam,
  )
}

/**
 * Create the initial game state for a new match.
 * @param mustDecide Wenn true, wird bei Unentschieden nach 90min verlängert und
 * ggf. ein Elfmeterschießen ausgetragen (Perfect Run). Default false → Remis möglich.
 */
export function createInitialGameState(players: PlayerData[], mustDecide = false): GameState {
  const initialState: GameState = {
    players,
    ball: { position: { x: PITCH.CENTER_X, y: PITCH.CENTER_Y }, ownerId: null },
    score: { team1: 0, team2: 0 },
    currentTurn: 1,
    gameTime: 0,
    half: 1,
    phase: 'kickoff',
    passesThisTurn: 0,
    ballOwnerChangedThisTurn: false,
    mustPass: false,
    setPieceReady: true,
    lastSetPiece: null,
    lastEvent: null,
    tackleAttemptedThisTurn: false,
    matchStats: { team1: emptyMatchStats(), team2: emptyMatchStats() },
    ticker: [],
    totalTurns: { team1: 0, team2: 0 },
    mustDecide,
    shootoutState: null,
  }

  return setupKickoff(initialState, 1)
}
