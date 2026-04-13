/**
 * Corner kick positioning — offensive and defensive.
 */

import type { PlayerData, Position, PlayerAction, TeamSide } from '../types'
import {
  ownGoalY, attackGoalY,
  isDefender, isAttacker, isMidfielder,
  moveAction,
} from './setPieceHelpers'

// ── Offensive ───────────────────────────────────────────────────────

export function positionOffensiveCorner(
  players: PlayerData[],
  team: TeamSide,
  cornerPos: Position,
): PlayerAction[] {
  const actions: PlayerAction[] = []
  const goalY = attackGoalY(team)

  const attackers = players.filter(p => isAttacker(p.positionLabel))
  const midfielders = players.filter(p => isMidfielder(p.positionLabel))
  const defenders = players.filter(p => isDefender(p.positionLabel))
  const goalkeeper = players.find(p => p.positionLabel === 'TW')

  const boxTargets: Position[] = [
    { x: cornerPos.x < 50 ? 38 : 62, y: team === 1 ? goalY + 8 : goalY - 8 },
    { x: cornerPos.x < 50 ? 62 : 38, y: team === 1 ? goalY + 8 : goalY - 8 },
    { x: 50, y: team === 1 ? goalY + 11 : goalY - 11 },
    { x: cornerPos.x < 50 ? 45 : 55, y: team === 1 ? goalY + 6 : goalY - 6 },
    { x: 50, y: team === 1 ? goalY + 17 : goalY - 17 },
  ]

  const boxRunners = [...attackers, ...midfielders].slice(0, 5)
  for (let i = 0; i < boxRunners.length; i++) {
    actions.push(moveAction(boxRunners[i], boxTargets[i % boxTargets.length]))
  }

  const edgePlayer = midfielders.find(m => !boxRunners.includes(m))
  if (edgePlayer) {
    actions.push(moveAction(edgePlayer, {
      x: 50,
      y: team === 1 ? goalY + 22 : goalY - 22,
    }))
  }

  const ownGoal = ownGoalY(team)
  for (let i = 0; i < Math.min(2, defenders.length); i++) {
    actions.push(moveAction(defenders[i], {
      x: 35 + i * 30,
      y: team === 1 ? ownGoal - 35 : ownGoal + 35,
    }))
  }

  for (let i = 2; i < defenders.length; i++) {
    actions.push(moveAction(defenders[i], {
      x: 30 + i * 15,
      y: 50,
    }))
  }

  if (goalkeeper) {
    actions.push(moveAction(goalkeeper, { x: 50, y: team === 1 ? 93 : 7 }))
  }

  return actions
}

// ── Defensive ───────────────────────────────────────────────────────

export function positionDefensiveCorner(
  players: PlayerData[],
  _opponents: PlayerData[],
  team: TeamSide,
  cornerPos: Position,
): PlayerAction[] {
  const actions: PlayerAction[] = []
  const ownGoal = ownGoalY(team)

  const defenders = players.filter(p => isDefender(p.positionLabel))
  const midfielders = players.filter(p => isMidfielder(p.positionLabel))
  const attackers = players.filter(p => isAttacker(p.positionLabel))
  const goalkeeper = players.find(p => p.positionLabel === 'TW')

  if (goalkeeper) {
    actions.push(moveAction(goalkeeper, {
      x: 50,
      y: ownGoal === 100 ? 97 : 3,
    }))
  }

  const defTargets: Position[] = [
    { x: cornerPos.x < 50 ? 38 : 62, y: team === 1 ? ownGoal - 6 : ownGoal + 6 },
    { x: cornerPos.x < 50 ? 62 : 38, y: team === 1 ? ownGoal - 6 : ownGoal + 6 },
    { x: 50, y: team === 1 ? ownGoal - 11 : ownGoal + 11 },
    { x: 42, y: team === 1 ? ownGoal - 8 : ownGoal + 8 },
    { x: 58, y: team === 1 ? ownGoal - 8 : ownGoal + 8 },
  ]

  const boxDefenders = [...defenders, ...midfielders].slice(0, 5)
  for (let i = 0; i < boxDefenders.length; i++) {
    actions.push(moveAction(boxDefenders[i], defTargets[i % defTargets.length]))
  }

  const edgePlayer = midfielders.find(m => !boxDefenders.includes(m))
  if (edgePlayer) {
    actions.push(moveAction(edgePlayer, {
      x: 50,
      y: team === 1 ? ownGoal - 18 : ownGoal + 18,
    }))
  }

  for (let i = 0; i < Math.min(2, attackers.length); i++) {
    actions.push(moveAction(attackers[i], {
      x: 35 + i * 30,
      y: 50,
    }))
  }

  return actions
}
