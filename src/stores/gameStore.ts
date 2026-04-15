import { create } from 'zustand'
import type { GameState, TeamSide, Position, GameEvent, GamePhase, PlayerAction, PlayerData, TickerEntry, TeamMatchStats, PenaltyState, PenaltyDirection } from '../engine/types'
import { createFormation } from '../engine/formation'
import { createInitialGameState, endTurn, handleGoalScored, handleHalfTime } from '../engine/turn'
import { applyMove } from '../engine/movement'
import { applyPass } from '../engine/passing'
import { applyShot } from '../engine/shooting'
import { resolveTackle } from '../engine/tackle'
import { executeAITurn, getAIReasoning, resetOpponentModel, initAIPlan, getAITickerMessages } from '../engine/ai'
import { repositionForSetPiece, repositionForPenalty } from '../engine/ai/setPiece'
import { enforceCrossTeamSpacing } from '../engine/ai/setPieceHelpers'
import { animator } from '../canvas/Animator'
import { adjustConfidence } from '../engine/confidence'
import { calculateShotAccuracy, resolvePenalty, aiChoosePenaltyDirection } from '../engine/shooting'
import { PITCH } from '../engine/constants'

function addTicker(state: GameState, message: string, type: GameEvent['type'], team?: TeamSide): GameState {
  const entry: TickerEntry = { minute: state.gameTime, message, type, team }
  return { ...state, ticker: [...state.ticker, entry] }
}

function updateTeamStats(
  state: GameState,
  team: TeamSide,
  updater: (s: TeamMatchStats) => Partial<TeamMatchStats>
): GameState {
  const key = team === 1 ? 'team1' : 'team2'
  const stats = { ...state.matchStats }
  stats[key] = { ...stats[key], ...updater(stats[key]) }
  return { ...state, matchStats: stats }
}

