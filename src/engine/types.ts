// --- Core Game Types ---

export type TeamSide = 1 | 2

export interface Position {
  x: number // 0-100 (percentage of pitch width)
  y: number // 0-100 (percentage of pitch height)
}

export interface PlayerStats {
  pacing: number       // 0-100: affects movement radius
  finishing: number    // 0-100: affects shot success
  shortPassing: number // 0-100: affects short pass accuracy
  longPassing: number  // 0-100: affects pass radius
  tackling: number     // 0-100: affects tackle win chance
  defensiveRadius: number // 0-100: affects tackle radius
  ballShielding: number   // 0-100: affects resistance to tackles
  quality: number     // 0-100: overall quality (goalkeeper saving)
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
  positionLabel: string  // TW, IV, LV, RV, ZDM, LM, RM, OM, ST
  position: Position
  origin: Position       // Position at start of turn (for movement radius calc)
  stats: PlayerStats
  gameStats: PlayerGameStats
  hasActed: boolean      // Has this player done something this turn?
  hasMoved: boolean      // Specifically moved?
  hasReceivedPass: boolean
}

export interface BallData {
  position: Position
  ownerId: string | null // Player ID who has the ball
}

export interface Score {
  team1: number
  team2: number
}

export type GamePhase = 'playing' | 'kickoff' | 'goal_scored' | 'half_time' | 'full_time'

export interface GameState {
  players: PlayerData[]
  ball: BallData
  score: Score
  currentTurn: TeamSide
  gameTime: number       // Minutes elapsed (0-90)
  half: 1 | 2
  phase: GamePhase
  passUsedThisTurn: boolean
  ballOwnerChangedThisTurn: boolean // Ball can only change owner once per turn
  lastEvent: GameEvent | null
}

export type GameEventType =
  | 'pass_complete'
  | 'pass_intercepted'
  | 'shot_saved'
  | 'shot_scored'
  | 'shot_missed'
  | 'tackle_won'
  | 'tackle_lost'
  | 'offside'
  | 'move'

export interface GameEvent {
  type: GameEventType
  playerId: string
  targetId?: string
  position: Position
  message: string
}

// --- Action Types ---

export interface MoveAction {
  type: 'move'
  playerId: string
  target: Position
}

export interface PassAction {
  type: 'pass'
  playerId: string
  target: Position
  receiverId: string
}

export interface ShootAction {
  type: 'shoot'
  playerId: string
  target: Position
}

export type PlayerAction = MoveAction | PassAction | ShootAction

// --- Team Data Types ---

export interface TeamLevels {
  att: number
  mid: number
  def: number
  tw: number
}

export interface Team {
  id: number
  name: string
  shortName: string
  color: string
  levels: TeamLevels
}

// --- Multiplayer Types ---

export interface MatchMeta {
  id: string
  player1_id: string
  player2_id: string
  current_turn_id: string
  team1_abbr: string
  team2_abbr: string
  status: 'active' | 'finished' | 'abandoned'
}

export interface SerializedMatchState {
  players: PlayerData[]
  ball: BallData
  score: Score
  currentTurn: TeamSide
  gameTime: number
  half: 1 | 2
  phase: GamePhase
  passUsedThisTurn: boolean
  ballOwnerChangedThisTurn: boolean
}
