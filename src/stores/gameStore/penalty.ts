import type { GameState, PenaltyState, TeamSide } from '../../engine/types'
import { resolvePenalty, aiChoosePenaltyDirection } from '../../engine/shooting'
import { handleGoalScored } from '../../engine/turn'
import { repositionForPenalty } from '../../engine/ai/setPiece'
import { enforceCrossTeamSpacing } from '../../engine/ai/setPieceHelpers'
import { PITCH } from '../../engine/constants'
import { addTicker, directionFromX, addGoalLog } from './helpers'
import { completeShootoutKick } from './shootout'
import type { GameStore, StoreSet, StoreGet } from './types'

export function makeConfirmPenaltyDefense(set: StoreSet, get: StoreGet): GameStore['confirmPenaltyDefense'] {
  return () => {
    const { state, penaltyState } = get()
    if (!state || !penaltyState) return

    // Shootout-Variante: kein AI-Reposition, direkt auflösen und nächsten Kick einleiten
    if (state.phase === 'shootout_kick') {
      resolveShootoutKick(set, get)
      return
    }

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
            : p,
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

      const newState = addTicker(currentState, result.event.message, result.event.type, ps.shooterTeam)
      get().showEvent(result.event.message, 4000, result.event.type)

      const goalY = ps.shooterTeam === 1 ? PITCH.GOAL_TOP_Y : PITCH.GOAL_BOTTOM_Y
      const shotX = shooterChoice === 'left' ? 42 : shooterChoice === 'right' ? 58 : 50
      const keeperRevealX = keeperChoice === 'left' ? 40 : keeperChoice === 'right' ? 60 : 50
      const keeperRevealY = keeper.team === 1 ? 97 : 3

      // Reveal keeper's committed position
      let resultPlayers = newState.players.map(p =>
        p.id === ps.keeperId
          ? { ...p, position: { x: keeperRevealX, y: keeperRevealY }, origin: { x: keeperRevealX, y: keeperRevealY } }
          : p,
      )

      if (result.outcome === 'scored') {
        const ballPos = { x: shotX, y: goalY + (ps.shooterTeam === 1 ? 1 : -1) }
        resultPlayers = resultPlayers.map(p =>
          p.id === ps.shooterId
            ? { ...p, gameStats: { ...p.gameStats, goalsScored: p.gameStats.goalsScored + 1 } }
            : p,
        )
        let penScoredState: GameState = { ...newState, players: resultPlayers, ball: { position: ballPos, ownerId: null }, phase: 'penalty' }
        penScoredState = addGoalLog(penScoredState, shooter, 'penalty')
        set({ state: penScoredState })
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
          p.id === ps.keeperId ? { ...p, gameStats: { ...p.gameStats, saves: p.gameStats.saves + 1 } } : p,
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
    }, 1500) // 1.5s delay: player sees AI repositioning before shot
  }
}

/**
 * Führt einen Elfmeterschießen-Schuss aus (Nutzer als Keeper klickt "Bereit",
 * oder KI als Keeper — in dem Fall ist keeperChoice bereits vorgepickt).
 * Der Schütze wird hier zufällig per aiChoosePenaltyDirection gewählt —
 * konsistent mit dem In-Game-Elfmeter, der ebenfalls die Schuss-Richtung
 * des Schützen nicht vom Nutzer auswählen lässt, wenn über "Bereit" gestartet wird.
 */
function resolveShootoutKick(set: StoreSet, get: StoreGet): void {
  const { state, penaltyState } = get()
  if (!state || !penaltyState) return

  const keeper = state.players.find(p => p.id === penaltyState.keeperId)
  const shooter = state.players.find(p => p.id === penaltyState.shooterId)
  if (!keeper || !shooter) return

  // Keeper-Richtung: aus vorgepickter KI-Wahl ODER aus gezogener Position ableiten
  const keeperChoice = penaltyState.keeperChoice ?? directionFromX(keeper.position.x)
  const shooterChoice = aiChoosePenaltyDirection()

  const ps: PenaltyState = { ...penaltyState, shooterChoice, keeperChoice }
  const result = resolvePenalty(ps, shooter, keeper)

  const team1Label = ps.shooterTeam === 1 ? 'Team 1' : 'Team 2'
  const tickerMsg = `${team1Label}: ${result.event.message}`
  const tickerState = addTicker(state, tickerMsg, result.event.type, ps.shooterTeam)
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
  if (scored) {
    const ballPos = { x: shotX, y: goalY + (ps.shooterTeam === 1 ? 1 : -1) }
    resultPlayers = resultPlayers.map(p =>
      p.id === ps.shooterId
        ? { ...p, gameStats: { ...p.gameStats, goalsScored: p.gameStats.goalsScored + 1 } }
        : p,
    )
    set({
      state: { ...tickerState, players: resultPlayers, ball: { position: ballPos, ownerId: null } },
      penaltyState: null,
      drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
    })
  } else if (result.outcome === 'saved') {
    const reboundPos = result.reboundPos!
    resultPlayers = resultPlayers.map(p =>
      p.id === ps.keeperId ? { ...p, gameStats: { ...p.gameStats, saves: p.gameStats.saves + 1 } } : p,
    )
    set({
      state: { ...tickerState, players: resultPlayers, ball: { position: reboundPos, ownerId: null } },
      penaltyState: null,
      drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
    })
  } else {
    const missX = shotX + (shotX < 50 ? -8 : 8)
    const missY = goalY + (ps.shooterTeam === 1 ? -3 : 3)
    set({
      state: { ...tickerState, players: resultPlayers, ball: { position: { x: missX, y: missY }, ownerId: null } },
      penaltyState: null,
      drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
    })
  }

  // Nach Visualisierung: Entscheidung / nächster Kick
  setTimeout(() => {
    completeShootoutKick(set, get, scored)
  }, 2500)
}
