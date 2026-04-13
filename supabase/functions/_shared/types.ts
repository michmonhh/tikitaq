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
  position: Position
  origin: Position
  stats: PlayerStats
  gameStats: PlayerGameStats
  hasActed: boolean
  hasMoved: boolean
  hasReceivedPass: boolean
}

export interface BallData {
  position: Position
  ownerId: string | null
}

export interface Score {
  team1: number
  team2: number
}

export type GamePhase = 'playing' | 'kickoff' | 'goal_scored' | 'half_time' | 'full_time'

export interface MatchState {
  players: PlayerData[]
  ball: BallData
  score: Score
  currentTurn: TeamSide
  gameTime: number
  half: 1 | 2
  phase: GamePhase
  passUsedThisTurn: boolean
}

export interface PlayerAction {
  type: 'move' | 'pass' | 'shoot'
  playerId: string
  target: Position
  receiverId?: string
}
