/**
 * Set-piece positioning — dispatcher and re-exports.
 *
 * Individual set-piece types are in their own files:
 *   setPiecePenalty.ts, setPieceFreeKick.ts, setPieceCorner.ts, setPieceThrowIn.ts
 */

import type { GameState, TeamSide, PlayerAction } from '../types'
import { ownGoalY, clamp, enforceSpacing } from './setPieceHelpers'
import { positionOffensiveFreekick, positionDefensiveFreekick } from './setPieceFreeKick'
import { positionOffensiveCorner, positionDefensiveCorner } from './setPieceCorner'
import { positionOffensiveThrowIn, positionDefensiveThrowIn } from './setPieceThrowIn'

// Re-export penalty for external callers
export { repositionForPenalty } from './setPiecePenalty'

/**
 * Reposition all players of `team` for a set piece (except the ball carrier).
 *
 * Returns `PlayerAction[]` with `type: 'move'` for every repositioned player.
 */
export function repositionForSetPiece(
  state: GameState,
  team: TeamSide,
  phase: 'free_kick' | 'corner' | 'throw_in',
): PlayerAction[] {
  const ballOwnerId = state.ball.ownerId
  const ballPos = state.ball.position

  // Determine if this team is taking the set piece (offensive) or not (defensive)
  const isOffensive = ballOwnerId != null &&
    state.players.find(p => p.id === ballOwnerId)?.team === team

  // All players of this team, excluding the ball carrier
  const teamPlayers = state.players.filter(
    p => p.team === team && p.id !== ballOwnerId,
  )
  const opponents = state.players.filter(p => p.team !== team)

  let actions: PlayerAction[]

  switch (phase) {
    case 'free_kick':
      actions = isOffensive
        ? positionOffensiveFreekick(teamPlayers, opponents, team, ballPos)
        : positionDefensiveFreekick(teamPlayers, opponents, team, ballPos)
      break

    case 'corner':
      actions = isOffensive
        ? positionOffensiveCorner(teamPlayers, team, ballPos)
        : positionDefensiveCorner(teamPlayers, opponents, team, ballPos)
      break

    case 'throw_in':
      actions = isOffensive
        ? positionOffensiveThrowIn(teamPlayers, team, ballPos)
        : positionDefensiveThrowIn(teamPlayers, opponents, team, ballPos)
      break
  }

  // Enforce goalkeeper constraint: never more than 25 units from own goal line
  const ownGoalLine = ownGoalY(team)
  for (const action of actions) {
    if (action.type !== 'move') continue
    const player = state.players.find(p => p.id === action.playerId)
    if (player?.positionLabel !== 'TW') continue

    const distFromGoal = Math.abs(action.target.y - ownGoalLine)
    if (distFromGoal > 25) {
      action.target = {
        x: action.target.x,
        y: team === 1 ? ownGoalLine - 25 : ownGoalLine + 25,
      }
    }
    action.target = clamp(action.target)
  }

  // Enforce minimum spacing — include all players NOT being repositioned as fixed
  const movedIds = new Set(actions.map(a => a.playerId))
  const fixedPositions = state.players
    .filter(p => !movedIds.has(p.id))
    .map(p => p.position)
  enforceSpacing(actions, fixedPositions)

  return actions
}
