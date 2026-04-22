import type { GameEvent, GameState, TeamMatchStats } from '../../engine/types'
import { applyMove } from '../../engine/movement'
import { resolveTackle } from '../../engine/tackle'
import { recordTackleEvent } from '../../engine/ai'
import { adjustConfidence } from '../../engine/confidence'
import { addTicker, updateTeamStats, isSetPiecePhase } from './helpers'
import type { GameStore, StoreSet, StoreGet } from './types'
import { clampKickoffTarget, clampPenaltyTarget, clampSetPieceTarget } from './move/clampers'
import { handleFoulPenalty } from './move/tacklePenalty'
import { handleFoulFreeKick } from './move/tackleFreeKick'

export function makeMovePlayer(set: StoreSet, get: StoreGet): GameStore['movePlayer'] {
  return (playerId, target) => {
    const { state, localTeam } = get()
    if (!state) return

    // Gegnerische Spieler dürfen nie bewegt werden
    const movingPlayer = state.players.find(p => p.id === playerId)
    if (!movingPlayer) return
    // Block human from moving opponent players (only during human's turn)
    // During AI turn (currentTurn !== localTeam), AI must be able to move its own team
    if (localTeam && movingPlayer.team !== localTeam && state.currentTurn === localTeam) return

    // --- Set-piece-like repositioning phases: kickoff / penalty / free_kick / corner / throw_in ---
    if (state.phase === 'kickoff') {
      if (state.ball.ownerId === playerId) return // Ball carrier stays at center

      const clampedTarget = clampKickoffTarget(movingPlayer, target, state.currentTurn)
      const newPlayers = state.players.map(p =>
        p.id === playerId ? { ...p, position: { ...clampedTarget }, origin: { ...clampedTarget } } : p
      )
      set({
        state: { ...state, players: newPlayers },
        drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
        selectedPlayerId: null,
      })
      return
    }

    if (state.phase === 'penalty') {
      // Shooter (ball carrier) can't be moved
      if (state.ball.ownerId === playerId) return

      const clampedTarget = clampPenaltyTarget(movingPlayer, target)
      const newPlayers = state.players.map(p =>
        p.id === playerId ? { ...p, position: { ...clampedTarget }, origin: { ...clampedTarget } } : p
      )
      set({
        state: { ...state, players: newPlayers },
        drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
        selectedPlayerId: null,
      })
      return
    }

    if (isSetPiecePhase(state.phase)) {
      // Set piece taker (ball carrier) can't be moved
      if (state.ball.ownerId === playerId) return

      const clampedTarget = clampSetPieceTarget(target)
      const newPlayers = state.players.map(p =>
        p.id === playerId ? { ...p, position: { ...clampedTarget }, origin: { ...clampedTarget } } : p
      )
      set({
        state: { ...state, players: newPlayers },
        drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
        selectedPlayerId: null,
      })
      return
    }

    // --- Playing phase ---
    // Must pass first after kickoff — no movement allowed during playing phase
    if (state.mustPass) return

    if (movingPlayer.hasActed) return

    // Tackle lock: player lost a tackle and is locked for this turn
    if (movingPlayer.tackleLocked) {
      get().showEvent('Tackling-Sperre', 2000, 'rule_tacklelock')
      set({
        drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
        selectedPlayerId: null,
      })
      return
    }

    // Players involved in a pass (passer or receiver) can only move once
    const involvedInPass = movingPlayer.hasPassed || movingPlayer.hasReceivedPass
    if (involvedInPass && movingPlayer.hasMoved) return

    const result = applyMove({ type: 'move', playerId, target }, state)

    // Determine if player is done after this move
    const isDoneAfterMove = involvedInPass // Was in a pass → one move allowed, now done
    const updatedPlayer = {
      ...result.updatedPlayer,
      hasActed: isDoneAfterMove,
      // Origin stays fixed for the entire turn — movement radius always calculated from turn start
      origin: movingPlayer.origin,
      hasMoved: involvedInPass ? true : false,
    }

    let newPlayers = state.players.map(p =>
      p.id === playerId ? updatedPlayer : p
    )
    let newBall = { ...state.ball }
    // Sync ball position when carrier moves (fixes animation start for subsequent passes)
    if (state.ball.ownerId === playerId) {
      newBall = { ...newBall, position: { ...updatedPlayer.position } }
    }
    let lastEvent: GameEvent | null = result.event
    let ballOwnerChanged = state.ballOwnerChangedThisTurn

    // Ball pickup (only if ball hasn't changed owner this turn)
    if (result.ballPickedUp && !ballOwnerChanged) {
      newBall = { ...newBall, ownerId: playerId }
      ballOwnerChanged = true
    }

    // One-tackle-per-turn rule: block second tackle attempt
    if (result.tackle && get().gameSettings.oneTacklePerTurn && state.tackleAttemptedThisTurn) {
      get().showEvent('Nur ein Tackling pro Zug', 2000, 'rule_tackle')
      set({
        drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
        selectedPlayerId: null,
      })
      return
    }

    // Tackle resolution
    let foulOccurred = false
    if (result.tackle) {
      const tackleResult = resolveTackle(result.tackle)
      lastEvent = tackleResult.event
      const tacklerTeam = result.tackle.defender.team

      // AI identity: record tackle outcome for both teams' plans.
      // winner is the player who ends up with the ball (fouled player on foul).
      recordTackleEvent(tackleResult.winner.team, tackleResult.loser.team)

      get().showEvent(tackleResult.event.message, 3000, tackleResult.event.type)

      if (tackleResult.outcome === 'foul') {
        // FOUL — fouled player gets ball, transition to free kick phase
        foulOccurred = true
        newBall = { ...newBall, ownerId: tackleResult.winner.id, position: { ...tackleResult.winner.position } }
        ballOwnerChanged = true

        // Update players (fouler card stats + confidence)
        newPlayers = newPlayers.map(p => {
          if (p.id === tackleResult.loser.id) {
            const updated = adjustConfidence({ ...p, hasActed: true }, 'tackle_lost')
            return {
              ...updated,
              gameStats: {
                ...updated.gameStats,
                tacklesLost: updated.gameStats.tacklesLost + 1,
              },
            }
          }
          if (p.id === tackleResult.winner.id) {
            return adjustConfidence({ ...p, hasActed: true }, 'tackle_won')
          }
          return p
        })
      } else if (tackleResult.outcome === 'won') {
        newBall = { ...newBall, ownerId: tackleResult.winner.id, position: { ...tackleResult.winner.position } }
        ballOwnerChanged = true
        const applyTackleLock = get().gameSettings.tacklingLock
        newPlayers = newPlayers.map(p => {
          if (p.id === tackleResult.winner.id)
            return adjustConfidence({ ...p, hasActed: true, gameStats: { ...p.gameStats, tacklesWon: p.gameStats.tacklesWon + 1 } }, 'tackle_won')
          if (p.id === tackleResult.loser.id)
            return adjustConfidence({ ...p, hasActed: true, tackleLocked: applyTackleLock, cannotTackle: true, gameStats: { ...p.gameStats, tacklesLost: p.gameStats.tacklesLost + 1 } }, 'tackle_lost')
          return p
        })
      } else {
        // Lost
        newPlayers = newPlayers.map(p => {
          if (p.id === tackleResult.winner.id) return adjustConfidence({ ...p, hasActed: true }, 'tackle_won')
          if (p.id === tackleResult.loser.id) return adjustConfidence({ ...p, hasActed: true, gameStats: { ...p.gameStats, tacklesLost: p.gameStats.tacklesLost + 1 } }, 'tackle_lost')
          return p
        })
      }

      // Track stats + ticker
      if (tackleResult.outcome === 'foul') {
        // Track foul + cards
        const cardStats: Partial<TeamMatchStats> = { fouls: 1 }
        if (tackleResult.card === 'yellow') cardStats.yellowCards = 1
        if (tackleResult.card === 'red') cardStats.redCards = 1
        // We'll apply via updateTeamStats below
      }

      // Build final state for tackle
      let tackleState: GameState = { ...state, players: newPlayers, ball: newBall, lastEvent, ballOwnerChangedThisTurn: ballOwnerChanged, tackleAttemptedThisTurn: true }

      tackleState = updateTeamStats(tackleState, tacklerTeam, s => ({
        tacklesWon: s.tacklesWon + (tackleResult.outcome === 'won' ? 1 : 0),
        tacklesLost: s.tacklesLost + (tackleResult.outcome !== 'won' ? 1 : 0),
        fouls: s.fouls + (tackleResult.outcome === 'foul' ? 1 : 0),
        yellowCards: s.yellowCards + (tackleResult.card === 'yellow' ? 1 : 0),
        redCards: s.redCards + (tackleResult.card === 'red' ? 1 : 0),
      }))
      tackleState = addTicker(tackleState, tackleResult.event.message, tackleResult.event.type, tacklerTeam)

      if (foulOccurred) {
        if (tackleResult.inPenaltyArea) {
          // ELFMETER — Foul im Strafraum
          const { newState, newPenaltyState } = handleFoulPenalty(tackleState, tacklerTeam, get().localTeam)
          if (newPenaltyState === null) {
            // Fallback path: no ST/TW → free kick for fouled team
            set({
              state: newState,
              drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
              selectedPlayerId: null,
            })
            return
          }
          set({
            state: newState,
            penaltyState: newPenaltyState,
            drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
            selectedPlayerId: null,
          })
        } else {
          // Normaler Freistoß — gefoultes Team bekommt den Ball
          const fkState = handleFoulFreeKick(tackleState, tackleResult, tacklerTeam)
          set({
            state: fkState,
            drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
            selectedPlayerId: null,
          })
        }
        return
      }

      // No foul — set normally
      set({
        state: tackleState,
        drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
        selectedPlayerId: null,
      })
      return
    }

    // No tackle — just move
    set({
      state: { ...state, players: newPlayers, ball: newBall, lastEvent, ballOwnerChangedThisTurn: ballOwnerChanged },
      drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
      selectedPlayerId: null,
    })
  }
}
