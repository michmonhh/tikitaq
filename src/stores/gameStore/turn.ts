import type { GamePhase, TeamSide } from '../../engine/types'
import { endTurn, handleHalfTime } from '../../engine/turn'
import { repositionForSetPiece } from '../../engine/ai/setPiece'
import { enforceCrossTeamSpacing } from '../../engine/ai/setPieceHelpers'
import { addTicker, isSetPiecePhase } from './helpers'
import type { GameStore, StoreSet, StoreGet } from './types'

export function makeEndCurrentTurn(set: StoreSet, get: StoreGet): GameStore['endCurrentTurn'] {
  return () => {
    const { state } = get()
    if (!state) return
    set({ selectedPlayerId: null })

    const newState = endTurn(state)

    // Check half-time transition
    if (newState.phase === 'half_time') {
      let htState = handleHalfTime(newState)
      htState = addTicker(htState, 'Halbzeit', 'half_time')
      htState = addTicker(htState, 'Anpfiff – 2. Halbzeit', 'kickoff')
      set({ state: htState })
      get().showEvent('Half Time!', 3000)
      return
    }

    if (newState.phase === 'full_time') {
      const ftState = addTicker(newState, 'Abpfiff – Spielende', 'half_time')
      set({ state: ftState })
      get().showEvent('Full Time!', 5000)
      return
    }

    set({ state: newState })
  }
}

export function makeConfirmKickoff(set: StoreSet, get: StoreGet): GameStore['confirmKickoff'] {
  return () => {
    const { state, isVsAI } = get()
    if (!state) return
    set({ selectedPlayerId: null })
    const validPhases: GamePhase[] = ['kickoff', 'free_kick', 'corner', 'throw_in']
    if (!validPhases.includes(state.phase)) return

    const isSetPiece = isSetPiecePhase(state.phase)
    const takerId = isSetPiece ? state.ball.ownerId : null

    // Determine which team actually has the ball (the real set-piece taker's team).
    // MatchScreen may have temporarily set currentTurn=1 so the user can reposition
    // their defenders while the AI has the ball — we must not trust state.currentTurn here.
    const ballOwnerPlayer = state.ball.ownerId
      ? state.players.find(p => p.id === state.ball.ownerId)
      : null
    const trueTurn: TeamSide = ballOwnerPlayer?.team ?? state.currentTurn
    const userHasBall = trueTurn === 1

    // AI repositions in response to player's setup — only when the USER is taking
    // the set piece (ball belongs to team 1). When AI has the ball, both teams are
    // already positioned from the foul/offside handler; no repositioning needed.
    let updatedPlayers = state.players
    if (isVsAI && isSetPiece && userHasBall) {
      const aiTeam: TeamSide = 2
      const setPiecePhase = state.phase as 'free_kick' | 'corner' | 'throw_in'
      const aiActions = repositionForSetPiece(
        { ...state, players: updatedPlayers },
        aiTeam,
        setPiecePhase,
      )
      // Apply AI repositioning
      for (const action of aiActions) {
        if (action.type === 'move') {
          updatedPlayers = updatedPlayers.map(p =>
            p.id === action.playerId
              ? { ...p, position: { ...action.target }, origin: { ...action.target } }
              : p,
          )
        }
      }

      // Final cross-team spacing enforcement
      const fixedIds = new Set<string>()
      if (takerId) fixedIds.add(takerId)
      enforceCrossTeamSpacing(updatedPlayers, fixedIds)
    }

    // Reset all player flags; lock set piece taker (hasMoved=true → can't move after pass)
    const players = updatedPlayers.map(p => ({
      ...p,
      hasActed: false,
      hasMoved: p.id === takerId, // Taker is "pre-moved" → after passing, hasActed=true
      hasPassed: false,
      hasReceivedPass: false,
      origin: { ...p.position },
    }))

    set({
      state: {
        ...state,
        players,
        phase: 'playing',
        currentTurn: trueTurn, // Always the ball-owner's team, regardless of the MatchScreen hack
        passesThisTurn: 0,
        ballOwnerChangedThisTurn: false,
        mustPass: true, // Ball carrier must pass before anyone else can move
        lastSetPiece: state.phase, // Track which set piece was just confirmed (corners → no offside)
      },
    })
  }
}
