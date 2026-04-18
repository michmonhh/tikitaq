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
  highPassing: number  // 0-100: affects pass radius
  tackling: number     // 0-100: affects tackle win chance
  defensiveRadius: number // 0-100: affects tackle radius
  ballShielding: number   // 0-100: affects resistance to tackles
  dribbling: number   // 0-100: ability to beat defenders 1v1
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
  firstName: string
  lastName: string
  position: Position
  origin: Position       // Position at start of turn (for movement radius calc)
  stats: PlayerStats
  gameStats: PlayerGameStats
  fitness: number          // 0-100, decreases with distance covered and actions
  confidence: number       // 0-100, affected by successful/failed actions
  hasActed: boolean       // Player is completely done this turn
  hasMoved: boolean       // Has moved this turn (can only move once)
  hasPassed: boolean      // Has passed this turn (passer can still move after)
  hasReceivedPass: boolean // Received a pass (can still move if hasn't moved yet)
  tackleLocked: boolean   // Locked after losing a tackle (can't move until own turn ends)
  cannotTackle: boolean   // Lost ball in tackle: blocked from tackling during opponent's next turn
}

export interface BallData {
  position: Position
  ownerId: string | null // Player ID who has the ball
}

export interface Score {
  team1: number
  team2: number
}

export type GamePhase = 'playing' | 'kickoff' | 'free_kick' | 'corner' | 'throw_in' | 'penalty' | 'penalty_kick' | 'goal_kick' | 'goal_scored' | 'half_time' | 'full_time'

/** Elfmeter-Richtung: links/mitte/rechts aus Sicht des Schützen */
export type PenaltyDirection = 'left' | 'center' | 'right'

/** Elfmeter-Zustand: wird parallel zum GameState gehalten */
export interface PenaltyState {
  shooterTeam: TeamSide       // Wer schießt den Elfmeter
  shooterId: string           // ST der schießenden Mannschaft
  keeperId: string            // TW der verteidigenden Mannschaft
  shooterChoice: PenaltyDirection | null  // Gewählte Schussrichtung
  keeperChoice: PenaltyDirection | null   // Gewählte TW-Position
}

export interface TeamMatchStats {
  xG: number              // Expected Goals (sum of shot probabilities)
  possession: number      // Number of turns with ball possession
  tacklesWon: number
  tacklesLost: number
  distanceCovered: number // Total distance in game units
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

export interface GameState {
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
  setPieceReady: boolean  // Free-kick only: true after user-as-attacker clicked Bereit and AI repositioned defensively
  lastSetPiece: GamePhase | null  // Tracks which set piece was just confirmed (for offside rules)
  lastEvent: GameEvent | null
  matchStats: { team1: TeamMatchStats; team2: TeamMatchStats }
  ticker: TickerEntry[]
  totalTurns: { team1: number; team2: number }
  tackleAttemptedThisTurn: boolean  // For "one tackle per turn" rule
}

export type GameEventType =
  | 'pass_complete'
  | 'pass_intercepted'
  | 'pass_lost'
  | 'throw_in'
  | 'corner'
  | 'shot_saved'
  | 'shot_scored'
  | 'shot_missed'
  | 'tackle_won'
  | 'tackle_lost'
  | 'foul'
  | 'yellow_card'
  | 'red_card'
  | 'offside'
  | 'penalty'
  | 'penalty_scored'
  | 'penalty_saved'
  | 'penalty_missed'
  | 'move'
  | 'tactic_change'
  | 'kickoff'
  | 'half_time'

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
  passesThisTurn: number
  ballOwnerChangedThisTurn: boolean
  mustPass: boolean
  setPieceReady: boolean
  lastSetPiece: GamePhase | null
  tackleAttemptedThisTurn: boolean
  matchStats: { team1: TeamMatchStats; team2: TeamMatchStats }
  ticker: TickerEntry[]
  totalTurns: { team1: number; team2: number }
}
