import { create } from 'zustand'
import type { GameState, TeamSide, Position, GameEvent, TeamLevels } from '../engine/types'
import { createFormation } from '../engine/formation'
import { createInitialGameState, endTurn, handleGoalScored, handleHalfTime } from '../engine/turn'
import { applyMove } from '../engine/movement'
import { applyPass } from '../engine/passing'
import { applyShot } from '../engine/shooting'
import { resolveTackle } from '../engine/tackle'
import { executeAITurn } from '../engine/ai'

interface DragState {
  activePlayerId: string | null
  isDraggingBall: boolean
  dragPosition: Position | null
}

interface GameStore {
  // Game state
  state: GameState | null
  isVsAI: boolean
  isDuel: boolean
  localTeam: TeamSide | null

  // Drag interaction state
  drag: DragState

  // Event display
  eventMessage: string | null
  eventTimeout: ReturnType<typeof setTimeout> | null

  // Actions
  initGame: (team1Levels?: TeamLevels, team2Levels?: TeamLevels, isVsAI?: boolean) => void
  setActivePlayer: (playerId: string | null) => void
  setDragBall: (isDragging: boolean, pos?: Position) => void
  updateDragPosition: (pos: Position) => void

  movePlayer: (playerId: string, target: Position) => void
  passBall: (passerId: string, target: Position) => void
  shootBall: (shooterId: string, target: Position) => void
  endCurrentTurn: () => void
  executeAI: () => void

  showEvent: (message: string, durationMs?: number) => void
  clearEvent: () => void

  // For multiplayer sync
  setState: (state: GameState) => void
  reset: () => void
}