/** Finde den nächsten Außenverteidiger auf einer Seite für Einwurf */
function findThrowInTaker(players: PlayerData[], team: TeamSide, throwX: number): PlayerData | null {
  const teamPlayers = players.filter(p => p.team === team)
  const isLeftSide = throwX < 50
  // Prefer fullback on the correct side
  const fullbacks = teamPlayers.filter(p => ['LV', 'RV'].includes(p.positionLabel))
  const sideFullback = fullbacks.find(p =>
    isLeftSide ? p.position.x < 50 : p.position.x >= 50
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
function findCornerTaker(players: PlayerData[], team: TeamSide): PlayerData | null {
  const teamPlayers = players.filter(p => p.team === team && p.positionLabel !== 'TW')
  // Prefer LM/RM (wingers) or OM based on highPassing stat
  const candidates = teamPlayers
    .filter(p => ['LM', 'RM', 'OM', 'ZDM'].includes(p.positionLabel))
    .sort((a, b) => b.stats.highPassing - a.stats.highPassing)
  return candidates[0] ?? teamPlayers[0] ?? null
}

/** Determine penalty direction from x position (goal range 38-62) */
function directionFromX(x: number): PenaltyDirection {
  if (x < 46) return 'left'
  if (x > 54) return 'right'
  return 'center'
}

/** Check if a set piece phase */
function isSetPiecePhase(phase: GamePhase): boolean {
  return phase === 'free_kick' || phase === 'corner' || phase === 'throw_in' || phase === 'penalty' || phase === 'penalty_kick'
}

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

  // Selected player (tapped, shows info)
  selectedPlayerId: string | null

  // AI reasoning (last turn explanations)
  aiReasoning: Map<string, string>

  // Event display
  eventMessage: string | null
  eventTimeout: ReturnType<typeof setTimeout> | null
  overlayLabel: string | null
  overlayColor: string | null

  // Penalty state
  penaltyState: PenaltyState | null

  // Game rules (togglable settings)
  gameSettings: {
    oneTacklePerTurn: boolean
    allowDoublePass: boolean
    tacklingLock: boolean
  }
  setGameSetting: <K extends keyof GameStore['gameSettings']>(key: K, value: GameStore['gameSettings'][K]) => void

  // Actions
  initGame: (team1Id?: number, team2Id?: number, isVsAI?: boolean) => void
  selectPlayer: (playerId: string | null) => void
  setActivePlayer: (playerId: string | null) => void
  setDragBall: (isDragging: boolean, pos?: Position) => void
  updateDragPosition: (pos: Position) => void

  movePlayer: (playerId: string, target: Position) => void
  passBall: (passerId: string, target: Position, receiverId?: string) => void
  shootBall: (shooterId: string, target: Position) => void
  endCurrentTurn: () => void
  confirmKickoff: () => void
  confirmPenaltyDefense: () => void
  executeAI: () => void
  executeAIAnimated: () => void
  aiRunning: boolean

  showEvent: (message: string, durationMs?: number, eventType?: string) => void
  clearEvent: () => void

  // For multiplayer sync
  setState: (state: GameState) => void
  setLocalTeam: (team: TeamSide) => void
  setDuel: (isDuel: boolean) => void
  reset: () => void
}

export const useGameStore = create<GameStore>((set, get) => ({
  state: null,
  isVsAI: false,
  isDuel: false,
  aiRunning: false,
  localTeam: null,
  aiReasoning: new Map(),

  drag: {
    activePlayerId: null,
    isDraggingBall: false,
    dragPosition: null,
  },

  selectedPlayerId: null,

  eventMessage: null,
  eventTimeout: null,
  overlayLabel: null,
  overlayColor: null,

  penaltyState: null,

  gameSettings: {
    oneTacklePerTurn: false,
    allowDoublePass: true,
    tacklingLock: false,
  },

  setGameSetting: (key, value) => set(s => ({
    gameSettings: { ...s.gameSettings, [key]: value },
  })),

  selectPlayer: (playerId) => set({ selectedPlayerId: playerId }),

  initGame: (team1Id, team2Id, isVsAI = true) => {
    resetOpponentModel() // Clear opponent learning data for new match
    const players = createFormation(team1Id, team2Id)
    let state = createInitialGameState(players)
    // Anstoß-Ticker
    state = addTicker(state, 'Anpfiff – 1. Halbzeit', 'kickoff')
    if (isVsAI) {
      initAIPlan(players, 2) // AI spielt als Team 2
    }
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
      let trackedPlayers = newPlayers
      if (tackleResult.outcome === 'foul') {
        // Track foul + cards
        const cardStats: Partial<import('../engine/types').TeamMatchStats> = { fouls: 1 }
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
  },

  passBall: (passerId, target, receiverId) => {
    const { state } = get()
    if (!state) return

    // Double pass rule: block second pass if not allowed
    if (!get().gameSettings.allowDoublePass && state.passesThisTurn >= 1) {
      get().showEvent('Nur ein Pass pro Zug', 2000, 'rule_pass')
      set({
        drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
        selectedPlayerId: null,
      })
      return
    }

    const result = applyPass({ type: 'pass', playerId: passerId, target, receiverId: receiverId ?? '' }, state)

    let newPlayers = [...state.players]
    let newBall = { ...state.ball }
    let ballOwnerChanged = state.ballOwnerChangedThisTurn

    // Mark passer: hasPassed=true, hasActed only if they already moved
    newPlayers = newPlayers.map(p => {
      if (p.id !== passerId) return p
      const doneAfterPass = p.hasMoved // Already moved → now fully done
      return { ...p, hasPassed: true, hasActed: doneAfterPass, gameStats: { ...p.gameStats, passes: p.gameStats.passes + 1 } }
    })

    if (result.success && result.receiver) {
      // Through ball into space: receiver runs to the target position
      const landingPos = result.receiverNewPosition ?? result.receiver.position
      newBall = { position: { ...landingPos }, ownerId: result.receiver.id }
      newPlayers = newPlayers.map(p => {
        if (p.id !== result.receiver!.id) return p
        // Through ball: receiver ran → hasMoved=true, fully done
        const ranToSpace = result.receiverNewPosition != null
        const doneAfterReceive = p.hasMoved || ranToSpace
        return {
          ...p,
          hasReceivedPass: true,
          hasActed: doneAfterReceive,
          hasMoved: p.hasMoved || ranToSpace,
          position: ranToSpace ? { ...landingPos } : p.position,
          origin: ranToSpace ? { ...landingPos } : p.origin,
        }
      })
      ballOwnerChanged = true
    } else if (result.interceptedBy) {
      // Interception — ball changes owner
      newBall = { position: { ...result.interceptedBy.position }, ownerId: result.interceptedBy.id }
      ballOwnerChanged = true
    } else if (result.event.type === 'offside') {
      // Abseits → Freistoß an der Stelle, wo der Ball gespielt wurde
      const defendingTeam: TeamSide = state.currentTurn === 1 ? 2 : 1
      const fkPos = result.event.position ?? newBall.position
      const fkBallPos = { x: fkPos.x, y: fkPos.y }

      // Freistoß-Nehmer: Spieler dessen Grundposition (origin) am nächsten zur Abseits-Stelle liegt
      const fkTaker = newPlayers
        .filter(p => p.team === defendingTeam && p.positionLabel !== 'TW')
        .sort((a, b) => {
          const da = Math.sqrt((a.origin.x - fkBallPos.x) ** 2 + (a.origin.y - fkBallPos.y) ** 2)
          const db = Math.sqrt((b.origin.x - fkBallPos.x) ** 2 + (b.origin.y - fkBallPos.y) ** 2)
          return da - db
        })[0]

      if (fkTaker) {
        newPlayers = newPlayers.map(p =>
          p.id === fkTaker.id
            ? { ...p, position: { ...fkBallPos }, origin: { ...fkBallPos } }
            : p
        )
        newBall = { position: { ...fkBallPos }, ownerId: fkTaker.id }
      }

      // Beide Teams aufstellen, dann Freistoß-Phase setzen
      for (const team of [1 as TeamSide, 2 as TeamSide]) {
        const spState = { ...state, players: newPlayers, ball: newBall }
        const spActions = repositionForSetPiece(spState, team, 'free_kick')
        for (const action of spActions) {
          if (action.type === 'move') {
            newPlayers = newPlayers.map(p =>
              p.id === action.playerId
                ? { ...p, position: { ...action.target }, origin: { ...action.target } }
                : p
            )
          }
        }
      }
      enforceCrossTeamSpacing(newPlayers, new Set(fkTaker ? [fkTaker.id] : []))

      set({
        state: {
          ...state,
          players: newPlayers.map(p => ({
            ...p,
            hasActed: false,
            hasMoved: p.id === fkTaker?.id,
            hasPassed: false,
            hasReceivedPass: false,
            origin: { ...p.position },
          })),
          ball: newBall,
          phase: 'free_kick',
          currentTurn: defendingTeam,
          ticker: [...state.ticker, {
            minute: state.gameTime,
            message: result.event.message,
            type: 'offside',
            team: state.currentTurn,
          }],
          passesThisTurn: 0,
          ballOwnerChangedThisTurn: false,
          mustPass: true,
          lastSetPiece: 'free_kick',
          lastEvent: result.event,
        },
        drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
        selectedPlayerId: null,
      })
      get().showEvent('Abseits', 3000, 'offside')
      return
    } else if (result.outOfBounds && result.ballLandingPos) {
      // Ball went out of bounds — transition to throw-in or corner phase
      const opposingTeam: TeamSide = state.currentTurn === 1 ? 2 : 1
      const landingPos = result.ballLandingPos

      if (result.outOfBounds === 'throw_in') {
        // --- THROW-IN ---
        const throwX = landingPos.x < 50 ? 4 : 96
        const throwY = Math.max(5, Math.min(95, landingPos.y))
        const throwPos = { x: throwX, y: throwY }

        const taker = findThrowInTaker(newPlayers, opposingTeam, throwX)
        if (taker) {
          newPlayers = newPlayers.map(p =>
            p.id === taker.id ? { ...p, position: { ...throwPos }, origin: { ...throwPos } } : p
          )
          newBall = { position: { ...throwPos }, ownerId: taker.id }
        } else {
          newBall = { position: { ...throwPos }, ownerId: null }
        }

        // Track stats + ticker, then transition to throw_in phase
        let trackedState = { ...state, players: newPlayers, ball: newBall }
        trackedState = updateTeamStats(trackedState, state.currentTurn, s => ({
          passesTotal: s.passesTotal + 1,
        }))
        trackedState = addTicker(trackedState, result.event.message, result.event.type, state.currentTurn)

        set({
          state: {
            ...trackedState,
            phase: 'throw_in',
            currentTurn: opposingTeam,
            passesThisTurn: 0,
            ballOwnerChangedThisTurn: false,
            mustPass: false,
            lastSetPiece: null,
            lastEvent: result.event,
          },
          drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
          selectedPlayerId: null,
        })
        get().showEvent('Einwurf', 2000, 'throw_in')
        return
      } else {
        // --- CORNER ---
        const attackingTeam = opposingTeam
        // Corner position: near the goal the attacking team targets
        const goalY = attackingTeam === 1 ? 3 : 97
        const cornerX = landingPos.x < 50 ? 4 : 96
        const cornerPos = { x: cornerX, y: goalY }

        const taker = findCornerTaker(newPlayers, attackingTeam)
        if (taker) {
          newPlayers = newPlayers.map(p =>
            p.id === taker.id ? { ...p, position: { ...cornerPos }, origin: { ...cornerPos } } : p
          )
          newBall = { position: { ...cornerPos }, ownerId: taker.id }
        } else {
          newBall = { position: { ...cornerPos }, ownerId: null }
        }

        // Track stats + ticker, then transition to corner phase
        let trackedState = { ...state, players: newPlayers, ball: newBall }
        trackedState = updateTeamStats(trackedState, state.currentTurn, s => ({
          passesTotal: s.passesTotal + 1,
          corners: s.corners + 1,
        }))
        trackedState = addTicker(trackedState, result.event.message, result.event.type, state.currentTurn)

        set({
          state: {
            ...trackedState,
            phase: 'corner',
            currentTurn: attackingTeam,
            passesThisTurn: 0,
            ballOwnerChangedThisTurn: false,
            mustPass: false,
            lastSetPiece: null,
            lastEvent: result.event,
          },
          drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
          selectedPlayerId: null,
        })
        get().showEvent('Ecke', 2000, 'corner')
        return
      }
    } else if (result.ballLandingPos) {
      // Pass missed — ball lands free at target position, no owner
      newBall = { position: { ...result.ballLandingPos }, ownerId: null }
      ballOwnerChanged = true
    }

    // Show on-field message only for turnovers
    if (['pass_intercepted', 'pass_lost'].includes(result.event.type)) {
      get().showEvent(result.event.message, 3000, result.event.type)
    }

    // Confidence updates
    newPlayers = newPlayers.map(p => {
      if (p.id === passerId) return adjustConfidence(p, result.success ? 'pass_complete' : 'pass_failed')
      if (result.interceptedBy && p.id === result.interceptedBy.id) return adjustConfidence(p, 'intercept')
      return p
    })

    // Track pass stats + ticker
    let trackedState = { ...state, players: newPlayers, ball: newBall }
    const passingTeam = state.currentTurn
    trackedState = updateTeamStats(trackedState, passingTeam, s => ({
      passesTotal: s.passesTotal + 1,
      passesCompleted: s.passesCompleted + (result.success ? 1 : 0),
      corners: s.corners + (result.outOfBounds === 'corner' ? 1 : 0),
    }))
    trackedState = addTicker(trackedState, result.event.message, result.event.type, passingTeam)

    set({
      state: {
        ...trackedState,
        passesThisTurn: state.passesThisTurn + 1,
        ballOwnerChangedThisTurn: ballOwnerChanged,
        mustPass: false,
        lastSetPiece: null, // Clear after first pass (corner no-offside only applies to direct pass)
        lastEvent: result.event,
      },
      drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
      selectedPlayerId: null,
    })
  },

  shootBall: (shooterId, target) => {
    const { state, penaltyState } = get()
    if (!state) return

    // ── Penalty: resolve via drag direction ──
    if (state.phase === 'penalty' && penaltyState) {
      const shooterChoice = directionFromX(target.x)
      // Use pre-committed keeper direction (AI decided at setup)
      const keeperChoice = penaltyState.keeperChoice ?? aiChoosePenaltyDirection()

      const ps: PenaltyState = { ...penaltyState, shooterChoice, keeperChoice }
      const shooter = state.players.find(p => p.id === ps.shooterId)!
      const keeper = state.players.find(p => p.id === ps.keeperId)!
      const result = resolvePenalty(ps, shooter, keeper)

      let newState = addTicker(state, result.event.message, result.event.type, ps.shooterTeam)
      get().showEvent(result.event.message, 4000, result.event.type)

      // Show keeper in revealed position + ball at result position
      const goalY = ps.shooterTeam === 1 ? PITCH.GOAL_TOP_Y : PITCH.GOAL_BOTTOM_Y
      const keeperRevealX = keeperChoice === 'left' ? 40 : keeperChoice === 'right' ? 60 : 50
      const keeperRevealY = keeper.team === 1 ? 97 : 3
      const shotX = shooterChoice === 'left' ? 42 : shooterChoice === 'right' ? 58 : 50

      let resultPlayers = newState.players.map(p => {
        if (p.id === ps.keeperId) {
          return { ...p, position: { x: keeperRevealX, y: keeperRevealY }, origin: { x: keeperRevealX, y: keeperRevealY } }
        }
        return p
      })

      if (result.outcome === 'scored') {
        // Ball in the goal on shot side
        const ballPos = { x: shotX, y: goalY + (ps.shooterTeam === 1 ? 1 : -1) }
        const scoringPlayers = resultPlayers.map(p =>
          p.id === ps.shooterId
            ? { ...p, gameStats: { ...p.gameStats, goalsScored: p.gameStats.goalsScored + 1 } }
            : p
        )
        // Show result briefly, then trigger goal flow
        set({
          state: { ...newState, players: scoringPlayers, ball: { position: ballPos, ownerId: null }, phase: 'penalty' },
          penaltyState: null,
          drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
        })
        setTimeout(() => {
          const s = get().state
          if (!s) return
          let updatedState = handleGoalScored(s, ps.shooterTeam)
          updatedState = addTicker(updatedState, 'Wiederanstoß', 'kickoff')
          set({ state: updatedState })
        }, 2500)
      } else if (result.outcome === 'saved') {
        const reboundPos = result.reboundPos!
        const savedPlayers = resultPlayers.map(p =>
          p.id === ps.keeperId ? { ...p, gameStats: { ...p.gameStats, saves: p.gameStats.saves + 1 } } : p
        )
        // Show result, then free ball
        set({
          state: { ...newState, players: savedPlayers, ball: { position: reboundPos, ownerId: null }, phase: 'penalty' },
          penaltyState: null,
          drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
        })
        setTimeout(() => {
          const s = get().state
          if (!s) return
          set({ state: { ...s, phase: 'playing', mustPass: false, lastSetPiece: null } })
        }, 2500)
      } else {
        // Missed — show ball going wide, then goal kick
        const missX = shotX + (shotX < 50 ? -8 : 8)
        const missY = goalY + (ps.shooterTeam === 1 ? -3 : 3)
        set({
          state: { ...newState, players: resultPlayers, ball: { position: { x: missX, y: missY }, ownerId: null }, phase: 'penalty' },
          penaltyState: null,
          drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
        })
        setTimeout(() => {
          const s = get().state
          if (!s) return
          const defTeam: TeamSide = ps.shooterTeam === 1 ? 2 : 1
          const goalKickY = defTeam === 1 ? 95 : 5
          const goalKickPlayers = s.players.map(p =>
            p.id === ps.keeperId ? { ...p, position: { x: 50, y: goalKickY }, origin: { x: 50, y: goalKickY } } : p
          )
          set({
            state: {
              ...s, players: goalKickPlayers,
              ball: { position: { x: 50, y: goalKickY }, ownerId: ps.keeperId },
              phase: 'free_kick', currentTurn: defTeam, mustPass: true, lastSetPiece: null,
            },
          })
        }, 2500)
      }
      return
    }

    const result = applyShot({ type: 'shoot', playerId: shooterId, target }, state)

    let newState: GameState

    if (result.scored) {
      const updatedPlayers = state.players.map(p =>
        p.id === shooterId ? { ...p, hasActed: true, gameStats: { ...p.gameStats, goalsScored: p.gameStats.goalsScored + 1 } } : p
      )
      newState = handleGoalScored({ ...state, players: updatedPlayers }, state.currentTurn)
    } else if (result.event.type === 'shot_missed') {
      // Shot missed (went wide / over goal) → goal kick for defending team
      // Goalkeeper gets the ball inside the goal area (5m-Raum)
      const defendingTeam: TeamSide = state.currentTurn === 1 ? 2 : 1
      const keeper = state.players.find(p => p.team === defendingTeam && p.positionLabel === 'TW')
      // Place keeper in the 5m goal area
      const goalKickY = defendingTeam === 1 ? 95 : 5
      const goalKickPos = { x: 50, y: goalKickY }

      let updatedPlayers = state.players.map(p => {
        if (p.id === shooterId) return { ...p, hasActed: true }
        if (keeper && p.id === keeper.id) return { ...p, position: { ...goalKickPos }, origin: { ...goalKickPos } }
        return p
      })
      const newBall = keeper
        ? { position: { ...goalKickPos }, ownerId: keeper.id }
        : { position: { ...goalKickPos }, ownerId: null }
      newState = { ...state, players: updatedPlayers, ball: newBall, lastEvent: result.event }
    } else {
      // Save — give ball to goalkeeper at his position
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

    get().showEvent(result.event.message, 3000, result.event.type)

    // Confidence updates for shots
    const confEvent = result.scored ? 'shot_scored' as const
      : result.event.type === 'shot_missed' ? 'shot_missed' as const : 'shot_saved' as const
    newState = {
      ...newState,
      players: newState.players.map(p =>
        p.id === shooterId ? adjustConfidence(p, confEvent) : p
      ),
    }

    // Track shot stats + xG + ticker
    const shooter = state.players.find(p => p.id === shooterId)
    const shotAccuracy = shooter ? calculateShotAccuracy(shooter, shooter.position, state.currentTurn) : 0
    newState = updateTeamStats(newState, state.currentTurn, s => ({
      xG: s.xG + shotAccuracy,
      shotsOnTarget: s.shotsOnTarget + (result.event.type !== 'shot_missed' ? 1 : 0),
      shotsOff: s.shotsOff + (result.event.type === 'shot_missed' ? 1 : 0),
    }))
    newState = addTicker(newState, result.event.message, result.event.type, state.currentTurn)
    // Wiederanstoß-Eintrag nach Tor
    if (result.scored) {
      newState = addTicker(newState, 'Wiederanstoß', 'kickoff')
    }

    set({
      state: { ...newState, mustPass: false, lastSetPiece: null },
      drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
      selectedPlayerId: null,
    })
  },

  endCurrentTurn: () => {
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
  },

  confirmKickoff: () => {
    const { state, isVsAI } = get()
    if (!state) return
    set({ selectedPlayerId: null })
    const validPhases: GamePhase[] = ['kickoff', 'free_kick', 'corner', 'throw_in']
    if (!validPhases.includes(state.phase)) return

    const isSetPiece = isSetPiecePhase(state.phase)
    const takerId = isSetPiece ? state.ball.ownerId : null

    // AI repositions in response to player's setup (if player takes the set piece)
    let updatedPlayers = state.players
    if (isVsAI && isSetPiece) {
      const aiTeam: TeamSide = 2
      const setPiecePhase = state.phase as 'free_kick' | 'corner' | 'throw_in'
      const aiActions = repositionForSetPiece(
        { ...state, players: updatedPlayers },
        aiTeam,
        setPiecePhase
      )
      // Apply AI repositioning
      for (const action of aiActions) {
        if (action.type === 'move') {
          updatedPlayers = updatedPlayers.map(p =>
            p.id === action.playerId
              ? { ...p, position: { ...action.target }, origin: { ...action.target } }
              : p
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
        passesThisTurn: 0,
        ballOwnerChangedThisTurn: false,
        mustPass: true, // Ball carrier must pass before anyone else can move
        lastSetPiece: state.phase, // Track which set piece was just confirmed (corners → no offside)
      },
    })
  },

  // ── Elfmeter (Verteidigung) ──

  confirmPenaltyDefense: () => {
    const { state, penaltyState } = get()
    if (!state || !penaltyState) return

    // Phase 1: AI repositions its shooting team visibly
    const aiTeam = penaltyState.shooterTeam
    const repoActions = repositionForPenalty(
      state, aiTeam, penaltyState.shooterTeam,
      penaltyState.shooterId, penaltyState.keeperId,
      true, // reactive: analyse opponent positioning
    )
    let updatedPlayers = [...state.players]
    for (const action of repoActions) {
      if (action.type === 'move') {
        updatedPlayers = updatedPlayers.map(p =>
          p.id === action.playerId
            ? { ...p, position: { ...action.target }, origin: { ...action.target } }
            : p
        )
      }
    }

    // Final cross-team spacing enforcement
    enforceCrossTeamSpacing(updatedPlayers, new Set([penaltyState.shooterId, penaltyState.keeperId]))

    // Show AI repositioning, lock input (penaltyState=null → no more dragging)
    set({
      state: { ...state, players: updatedPlayers },
      penaltyState: null,
      drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
    })

    // Phase 2: After delay, resolve the penalty
    const savedPenalty = { ...penaltyState }
    setTimeout(() => {
      const currentState = get().state
      if (!currentState || currentState.phase !== 'penalty') return

      const keeper = currentState.players.find(p => p.id === savedPenalty.keeperId)
      if (!keeper) return
      const keeperChoice = directionFromX(keeper.position.x)
      const shooterChoice = aiChoosePenaltyDirection()

      const ps: PenaltyState = { ...savedPenalty, shooterChoice, keeperChoice }
      const shooter = currentState.players.find(p => p.id === ps.shooterId)!
      const result = resolvePenalty(ps, shooter, keeper)

      let newState = addTicker(currentState, result.event.message, result.event.type, ps.shooterTeam)
      get().showEvent(result.event.message, 4000, result.event.type)

      const goalY = ps.shooterTeam === 1 ? PITCH.GOAL_TOP_Y : PITCH.GOAL_BOTTOM_Y
      const shotX = shooterChoice === 'left' ? 42 : shooterChoice === 'right' ? 58 : 50
      const keeperRevealX = keeperChoice === 'left' ? 40 : keeperChoice === 'right' ? 60 : 50
      const keeperRevealY = keeper.team === 1 ? 97 : 3

      // Reveal keeper's committed position
      let resultPlayers = newState.players.map(p =>
        p.id === ps.keeperId
          ? { ...p, position: { x: keeperRevealX, y: keeperRevealY }, origin: { x: keeperRevealX, y: keeperRevealY } }
          : p
      )

      if (result.outcome === 'scored') {
        const ballPos = { x: shotX, y: goalY + (ps.shooterTeam === 1 ? 1 : -1) }
        resultPlayers = resultPlayers.map(p =>
          p.id === ps.shooterId
            ? { ...p, gameStats: { ...p.gameStats, goalsScored: p.gameStats.goalsScored + 1 } }
            : p
        )
        set({ state: { ...newState, players: resultPlayers, ball: { position: ballPos, ownerId: null }, phase: 'penalty' } })
        setTimeout(() => {
          const s = get().state
          if (!s) return
          let gs = handleGoalScored(s, ps.shooterTeam)
          gs = addTicker(gs, 'Wiederanstoß', 'kickoff')
          set({ state: gs })
        }, 2500)
      } else if (result.outcome === 'saved') {
        const reboundPos = result.reboundPos!
        resultPlayers = resultPlayers.map(p =>
          p.id === ps.keeperId ? { ...p, gameStats: { ...p.gameStats, saves: p.gameStats.saves + 1 } } : p
        )
        set({ state: { ...newState, players: resultPlayers, ball: { position: reboundPos, ownerId: null }, phase: 'penalty' } })
        setTimeout(() => {
          const s = get().state
          if (!s) return
          set({ state: { ...s, phase: 'playing', mustPass: false, lastSetPiece: null } })
        }, 2500)
      } else {
        const missX = shotX + (shotX < 50 ? -8 : 8)
        const missY = goalY + (ps.shooterTeam === 1 ? -3 : 3)
        set({ state: { ...newState, players: resultPlayers, ball: { position: { x: missX, y: missY }, ownerId: null }, phase: 'penalty' } })
        setTimeout(() => {
          const s = get().state
          if (!s) return
          const defTeam: TeamSide = ps.shooterTeam === 1 ? 2 : 1
          const goalKickY = defTeam === 1 ? 95 : 5
          const goalKickPlayers = s.players.map(p =>
            p.id === ps.keeperId ? { ...p, position: { x: 50, y: goalKickY }, origin: { x: 50, y: goalKickY } } : p
          )
          set({
            state: {
              ...s, players: goalKickPlayers,
              ball: { position: { x: 50, y: goalKickY }, ownerId: ps.keeperId },
              phase: 'free_kick', currentTurn: defTeam, mustPass: true, lastSetPiece: null,
            },
          })
        }, 2500)
      }
    }, 1500) // 1.5s delay: player sees AI repositioning before shot
  },

  executeAI: () => {
    const { state } = get()
    if (!state) return
    set({ selectedPlayerId: null })

    try {
      const actions = executeAITurn(state)
      set({ aiReasoning: getAIReasoning() })

      // AI-Ticker-Nachrichten verarbeiten (Taktikwechsel etc.)
      const tickerMsgs = getAITickerMessages()
      if (tickerMsgs.length > 0) {
        let s = get().state!
        for (const msg of tickerMsgs) {
          const entry: TickerEntry = { minute: s.gameTime, message: msg, type: 'tactic_change', team: state.currentTurn }
          s = { ...s, ticker: [...s.ticker, entry] }
        }
        set({ state: s })
      }

      for (const action of actions) {
        const currentState = get().state
        if (!currentState || currentState.phase !== 'playing') break
        try {
          if (action.type === 'move') get().movePlayer(action.playerId, action.target)
          else if (action.type === 'pass') get().passBall(action.playerId, action.target, action.receiverId)
          else if (action.type === 'shoot') get().shootBall(action.playerId, action.target)
        } catch (e) { console.error('[AI] Action crashed:', action.type, e) }
      }
    } catch (err) {
      console.error('[AI] executeAI crashed:', err)
    }

    get().endCurrentTurn()
  },

  /**
   * Execute AI turn with animated player movements.
   * Uses setTimeout chain — no async/await, no React dependency.
   * Wrapped in try-catch to prevent permanent "AI Thinking" hang.
   */
  executeAIAnimated: () => {
    const { state } = get()
    if (!state || get().aiRunning) return

    set({ aiRunning: true })

    // Safety timeout: if the chain hasn't finished in 15s, force-reset
    const safetyTimer = setTimeout(() => {
      if (get().aiRunning) {
        console.warn('[AI] Safety timeout — forcing aiRunning=false')
        get().endCurrentTurn()
        set({ aiRunning: false })
      }
    }, 15000)

    let actions: PlayerAction[]
    try {
      actions = executeAITurn(state)
    } catch (err) {
      console.error('[AI] executeAITurn crashed:', err)
      clearTimeout(safetyTimer)
      get().endCurrentTurn()
      set({ aiRunning: false })
      return
    }

    set({ aiReasoning: getAIReasoning() })

    // AI-Ticker-Nachrichten verarbeiten (Taktikwechsel etc.)
    const tickerMsgs = getAITickerMessages()
    if (tickerMsgs.length > 0) {
      let s = get().state!
      for (const msg of tickerMsgs) {
        const entry: TickerEntry = { minute: s.gameTime, message: msg, type: 'tactic_change', team: state.currentTurn }
        s = { ...s, ticker: [...s.ticker, entry] }
      }
      set({ state: s })
    }

    const MOVE_DURATION = 300  // ms per move animation
    const DELAY_BETWEEN = 100  // ms between actions

    // Aufgeschobene Ball-Animation — wird nach allen Spielerbewegungen abgespielt
    let deferredBallAnim: { from: Position; to: Position } | null = null

    function finishTurn() {
      clearTimeout(safetyTimer)

      // Aufgeschobene Ball-Animation abspielen bevor der Zug endet
      if (deferredBallAnim) {
        const { from, to } = deferredBallAnim
        deferredBallAnim = null
        animator.animateBall(from, to)

        // Warten bis Ball-Animation fertig, dann Zug beenden
        // ballDuration ist intern im Animator, daher grobe Schätzung
        const dx = to.x - from.x, dy = to.y - from.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const estimatedDuration = 200 + Math.min(1, dist / 80) * 1300
        setTimeout(() => {
          const currentState = get().state
          if (currentState && isSetPiecePhase(currentState.phase)) {
            set({ aiRunning: false })
            return
          }
          try { get().endCurrentTurn() } catch (e) { console.error('[AI] endCurrentTurn crashed:', e) }
          set({ aiRunning: false })
        }, estimatedDuration + 50)
        return
      }

      const currentState = get().state
      // Don't end turn if a set piece phase was triggered (foul, out of bounds)
      // The set piece phase must persist for repositioning
      if (currentState && isSetPiecePhase(currentState.phase)) {
        set({ aiRunning: false })
        return
      }
      try { get().endCurrentTurn() } catch (e) { console.error('[AI] endCurrentTurn crashed:', e) }
      set({ aiRunning: false })
    }

    function executeAction(index: number) {
      try {
        if (index >= actions.length) {
          finishTurn()
          return
        }

        const action = actions[index]
        const currentState = get().state
        if (!currentState) { finishTurn(); return }

        // Skip actions for phases that changed mid-chain (goal scored → kickoff, foul → free_kick)
        if (currentState.phase !== 'playing') {
          finishTurn()
          return
        }

        const player = currentState.players.find(p => p.id === action.playerId)
        if (!player) { executeAction(index + 1); return }

        if (action.type === 'move') {
          const fromPos = { ...player.position }
          animator.animate(player.id, fromPos, action.target, MOVE_DURATION)

          setTimeout(() => {
            try {
              get().movePlayer(action.playerId, action.target)
            } catch (e) { console.error('[AI] movePlayer crashed:', e) }

            // If a foul occurred, phase changes to free_kick — stop chain
            const s = get().state
            if (s && s.phase !== 'playing') {
              finishTurn()
              return
            }

            setTimeout(() => executeAction(index + 1), DELAY_BETWEEN)
          }, MOVE_DURATION + 20)
        } else if (action.type === 'pass') {
          // Ball visuell festhalten + Animation aufsparen
          const ballFrom = { ...currentState.ball.position }
          animator.holdBallAt(ballFrom)

          try { get().passBall(action.playerId, action.target, action.receiverId) } catch (e) { console.error('[AI] passBall crashed:', e) }

          // Tatsächliche Endposition des Balls (bei Fehlpass/Interception ≠ action.target)
          const actualBallPos = get().state?.ball.position ?? action.target
          deferredBallAnim = { from: ballFrom, to: { ...actualBallPos } }

          setTimeout(() => executeAction(index + 1), DELAY_BETWEEN)
        } else if (action.type === 'shoot') {
          // Ball visuell festhalten + Animation aufsparen
          const ballFrom = { ...currentState.ball.position }
          animator.holdBallAt(ballFrom)

          try { get().shootBall(action.playerId, action.target) } catch (e) { console.error('[AI] shootBall crashed:', e) }

          // Tatsächliche Endposition (bei Fehlschuss/Parade ≠ action.target)
          const actualBallPos = get().state?.ball.position ?? action.target
          deferredBallAnim = { from: ballFrom, to: { ...actualBallPos } }

          // Goal changes phase to kickoff — stop remaining moves
          const s = get().state
          if (s && s.phase !== 'playing') {
            finishTurn()
            return
          }

          setTimeout(() => executeAction(index + 1), DELAY_BETWEEN)
        } else {
          executeAction(index + 1)
        }
      } catch (err) {
        console.error('[AI] executeAction crashed at index', index, ':', err)
        finishTurn()
      }
    }

    // Start the chain
    executeAction(0)
  },

  showEvent: (message, durationMs = 2000, eventType?) => {
    const prev = get().eventTimeout
    if (prev) clearTimeout(prev)

    const OVERLAY_MAP: Record<string, { label: string; color: string }> = {
      shot_scored:      { label: 'TOR!',           color: '#4caf50' },
      shot_saved:       { label: 'GEHALTEN',       color: '#ffffff' },
      shot_missed:      { label: 'VORBEI',         color: '#ffffff' },
      penalty_scored:   { label: 'TOR!',           color: '#4caf50' },
      penalty_saved:    { label: 'GEHALTEN',       color: '#ffffff' },
      penalty_missed:   { label: 'VORBEI',         color: '#ffffff' },
      foul:             { label: 'FOUL',           color: '#ff9800' },
      yellow_card:      { label: 'GELBE KARTE',    color: '#ffeb3b' },
      red_card:         { label: 'ROTE KARTE',     color: '#f44336' },
      penalty:          { label: 'ELFMETER',       color: '#ff9800' },
      pass_intercepted: { label: 'FEHLPASS',       color: '#ffffff' },
      pass_lost:        { label: 'FEHLPASS',       color: '#ffffff' },
      corner:           { label: 'ECKE',           color: '#ffffff' },
      throw_in:         { label: 'EINWURF',        color: '#ffffff' },
      offside:          { label: 'ABSEITS',        color: '#ffffff' },
      tackle_won:       { label: 'BALLEROBERUNG',  color: '#ffffff' },
      tackle_lost:      { label: 'ABGEWEHRT',      color: '#ffffff' },
      rule_tackle:      { label: '1 TACKLING / ZUG', color: '#ff9800' },
      rule_pass:        { label: '1 PASS / ZUG',     color: '#ff9800' },
      rule_tacklelock:  { label: 'TACKLING-SPERRE',  color: '#ff9800' },
    }

    // eventType direkt übergeben (State ist ggf. noch nicht aktualisiert)
    let overlay = eventType ? OVERLAY_MAP[eventType] ?? null : null

    // Fallback: Half Time / Full Time
    if (!overlay) {
      if (message.includes('Half Time')) overlay = { label: 'HALBZEIT', color: '#ffffff' }
      else if (message.includes('Full Time')) overlay = { label: 'ABPFIFF', color: '#ffffff' }
    }

    const timeout = setTimeout(() => {
      set({ eventMessage: null, eventTimeout: null, overlayLabel: null, overlayColor: null })
    }, durationMs)

    set({
      eventMessage: message,
      eventTimeout: timeout,
      overlayLabel: overlay?.label ?? null,
      overlayColor: overlay?.color ?? null,
    })
  },

  clearEvent: () => {
    const prev = get().eventTimeout
    if (prev) clearTimeout(prev)
    set({ eventMessage: null, eventTimeout: null, overlayLabel: null, overlayColor: null })
  },

  setState: (state) => set({ state }),
  setLocalTeam: (team) => set({ localTeam: team }),
  setDuel: (isDuel) => set({ isDuel }),

  reset: () => set({
    state: null,
    penaltyState: null,
    drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
    eventMessage: null,
    overlayLabel: null,
    overlayColor: null,
  }),
}))