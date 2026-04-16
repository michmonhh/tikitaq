import type { GameState, TeamSide } from '../../../engine/types'
import type { TackleResult } from '../../../engine/tackle'
import { repositionForSetPiece } from '../../../engine/ai/setPiece'
import { enforceCrossTeamSpacing } from '../../../engine/ai/setPieceHelpers'

/**
 * Transition the game to a free kick after a tackle foul outside the penalty area.
 * - Fouled team gets the ball
 * - FK-Taker = teammate (non-TW) whose origin is closest to the foul position
 * - Both teams repositioned via repositionForSetPiece('free_kick')
 */
export function handleFoulFreeKick(
  tackleState: GameState,
  tackleResult: TackleResult,
  tacklerTeam: TeamSide,
): GameState {
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

  return {
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
  }
}