export const useGameStore = create<GameStore>((set, get) => ({
  state: null,
  isVsAI: false,
  isDuel: false,
  localTeam: null,

  drag: {
    activePlayerId: null,
    isDraggingBall: false,
    dragPosition: null,
  },

  eventMessage: null,
  eventTimeout: null,

  initGame: (team1Levels, team2Levels, isVsAI = true) => {
    const players = createFormation(team1Levels, team2Levels)
    const state = createInitialGameState(players)
    set({ state, isVsAI, isDuel: false, localTeam: 1 })
  },

  setActivePlayer: (playerId) => {
    set(s => ({ drag: { ...s.drag, activePlayerId: playerId } }))
  },

  setDragBall: (isDragging, pos) => {
    set(s => ({
      drag: { ...s.drag, isDraggingBall: isDragging, dragPosition: pos ?? s.drag.dragPosition },
    }))
  },

  updateDragPosition: (pos) => {
    set(s => ({ drag: { ...s.drag, dragPosition: pos } }))
  },

  movePlayer: (playerId, target) => {
    const { state } = get()
    if (!state) return

    const result = applyMove({ type: 'move', playerId, target }, state)

    let newPlayers = state.players.map(p =>
      p.id === playerId ? result.updatedPlayer : p
    )
    let newBall = { ...state.ball }
    let lastEvent: GameEvent | null = result.event
    let ballOwnerChanged = state.ballOwnerChangedThisTurn

    // Ball pickup (only if ball hasn't changed owner this turn)
    if (result.ballPickedUp && !ballOwnerChanged) {
      newBall = { ...newBall, ownerId: playerId }
      ballOwnerChanged = true
    }

    // Tackle resolution
    if (result.tackle) {
      const tackleResult = resolveTackle(result.tackle)
      lastEvent = tackleResult.event

      // Both players involved in tackle are done for the turn
      if (tackleResult.won) {
        newBall = { ...newBall, ownerId: tackleResult.winner.id, position: { ...tackleResult.winner.position } }
        ballOwnerChanged = true
        newPlayers = newPlayers.map(p => {
          if (p.id === tackleResult.winner.id)
            return { ...p, hasActed: true, gameStats: { ...p.gameStats, tacklesWon: p.gameStats.tacklesWon + 1 } }
          if (p.id === tackleResult.loser.id)
            return { ...p, hasActed: true, gameStats: { ...p.gameStats, tacklesLost: p.gameStats.tacklesLost + 1 } }
          return p
        })
      } else {
        newPlayers = newPlayers.map(p => {
          if (p.id === tackleResult.winner.id)
            return { ...p, hasActed: true }
          if (p.id === tackleResult.loser.id)
            return { ...p, hasActed: true, gameStats: { ...p.gameStats, tacklesLost: p.gameStats.tacklesLost + 1 } }
          return p
        })
      }

      get().showEvent(tackleResult.event.message, 2000)
    }

    set({
      state: { ...state, players: newPlayers, ball: newBall, lastEvent, ballOwnerChangedThisTurn: ballOwnerChanged },
      drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
    })
  },

  passBall: (passerId, target) => {
    const { state } = get()
    if (!state) return

    const result = applyPass({ type: 'pass', playerId: passerId, target, receiverId: '' }, state)

    let newPlayers = [...state.players]
    let newBall = { ...state.ball }
    let ballOwnerChanged = state.ballOwnerChangedThisTurn

    // Mark passer as acted
    newPlayers = newPlayers.map(p =>
      p.id === passerId ? { ...p, hasActed: true, gameStats: { ...p.gameStats, passes: p.gameStats.passes + 1 } } : p
    )

    if (result.success && result.receiver) {
      // Pass completed — receiver gets ball but is now done for the turn
      newBall = { position: { ...result.receiver.position }, ownerId: result.receiver.id }
      newPlayers = newPlayers.map(p =>
        p.id === result.receiver!.id ? { ...p, hasActed: true, hasReceivedPass: true } : p
      )
      ballOwnerChanged = true
    } else if (result.interceptedBy) {
      // Interception — ball changes owner
      newBall = { position: { ...result.interceptedBy.position }, ownerId: result.interceptedBy.id }
      ballOwnerChanged = true
    } else if (result.event.type === 'offside') {
      // Offside - ball goes to nearest defender
      const defendingTeam: TeamSide = state.currentTurn === 1 ? 2 : 1
      const defenders = state.players.filter(p => p.team === defendingTeam)
      if (defenders.length > 0) {
        const nearest = defenders[0]
        newBall = { position: { ...nearest.position }, ownerId: nearest.id }
      }
      ballOwnerChanged = true
    }

    get().showEvent(result.event.message, 2000)

    set({
      state: {
        ...state,
        players: newPlayers,
        ball: newBall,
        passUsedThisTurn: true,
        ballOwnerChangedThisTurn: ballOwnerChanged,
        lastEvent: result.event,
      },
      drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
    })
  },

  shootBall: (shooterId, target) => {
    const { state } = get()
    if (!state) return

    const result = applyShot({ type: 'shoot', playerId: shooterId, target }, state)

    let newState: GameState

    if (result.scored) {
      // Update scorer stats
      const updatedPlayers = state.players.map(p =>
        p.id === shooterId ? { ...p, hasActed: true, gameStats: { ...p.gameStats, goalsScored: p.gameStats.goalsScored + 1 } } : p
      )
      newState = handleGoalScored({ ...state, players: updatedPlayers }, state.currentTurn)
    } else {
      // Save - give ball to goalkeeper
      const keeperId = result.savedBy?.id
      const newBall = keeperId
        ? { position: { ...result.savedBy!.position }, ownerId: keeperId }
        : state.ball
      const updatedPlayers = state.players.map(p => {
        if (p.id === shooterId) return { ...p, hasActed: true }
        if (keeperId && p.id === keeperId)
          return { ...p, gameStats: { ...p.gameStats, saves: p.gameStats.saves + 1 } }
        return p
      })
      newState = { ...state, players: updatedPlayers, ball: newBall, lastEvent: result.event }
    }

    get().showEvent(result.event.message, 3000)

    set({
      state: newState,
      drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
    })
  },

  endCurrentTurn: () => {
    const { state } = get()
    if (!state) return

    const newState = endTurn(state)

    // Check half-time transition
    if (newState.phase === 'half_time') {
      const htState = handleHalfTime(newState)
      set({ state: htState })
      get().showEvent('Half Time!', 3000)
      return
    }

    if (newState.phase === 'full_time') {
      set({ state: newState })
      get().showEvent('Full Time!', 5000)
      return
    }

    set({ state: newState })
  },

  executeAI: () => {
    const { state } = get()
    if (!state) return

    const actions = executeAITurn(state)
    const store = get()

    // Apply actions sequentially
    for (const action of actions) {
      if (action.type === 'move') {
        store.movePlayer(action.playerId, action.target)
      } else if (action.type === 'pass') {
        store.passBall(action.playerId, action.target)
      } else if (action.type === 'shoot') {
        store.shootBall(action.playerId, action.target)
      }
    }

    // End AI turn
    store.endCurrentTurn()
  },

  showEvent: (message, durationMs = 2000) => {
    const prev = get().eventTimeout
    if (prev) clearTimeout(prev)

    const timeout = setTimeout(() => {
      set({ eventMessage: null, eventTimeout: null })
    }, durationMs)

    set({ eventMessage: message, eventTimeout: timeout })
  },

  clearEvent: () => {
    const prev = get().eventTimeout
    if (prev) clearTimeout(prev)
    set({ eventMessage: null, eventTimeout: null })
  },

  setState: (state) => set({ state }),

  reset: () => set({
    state: null,
    drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
    eventMessage: null,
  }),
}))
