import type { GameEvent, GameState, Position, TeamSide, TeamMatchStats } from '../../engine/types'
import { applyMove } from '../../engine/movement'
import { resolveTackle } from '../../engine/tackle'
import { repositionForSetPiece, repositionForPenalty } from '../../engine/ai/setPiece'
import { enforceCrossTeamSpacing } from '../../engine/ai/setPieceHelpers'
import { adjustConfidence } from '../../engine/confidence'
import { aiChoosePenaltyDirection } from '../../engine/shooting'
import { PITCH } from '../../engine/constants'
import { addTicker, updateTeamStats, isSetPiecePhase } from './helpers'
import type { GameStore, StoreSet, StoreGet } from './types'

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

    // During kickoff: free positioning in own half
    if (state.phase === 'kickoff') {
      if (state.ball.ownerId === playerId) return // Ball carrier stays at center

      const clampedTarget = { ...target }
      if (movingPlayer.team === 1) clampedTarget.y = Math.max(50, Math.min(97, clampedTarget.y))
      else clampedTarget.y = Math.max(3, Math.min(50, clampedTarget.y))
      clampedTarget.x = Math.max(4, Math.min(96, clampedTarget.x))

      // Non-kicking team can't enter the center circle
      if (movingPlayer.team !== state.currentTurn) {
        const dx = clampedTarget.x - 50
        const dy = clampedTarget.y - 50
        const dist = Math.sqrt(dx * dx + dy * dy)
        const minDist = 9.65
        if (dist < minDist) {
          const angle = Math.atan2(dy, dx)
          clampedTarget.x = 50 + Math.cos(angle) * minDist
          clampedTarget.y = 50 + Math.sin(angle) * minDist
        }
      }

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

    // During penalty: defending team can reposition freely, TW on goal line
    if (state.phase === 'penalty') {
      // Shooter (ball carrier) can't be moved
      if (state.ball.ownerId === playerId) return

      let clampedTarget: Position
      if (movingPlayer.positionLabel === 'TW') {
        // TW constrained to goal line
        const goalLineY = movingPlayer.team === 1 ? 97 : 3
        clampedTarget = { x: Math.max(32, Math.min(68, target.x)), y: goalLineY }
      } else {
        // Free positioning (like set piece)
        clampedTarget = {
          x: Math.max(4, Math.min(96, target.x)),
          y: Math.max(3, Math.min(97, target.y)),
        }
      }

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

    // During set piece phases (free kick, corner, throw-in): free positioning
    if (isSetPiecePhase(state.phase)) {
      const player = state.players.find(p => p.id === playerId)
      if (!player) return
      // Set piece taker (ball carrier) can't be moved
      if (state.ball.ownerId === playerId) return

      const clampedTarget = {
        x: Math.max(4, Math.min(96, target.x)),
        y: Math.max(3, Math.min(97, target.y)),
      }

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

      get().showEvent(tackleResult.event.message, 3000, tackleResult.event.type)

      if (tackleResult.outcome === 'foul') {
        // FOUL — fouled player gets ball, transition to free kick phase
        foulOccurred = true
        newBall = { ...newBall, ownerId: tackleResult.winner.id, position: { ...tackleResult.winner.position } }
        ballOwnerChanged = true

        // Update players
        newPlayers = newPlayers.map(p => {
          if (p.id === tackleResult.loser.id) {
            // Fouler: update card stats
            const updatedPlayer = adjustConfidence({ ...p, hasActed: true }, 'tackle_lost')
            return {
              ...updatedPlayer,
              gameStats: {
                ...updatedPlayer.gameStats,
                tacklesLost: updatedPlayer.gameStats.tacklesLost + 1,
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
      const trackedPlayers = newPlayers
      if (tackleResult.outcome === 'foul') {
        // Track foul + cards
        const cardStats: Partial<TeamMatchStats> = { fouls: 1 }
        if (tackleResult.card === 'yellow') cardStats.yellowCards = 1
        if (tackleResult.card === 'red') cardStats.redCards = 1
        // We'll apply via updateTeamStats below
      }

      // Build final state for tackle
      let tackleState: GameState = { ...state, players: trackedPlayers, ball: newBall, lastEvent, ballOwnerChangedThisTurn: ballOwnerChanged, tackleAttemptedThisTurn: true }

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
          const fouledTeam: TeamSide = tacklerTeam === 1 ? 2 : 1
          const penaltySpotY = fouledTeam === 1 ? PITCH.PENALTY_SPOT_TOP_Y : PITCH.PENALTY_SPOT_BOTTOM_Y

          // Finde den ST des fouled teams (Schütze) und den TW des fouling teams (Keeper)
          const shooter = tackleState.players.find(p => p.team === fouledTeam && p.positionLabel === 'ST')
          const keeper = tackleState.players.find(p => p.team === tacklerTeam && p.positionLabel === 'TW')
          if (!shooter || !keeper) {
            // Fallback: kein ST/TW gefunden → normaler Freistoß für gefoultes Team
            set({
              state: {
                ...tackleState,
                phase: 'free_kick',
                currentTurn: fouledTeam,
                mustPass: true,
                lastSetPiece: 'free_kick',
                passesThisTurn: 0,
                ballOwnerChangedThisTurn: false,
              },
              drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
              selectedPlayerId: null,
            })
            return
          }

          // Ball auf den Elfmeterpunkt, ST bekommt den Ball
          const penaltyBall = { ...tackleState.ball, position: { x: PITCH.CENTER_X, y: penaltySpotY }, ownerId: shooter.id }

          // ST auf den Elfmeterpunkt positionieren
          let penaltyPlayers = tackleState.players.map(p => {
            if (p.id === shooter.id) {
              return { ...p, position: { x: PITCH.CENTER_X, y: penaltySpotY }, origin: { x: PITCH.CENTER_X, y: penaltySpotY } }
            }
            if (p.id === keeper.id) {
              // TW auf die Torlinie, zentral
              const goalY = tacklerTeam === 1 ? 100 : 0
              return { ...p, position: { x: PITCH.CENTER_X, y: goalY + (tacklerTeam === 1 ? -2 : 2) }, origin: { x: PITCH.CENTER_X, y: goalY + (tacklerTeam === 1 ? -2 : 2) } }
            }
            return p
          })

          // AI pre-commits keeper direction when defending team is AI-controlled
          const localTeam = get().localTeam
          const aiDefending = !localTeam || localTeam === fouledTeam
          const keeperDir = aiDefending ? aiChoosePenaltyDirection() : null

          // Position both teams — pass keeperChoice to defending team for strategic setup
          const defTeam: TeamSide = fouledTeam === 1 ? 2 : 1
          for (const team of [1 as TeamSide, 2 as TeamSide]) {
            const repoActions = repositionForPenalty(
              { ...tackleState, players: penaltyPlayers, ball: penaltyBall },
              team, fouledTeam, shooter.id, keeper.id,
              false, // not reactive at initial setup
              team === defTeam ? keeperDir : undefined,
            )
            for (const action of repoActions) {
              if (action.type === 'move') {
                penaltyPlayers = penaltyPlayers.map(p =>
                  p.id === action.playerId
                    ? { ...p, position: { ...action.target }, origin: { ...action.target } }
                    : p
                )
              }
            }
          }

          // Final cross-team spacing enforcement
          enforceCrossTeamSpacing(penaltyPlayers, new Set([shooter.id, keeper.id]))

          set({
            state: { ...tackleState, players: penaltyPlayers, ball: penaltyBall, phase: 'penalty' },
            penaltyState: {
              shooterTeam: fouledTeam,
              shooterId: shooter.id,
              keeperId: keeper.id,
              shooterChoice: null,
              keeperChoice: keeperDir,
            },
            drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
            selectedPlayerId: null,
          })
        } else {
          // Normaler Freistoß — gefoultes Team bekommt den Ball
          const fouledTeam: TeamSide = tacklerTeam === 1 ? 2 : 1
          const fkPos = tackleResult.winner.position
          const fkBallPos = { x: fkPos.x, y: fkPos.y }

          // FK-Taker: Spieler dessen origin am nächsten zur Foul-Stelle liegt
          let fkPlayers = tackleState.players
          const fkTaker = fkPlayers
            .filter(p => p.team === fouledTeam && p.positionLabel !== 'TW')
            .sort((a, b) => {
              const da = Math.sqrt((a.origin.x - fkBallPos.x) ** 2 + (a.origin.y - fkBallPos.y) ** 2)
              const db = Math.sqrt((b.origin.x - fkBallPos.x) ** 2 + (b.origin.y - fkBallPos.y) ** 2)
              return da - db
            })[0]

          if (fkTaker) {
            fkPlayers = fkPlayers.map(p =>
              p.id === fkTaker.id
                ? { ...p, position: { ...fkBallPos }, origin: { ...fkBallPos } }
                : p
            )
          }
          const fkBall = { position: { ...fkBallPos }, ownerId: fkTaker?.id ?? null }

          // Beide Teams aufstellen
          for (const team of [1 as TeamSide, 2 as TeamSide]) {
            const spState = { ...tackleState, players: fkPlayers, ball: fkBall }
            const spActions = repositionForSetPiece(spState, team, 'free_kick')
            for (const action of spActions) {
              if (action.type === 'move') {
                fkPlayers = fkPlayers.map(p =>
                  p.id === action.playerId
                    ? { ...p, position: { ...action.target }, origin: { ...action.target } }
                    : p
                )
              }
            }
          }
          enforceCrossTeamSpacing(fkPlayers, new Set(fkTaker ? [fkTaker.id] : []))

          set({
            state: {
              ...tackleState,
              players: fkPlayers.map(p => ({
                ...p,
                hasActed: false,
                hasMoved: p.id === fkTaker?.id,
                hasPassed: false,
                hasReceivedPass: false,
                origin: { ...p.position },
              })),
              ball: fkBall,
              phase: 'free_kick',
              currentTurn: fouledTeam,
              passesThisTurn: 0,
              ballOwnerChangedThisTurn: false,
              mustPass: true,
              lastSetPiece: 'free_kick',
            },
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
