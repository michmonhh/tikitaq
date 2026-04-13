// Shared types for Edge Functions — mirrors engine/types.ts

export type TeamSide = 1 | 2

export interface Position {
  x: number
  y: number
}

export interface PlayerStats {
  pacing: number
  finishing: number
  shortPassing: number
  highPassing: number
  tackling: number
  defensiveRadius: number
  ballShielding: number
  dribbling: number
  quality: number
}

export interface PlayerGameStats {
  passes: number
  tacklesWon: number
  tacklesLost: number
  goalsScored: number
  saves: number
  conceded: number
}

export interface PlayerData {
  id: string
  team: TeamSide
  positionLabel: string
  firstName: string
  lastName: string
  position: Position
  origin: Position
  stats: PlayerStats
  gameStats: PlayerGameStats
  fitness: number
  confidence: number
  hasActed: boolean
  hasMoved: boolean
  hasPassed: boolean
  hasReceivedPass: boolean
  tackleLocked: boolean
}

export interface BallData {
  position: Position
  ownerId: string | null
}

export interface Score {
  team1: number
  team2: number
}

export type GamePhase = 'playing' | 'kickoff' | 'free_kick' | 'corner' | 'throw_in' | 'penalty' | 'penalty_kick' | 'goal_kick' | 'goal_scored' | 'half_time' | 'full_time'

export type GameEventType =
  | 'pass_complete' | 'pass_intercepted' | 'pass_lost'
  | 'throw_in' | 'corner'
  | 'shot_saved' | 'shot_scored' | 'shot_missed'
  | 'tackle_won' | 'tackle_lost'
  | 'foul' | 'yellow_card' | 'red_card'
  | 'offside' | 'penalty' | 'penalty_scored' | 'penalty_saved' | 'penalty_missed'
  | 'move' | 'tactic_change' | 'kickoff' | 'half_time'

export interface TeamMatchStats {
  xG: number
  possession: number
  tacklesWon: number
  tacklesLost: number
  distanceCovered: number
  fouls: number
  corners: number
  yellowCards: number
  redCards: number
  shotsOnTarget: number
  shotsOff: number
  passesCompleted: number
  passesTotal: number
}

export interface TickerEntry {
  minute: number
  message: string
  type: GameEventType
  team?: TeamSide
}

export interface MatchState {
  players: PlayerData[]
  ball: BallData
  score: Score
  currentTurn: TeamSide
  gameTime: number
  half: 1 | 2
  phase: GamePhase
  passesThisTurn: number
  ballOwnerChangedThisTurn: boolean
  mustPass: boolean
  lastSetPiece: GamePhase | null
  tackleAttemptedThisTurn: boolean
  matchStats: { team1: TeamMatchStats; team2: TeamMatchStats }
  ticker: TickerEntry[]
  totalTurns: { team1: number; team2: number }
}

export interface PlayerAction {
  type: 'move' | 'pass' | 'shoot'
  playerId: string
  target: Position
  receiverId?: string
}
