import type {
  GameState, TeamSide, GameEvent, GamePhase, PlayerData,
  TickerEntry, TeamMatchStats, PenaltyDirection, GoalLogEntry,
} from '../../engine/types'

export function addTicker(
  state: GameState,
  message: string,
  type: GameEvent['type'],
  team?: TeamSide,
): GameState {
  const entry: TickerEntry = { minute: state.gameTime, message, type, team }
  return { ...state, ticker: [...state.ticker, entry] }
}

export function updateTeamStats(
  state: GameState,
  team: TeamSide,
  updater: (s: TeamMatchStats) => Partial<TeamMatchStats>,
): GameState {
  const key = team === 1 ? 'team1' : 'team2'
  const stats = { ...state.matchStats }
  stats[key] = { ...stats[key], ...updater(stats[key]) }
  return { ...state, matchStats: stats }
}

/** Finde den nächsten Außenverteidiger auf einer Seite für Einwurf */
export function findThrowInTaker(
  players: PlayerData[],
  team: TeamSide,
  throwX: number,
): PlayerData | null {
  const teamPlayers = players.filter(p => p.team === team)
  const isLeftSide = throwX < 50
  // Prefer fullback on the correct side
  const fullbacks = teamPlayers.filter(p => ['LV', 'RV'].includes(p.positionLabel))
  const sideFullback = fullbacks.find(p =>
    isLeftSide ? p.position.x < 50 : p.position.x >= 50,
  )
  if (sideFullback) return sideFullback
  if (fullbacks.length > 0) return fullbacks[0]
  // Fallback: nearest player to the throw-in spot
  return teamPlayers.reduce((best, p) => {
    if (!best) return p
    const d = Math.abs(p.position.x - throwX)
    return d < Math.abs(best.position.x - throwX) ? p : best
  }, null as PlayerData | null)
}

/** Finde den besten Eckstoß-Schützen */
export function findCornerTaker(players: PlayerData[], team: TeamSide): PlayerData | null {
  const teamPlayers = players.filter(p => p.team === team && p.positionLabel !== 'TW')
  // Prefer LM/RM (wingers) or OM based on highPassing stat
  const candidates = teamPlayers
    .filter(p => ['LM', 'RM', 'OM', 'ZDM'].includes(p.positionLabel))
    .sort((a, b) => b.stats.highPassing - a.stats.highPassing)
  return candidates[0] ?? teamPlayers[0] ?? null
}

/** Determine penalty direction from x position (goal range 38-62) */
export function directionFromX(x: number): PenaltyDirection {
  if (x < 46) return 'left'
  if (x > 54) return 'right'
  return 'center'
}

/** Check if a set piece phase */
export function isSetPiecePhase(phase: GamePhase): boolean {
  return phase === 'free_kick' || phase === 'corner' || phase === 'throw_in' || phase === 'penalty' || phase === 'penalty_kick'
}

/**
 * Push eines Tor-Eintrags in `state.goalLog`. Wird nur für reguläre Tore + Elfmeter
 * aus dem Spiel heraus aufgerufen — NICHT für Elfmeterschießen-Treffer (die zählen
 * nach FIFA nicht in der Torschützenliste).
 */
export function addGoalLog(state: GameState, shooter: PlayerData, kind: GoalLogEntry['kind']): GameState {
  const entry: GoalLogEntry = {
    team: shooter.team,
    playerId: shooter.id,
    playerName: `${shooter.firstName} ${shooter.lastName}`,
    minute: state.gameTime,
    kind,
  }
  return { ...state, goalLog: [...state.goalLog, entry] }
}
