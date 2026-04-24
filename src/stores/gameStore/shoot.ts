import type { GameState, PenaltyState, TeamSide } from '../../engine/types'
import { applyShot, calculateShotAccuracy, resolvePenalty, aiChoosePenaltyDirection } from '../../engine/shooting'
import { handleGoalScored } from '../../engine/turn'
import { recordSaveEvent } from '../../engine/ai'
import { repositionForSetPiece } from '../../engine/ai/setPiece'
import { enforceCrossTeamSpacing, enforceOpponentMinDistFromBall } from '../../engine/ai/setPieceHelpers'
import { adjustConfidence } from '../../engine/confidence'
import { PITCH } from '../../engine/constants'
import { addTicker, updateTeamStats, directionFromX, addGoalLog, findCornerTaker } from './helpers'
import { completeShootoutKick } from './shootout'
import type { GameStore, StoreSet, StoreGet } from './types'
import { transitionToCorner } from './shared/corner'

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
        recordSaveEvent(keeper.team)
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
        let penScoredState: GameState = { ...newState, players: scoringPlayers, ball: { position: ballPos, ownerId: null }, phase: 'penalty' }
        if (shooter) penScoredState = addGoalLog(penScoredState, shooter, 'penalty')
        set({
          state: penScoredState,
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
        recordSaveEvent(keeper.team)
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
      const shooter = state.players.find(p => p.id === shooterId)
      const updatedPlayers = state.players.map(p =>
        p.id === shooterId ? { ...p, hasActed: true, gameStats: { ...p.gameStats, goalsScored: p.gameStats.goalsScored + 1 } } : p,
      )
      let baseState: GameState = { ...state, players: updatedPlayers }
      if (shooter) baseState = addGoalLog(baseState, shooter, 'open_play')
      newState = handleGoalScored(baseState, state.currentTurn)
      // handleGoalScored ruft setupKickoff auf und trägt lastEvent nicht
      // nach. Ohne diesen Zusatz "vergisst" der Store das Torschuss-Event,
      // und der Replay-Viewer zeigt kein TOR!-Overlay.
      newState = { ...newState, lastEvent: result.event }
    } else if (result.event.type === 'corner') {
      // #5 Geblockter Schuss → Ecke (vom Verteidiger abgefälscht ins Toraus)
      const shooter = state.players.find(p => p.id === shooterId)
      const preCornerPlayers = state.players.map(p =>
        p.id === shooterId ? { ...p, hasActed: true } : p,
      )
      let preCornerState: GameState = { ...state, players: preCornerPlayers, lastEvent: result.event }
      preCornerState = updateTeamStats(preCornerState, state.currentTurn, s => ({
        corners: s.corners + 1,
      }))
      newState = transitionToCorner(preCornerState, {
        attackingTeam: state.currentTurn,
        originX: shooter?.position.x ?? 50,
      })
      newState = { ...newState, lastEvent: result.event }
      get().showEvent(result.event.message, 2000, 'corner')
    } else if (result.event.type === 'shot_missed') {
      // Shot missed (went wide / over goal) → Abstoß für verteidigendes Team.
      // FIFA Law 16: Gegner müssen außerhalb des 16ers sein, bis der Ball
      // gespielt wird. Wir simulieren das als defensiven Freistoß:
      // phase='free_kick', mustPass=true, Keeper=Taker, beide Teams
      // repositioniert, Gegner 9.15 m vom Ball weg.
      const defendingTeam: TeamSide = state.currentTurn === 1 ? 2 : 1
      const keeper = state.players.find(p => p.team === defendingTeam && p.positionLabel === 'TW')
      const goalKickY = defendingTeam === 1 ? 95 : 5
      const goalKickPos = { x: 50, y: goalKickY }

      let players = state.players.map(p => {
        if (p.id === shooterId) return { ...p, hasActed: true }
        if (keeper && p.id === keeper.id) return { ...p, position: { ...goalKickPos }, origin: { ...goalKickPos } }
        return p
      })
      const goalKickBall = keeper
        ? { position: { ...goalKickPos }, ownerId: keeper.id }
        : { position: { ...goalKickPos }, ownerId: null }

      // Beide Teams für den Abstoß positionieren (als defensiver Freistoß)
      if (keeper) {
        for (const team of [1 as TeamSide, 2 as TeamSide]) {
          const spState = { ...state, players, ball: goalKickBall }
          const spActions = repositionForSetPiece(spState, team, 'free_kick')
          for (const action of spActions) {
            if (action.type === 'move') {
              players = players.map(p =>
                p.id === action.playerId
                  ? { ...p, position: { ...action.target }, origin: { ...action.target } }
                  : p,
              )
            }
          }
        }
        enforceCrossTeamSpacing(players, new Set([keeper.id]))
        enforceOpponentMinDistFromBall(players, goalKickPos, defendingTeam)
      }

      newState = {
        ...state,
        players,
        ball: goalKickBall,
        lastEvent: result.event,
        phase: 'free_kick',
        currentTurn: defendingTeam,
        mustPass: true,
        setPieceReady: true,
        lastSetPiece: 'free_kick',
      }
    } else {
      // Save — entweder Keeper hat den Ball, oder er hat ins Aus abgelenkt
      // und es gibt Eckball. Corner-Transition wird als eigenständiger Pfad
      // behandelt, damit die Phase sauber auf 'corner' schaltet.
      if (result.deflectedToCorner && result.savedBy) {
        const shooter = state.players.find(p => p.id === shooterId)
        const attackingTeam = state.currentTurn
        const goalY = attackingTeam === 1 ? 3 : 97
        // Eckfahnen-Seite aus Schussposition ableiten
        const cornerX = shooter && shooter.position.x < 50 ? 4 : 96
        const cornerPos = { x: cornerX, y: goalY }

        const taker = findCornerTaker(state.players, attackingTeam)
        let players = state.players.map(p => {
          if (p.id === shooterId) return { ...p, hasActed: true }
          if (result.savedBy && p.id === result.savedBy.id) {
            return { ...p, gameStats: { ...p.gameStats, saves: p.gameStats.saves + 1 } }
          }
          return p
        })
        if (taker) {
          players = players.map(p =>
            p.id === taker.id
              ? { ...p, position: { ...cornerPos }, origin: { ...cornerPos } }
              : p,
          )
        }
        const cornerBall = taker
          ? { position: { ...cornerPos }, ownerId: taker.id }
          : { position: { ...cornerPos }, ownerId: null }

        // Beide Teams für die Ecke aufstellen
        for (const team of [1 as TeamSide, 2 as TeamSide]) {
          const spState = { ...state, players, ball: cornerBall }
          const spActions = repositionForSetPiece(spState, team, 'corner')
          for (const action of spActions) {
            if (action.type === 'move') {
              players = players.map(p =>
                p.id === action.playerId
                  ? { ...p, position: { ...action.target }, origin: { ...action.target } }
                  : p,
              )
            }
          }
        }
        enforceCrossTeamSpacing(players, new Set(taker ? [taker.id] : []))
        // FIFA Law 17: Gegner mind. 9.15 m vom Ball beim Eckstoß
        enforceOpponentMinDistFromBall(players, cornerPos, attackingTeam)

        // Stats: Schuss zählt als aufs Tor + Ecke + xG, Confidence
        const shotAccuracy = shooter ? calculateShotAccuracy(shooter, shooter.position, attackingTeam) : 0
        let trackedState: GameState = { ...state, players, ball: cornerBall, lastEvent: result.event }
        trackedState = updateTeamStats(trackedState, attackingTeam, s => ({
          xG: s.xG + shotAccuracy * 0.5,  // echte Tor-Wahrscheinlichkeit, siehe Haupt-xG-Kommentar unten
          shotsOnTarget: s.shotsOnTarget + 1,
          corners: s.corners + 1,
        }))
        trackedState = {
          ...trackedState,
          players: trackedState.players.map(p =>
            p.id === shooterId ? adjustConfidence(p, 'shot_saved') : p,
          ),
        }
        trackedState = addTicker(trackedState, result.event.message, result.event.type, attackingTeam)

        recordSaveEvent(result.savedBy.team)
        get().showEvent(result.event.message, 3000, result.event.type)

        set({
          state: {
            ...trackedState,
            players: trackedState.players.map(p => ({
              ...p,
              hasActed: false,
              hasMoved: p.id === taker?.id,
              hasPassed: false,
              hasReceivedPass: false,
              origin: { ...p.position },
            })),
            phase: 'corner',
            currentTurn: attackingTeam,
            passesThisTurn: 0,
            ballOwnerChangedThisTurn: true,
            mustPass: false,
            setPieceReady: true,
            lastSetPiece: 'corner',
          },
          drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
          selectedPlayerId: null,
        })
        return
      }

      // Normale Parade — Keeper hat den Ball
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
      if (result.savedBy) recordSaveEvent(result.savedBy.team)
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
    // xG = erwartete Tor-Wahrscheinlichkeit, nicht on-target-Rate.
    // Akkurate Näherung: accuracy × (1 - avg saveChance). Mit
    // BASE_SAVE_CHANCE 0.35 und Modifikatoren im Mittel ~0.5.
    const shotXG = shotAccuracy * 0.5
    newState = updateTeamStats(newState, state.currentTurn, s => ({
      xG: s.xG + shotXG,
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
