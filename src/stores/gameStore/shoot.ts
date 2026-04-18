import type { GameState, PenaltyState, TeamSide } from '../../engine/types'
import { applyShot, calculateShotAccuracy, resolvePenalty, aiChoosePenaltyDirection } from '../../engine/shooting'
import { handleGoalScored } from '../../engine/turn'
import { adjustConfidence } from '../../engine/confidence'
import { PITCH } from '../../engine/constants'
import { addTicker, updateTeamStats, directionFromX } from './helpers'
import { completeShootoutKick } from './shootout'
import type { GameStore, StoreSet, StoreGet } from './types'

export function makeShootBall(set: StoreSet, get: StoreGet): GameStore['shootBall'] {
  return (shooterId, target) => {
    const { state, penaltyState } = get()
    if (!state) return

    // ── Shootout kick: user as shooter drags ball to pick direction ──
    if (state.phase === 'shootout_kick' && penaltyState) {
      const shooterChoice = directionFromX(target.x)
      const keeperChoice = penaltyState.keeperChoice ?? aiChoosePenaltyDirection()
      const ps: PenaltyState = { ...penaltyState, shooterChoice, keeperChoice }
      const shooter = state.players.find(p => p.id === ps.shooterId)!
      const keeper = state.players.find(p => p.id === ps.keeperId)!
      const result = resolvePenalty(ps, shooter, keeper)

      const tickerState = addTicker(state, result.event.message, result.event.type, ps.shooterTeam)
      get().showEvent(result.event.message, 2500, result.event.type)

      const goalY = ps.shooterTeam === 1 ? PITCH.GOAL_TOP_Y : PITCH.GOAL_BOTTOM_Y
      const keeperRevealX = keeperChoice === 'left' ? 40 : keeperChoice === 'right' ? 60 : 50
      const keeperRevealY = keeper.team === 1 ? 97 : 3
      const shotX = shooterChoice === 'left' ? 42 : shooterChoice === 'right' ? 58 : 50

      let resultPlayers = tickerState.players.map(p =>
        p.id === ps.keeperId
          ? { ...p, position: { x: keeperRevealX, y: keeperRevealY }, origin: { x: keeperRevealX, y: keeperRevealY } }
          : p,
      )

      const scored = result.outcome === 'scored'
      let ballPos = state.ball.position
      if (scored) {
        ballPos = { x: shotX, y: goalY + (ps.shooterTeam === 1 ? 1 : -1) }
        resultPlayers = resultPlayers.map(p =>
          p.id === ps.shooterId
            ? { ...p, gameStats: { ...p.gameStats, goalsScored: p.gameStats.goalsScored + 1 } }
            : p,
        )
      } else if (result.outcome === 'saved') {
        ballPos = result.reboundPos!
        resultPlayers = resultPlayers.map(p =>
          p.id === ps.keeperId ? { ...p, gameStats: { ...p.gameStats, saves: p.gameStats.saves + 1 } } : p,
        )
      } else {
        const missX = shotX + (shotX < 50 ? -8 : 8)
        const missY = goalY + (ps.shooterTeam === 1 ? -3 : 3)
        ballPos = { x: missX, y: missY }
      }

      set({
        state: { ...tickerState, players: resultPlayers, ball: { position: ballPos, ownerId: null } },
        penaltyState: null,
        drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
      })

      setTimeout(() => {
        completeShootoutKick(set, get, scored)
      }, 2500)
      return
    }

    // ── Penalty: resolve via drag direction ──
    if (state.phase === 'penalty' && penaltyState) {
      const shooterChoice = directionFromX(target.x)
      // Use pre-committed keeper direction (AI decided at setup)
      const keeperChoice = penaltyState.keeperChoice ?? aiChoosePenaltyDirection()

      const ps: PenaltyState = { ...penaltyState, shooterChoice, keeperChoice }
      const shooter = state.players.find(p => p.id === ps.shooterId)!
      const keeper = state.players.find(p => p.id === ps.keeperId)!
      const result = resolvePenalty(ps, shooter, keeper)

      const newState = addTicker(state, result.event.message, result.event.type, ps.shooterTeam)
      get().showEvent(result.event.message, 4000, result.event.type)

      // Show keeper in revealed position + ball at result position
      const goalY = ps.shooterTeam === 1 ? PITCH.GOAL_TOP_Y : PITCH.GOAL_BOTTOM_Y
      const keeperRevealX = keeperChoice === 'left' ? 40 : keeperChoice === 'right' ? 60 : 50
      const keeperRevealY = keeper.team === 1 ? 97 : 3
      const shotX = shooterChoice === 'left' ? 42 : shooterChoice === 'right' ? 58 : 50

      const resultPlayers = newState.players.map(p => {
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
            : p,
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
          p.id === ps.keeperId ? { ...p, gameStats: { ...p.gameStats, saves: p.gameStats.saves + 1 } } : p,
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
            p.id === ps.keeperId ? { ...p, position: { x: 50, y: goalKickY }, origin: { x: 50, y: goalKickY } } : p,
          )
          set({
            state: {
              ...s, players: goalKickPlayers,
              ball: { position: { x: 50, y: goalKickY }, ownerId: ps.keeperId },
              phase: 'free_kick', currentTurn: defTeam, mustPass: true, setPieceReady: true, lastSetPiece: null,
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
        p.id === shooterId ? { ...p, hasActed: true, gameStats: { ...p.gameStats, goalsScored: p.gameStats.goalsScored + 1 } } : p,
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

      const updatedPlayers = state.players.map(p => {
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
        p.id === shooterId ? adjustConfidence(p, confEvent) : p,
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
  }
}
