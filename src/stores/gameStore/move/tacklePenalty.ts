import type { GameState, PenaltyState, TeamSide } from '../../../engine/types'
import { repositionForPenalty } from '../../../engine/ai/setPiece'
import { enforceCrossTeamSpacing } from '../../../engine/ai/setPieceHelpers'
import { aiChoosePenaltyDirection } from '../../../engine/shooting'
import { PITCH } from '../../../engine/constants'

export interface FoulPenaltyResult {
  newState: GameState
  newPenaltyState: PenaltyState | null
}

/**
 * Transition the game to a penalty after a tackle foul inside the penalty area.
 * If no shooter or keeper can be identified → falls back to a free kick
 * for the fouled team (penaltyState returned as null).
 */
export function handleFoulPenalty(
  tackleState: GameState,
  tacklerTeam: TeamSide,
  localTeam: 1 | 2 | null,
): FoulPenaltyResult {
  const fouledTeam: TeamSide = tacklerTeam === 1 ? 2 : 1
  const penaltySpotY = fouledTeam === 1 ? PITCH.PENALTY_SPOT_TOP_Y : PITCH.PENALTY_SPOT_BOTTOM_Y

  // Finde den ST des fouled teams (Schütze) und den TW des fouling teams (Keeper)
  const shooter = tackleState.players.find(p => p.team === fouledTeam && p.positionLabel === 'ST')
  const keeper = tackleState.players.find(p => p.team === tacklerTeam && p.positionLabel === 'TW')
  if (!shooter || !keeper) {
    // Fallback: kein ST/TW gefunden → normaler Freistoß für gefoultes Team
    return {
      newState: {
        ...tackleState,
        phase: 'free_kick',
        currentTurn: fouledTeam,
        mustPass: true,
        setPieceReady: false,
        lastSetPiece: 'free_kick',
        passesThisTurn: 0,
        ballOwnerChangedThisTurn: false,
      },
      newPenaltyState: null,
    }
  }

  // Ball auf den Elfmeterpunkt, ST bekommt den Ball
  const penaltyBall = { ...tackleState.ball, position: { x: PITCH.CENTER_X, y: penaltySpotY }, ownerId: shooter.id }

  // ST auf den Elfmeterpunkt positionieren; TW auf die Torlinie
  let penaltyPlayers = tackleState.players.map(p => {
    if (p.id === shooter.id) {
      return { ...p, position: { x: PITCH.CENTER_X, y: penaltySpotY }, origin: { x: PITCH.CENTER_X, y: penaltySpotY } }
    }
    if (p.id === keeper.id) {
      const goalY = tacklerTeam === 1 ? 100 : 0
      return { ...p, position: { x: PITCH.CENTER_X, y: goalY + (tacklerTeam === 1 ? -2 : 2) }, origin: { x: PITCH.CENTER_X, y: goalY + (tacklerTeam === 1 ? -2 : 2) } }
    }
    return p
  })

  // AI pre-commits keeper direction when defending team is AI-controlled
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

  return {
    newState: { ...tackleState, players: penaltyPlayers, ball: penaltyBall, phase: 'penalty' },
    newPenaltyState: {
      shooterTeam: fouledTeam,
      shooterId: shooter.id,
      keeperId: keeper.id,
      shooterChoice: null,
      keeperChoice: keeperDir,
    },
  }
}
