import type { StoreApi } from 'zustand'
import type {
  GameState, TeamSide, Position, PenaltyState,
} from '../../engine/types'

export interface DragState {
  activePlayerId: string | null
  isDraggingBall: boolean
  dragPosition: Position | null
}

export interface GameStore {
  // Game state
  state: GameState | null
  isVsAI: boolean
  isDuel: boolean
  localTeam: TeamSide | null

  // Drag interaction state
  drag: DragState

  // Selected player (tapped, shows info)
  selectedPlayerId: string | null

  // AI reasoning (last turn explanations)
  aiReasoning: Map<string, string>

  // Event display
  eventMessage: string | null
  eventTimeout: ReturnType<typeof setTimeout> | null
  overlayLabel: string | null
  overlayColor: string | null
  // Buffer für Overlay-Events, die während eines KI-Zugs ausgelöst werden —
  // wird erst nach Abschluss der Ball-Animation sichtbar gemacht.
  pendingAIOverlay: { message: string; durationMs: number; eventType?: string } | null

  // Penalty state
  penaltyState: PenaltyState | null

  // Game rules (togglable settings)
  gameSettings: {
    oneTacklePerTurn: boolean
    allowDoublePass: boolean
    tacklingLock: boolean
    showMovementRadii: boolean
    showTackleRadii: 'off' | 'dragging' | 'always'
  }
  setGameSetting: <K extends keyof GameStore['gameSettings']>(key: K, value: GameStore['gameSettings'][K]) => void

  // Actions
  initGame: (team1Id?: number, team2Id?: number, isVsAI?: boolean, mustDecide?: boolean) => void
  selectPlayer: (playerId: string | null) => void
  setActivePlayer: (playerId: string | null) => void
  setDragBall: (isDragging: boolean, pos?: Position) => void
  updateDragPosition: (pos: Position) => void

  movePlayer: (playerId: string, target: Position) => void
  passBall: (passerId: string, target: Position, receiverId?: string) => void
  shootBall: (shooterId: string, target: Position) => void
  endCurrentTurn: () => void
  confirmKickoff: () => void
  confirmSetPieceReady: () => void
  confirmPenaltyDefense: () => void
  executeAI: () => void
  executeAIAnimated: () => void
  aiRunning: boolean

  showEvent: (message: string, durationMs?: number, eventType?: string) => void
  clearEvent: () => void
  flushAIOverlay: () => void

  // For multiplayer sync
  setState: (state: GameState) => void
  setLocalTeam: (team: TeamSide) => void
  setDuel: (isDuel: boolean) => void
  reset: () => void
}

export type StoreSet = StoreApi<GameStore>['setState']
export type StoreGet = StoreApi<GameStore>['getState']
