import type { GameState, TeamSide, PlayerAction } from '../types'
import { getMovementRadius, distance, clampToRadius, clampToPitch } from '../geometry'
import { evaluatePositionalTarget, calculateHeatmapTarget, applyRepulsion } from './positioning'
import { evaluateBestPass, evaluateShotOpportunity, shouldChallengeBall } from './decisions'
import { getTeamPlayers, getBallCarrier } from '../formation'
import { PITCH } from '../constants'

/**
 * Execute a full AI turn. Returns the sequence of actions the AI takes.
 * The AI processes all its players: moves them, decides on passes, and shoots.
 */
export function executeAITurn(state: GameState): PlayerAction[] {
  const aiTeam: TeamSide = state.currentTurn
  const aiPlayers = getTeamPlayers(state.players, aiTeam)
  const actions: PlayerAction[] = []

  // Find the ball carrier
  const carrier = getBallCarrier(state.players, state.ball.ownerId)
  const aiHasBall = carrier?.team === aiTeam

  // Step 1: If AI has ball, decide on pass or shot first
  if (aiHasBall && carrier) {
    const shotOpp = evaluateShotOpportunity(carrier, state)

    if (shotOpp.canShoot && shotOpp.score > 50) {
      // Shoot!
      const goalY = aiTeam === 1 ? 0 : 100
      actions.push({
        type: 'shoot',
        playerId: carrier.id,
        target: { x: PITCH.CENTER_X + (Math.random() - 0.5) * 10, y: goalY },
      })
    } else {
      // Try to pass
      const passCandidates = evaluateBestPass(carrier, state)
      if (passCandidates.length > 0 && passCandidates[0].score > 10) {
        actions.push({
          type: 'pass',
          playerId: carrier.id,
          target: passCandidates[0].receiver.position,
          receiverId: passCandidates[0].receiver.id,
        })
      }
    }
  }

  // Step 2: Move all AI players (that haven't acted)
  const actedPlayerIds = new Set(actions.map(a => a.playerId))

  for (const player of aiPlayers) {
    if (actedPlayerIds.has(player.id)) continue
    if (player.positionLabel === 'TW' && aiHasBall) continue // Keeper stays if AI has ball

    const movementRadius = getMovementRadius(player)

    let target: { x: number; y: number }

    if (shouldChallengeBall(player, state) && !aiHasBall) {
      // Move towards ball to challenge
      target = clampToRadius(state.ball.position, player.origin, movementRadius)
    } else {
      // Move to ideal position via heatmap
      const idealTarget = evaluatePositionalTarget(player, state)
      const heatmapTarget = calculateHeatmapTarget(player, idealTarget, state)
      const teammates = aiPlayers.filter(p => p.id !== player.id)
      const repulsedTarget = applyRepulsion(heatmapTarget, player, teammates)
      target = clampToRadius(repulsedTarget, player.origin, movementRadius)
    }

    target = clampToPitch(target)

    // Only move if there's meaningful distance
    const moveDist = distance(player.position, target)
    if (moveDist > 1) {
      actions.push({
        type: 'move',
        playerId: player.id,
        target,
      })
    }
  }

  return actions
}
