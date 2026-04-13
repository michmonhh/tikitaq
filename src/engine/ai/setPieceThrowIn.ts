/**
 * Throw-in positioning — offensive and defensive.
 */

import type { PlayerData, Position, PlayerAction, TeamSide } from '../types'
import { distance } from '../geometry'
import {
  ownGoalY, ownGoalCenter,
  distToAttackGoal, shiftToward,
  isDefender, isAttacker, isMidfielder,
  moveAction,
} from './setPieceHelpers'

// ── Offensive ───────────────────────────────────────────────────────

export function positionOffensiveThrowIn(
  players: PlayerData[],
  team: TeamSide,
  throwPos: Position,
): PlayerAction[] {
  const actions: PlayerAction[] = []
  const goalDist = distToAttackGoal(throwPos.y, team)

  const attackers = players.filter(p => isAttacker(p.positionLabel))
  const midfielders = players.filter(p => isMidfielder(p.positionLabel))
  const defenders = players.filter(p => isDefender(p.positionLabel))
  const goalkeeper = players.find(p => p.positionLabel === 'TW')

  // 2-3 short passing options within 10-15 units of thrower
  const shortOptionPlayers = midfielders.slice(0, 3)
  const shortOffsets = [
    { dx: 0, dy: -10 },
    { dx: throwPos.x < 50 ? 12 : -12, dy: 0 },
    { dx: 0, dy: 10 },
  ]
  for (let i = 0; i < shortOptionPlayers.length; i++) {
    const offset = shortOffsets[i % shortOffsets.length]
    actions.push(moveAction(shortOptionPlayers[i], {
      x: throwPos.x + offset.dx,
      y: throwPos.y + offset.dy,
    }))
  }

  if (goalDist <= 35) {
    for (let i = 0; i < attackers.length; i++) {
      actions.push(moveAction(attackers[i], {
        x: 35 + i * 20,
        y: shiftToward(throwPos.y, 15, team),
      }))
    }

    const remainingMids = midfielders.filter(m => !shortOptionPlayers.includes(m))
    for (const mid of remainingMids) {
      actions.push(moveAction(mid, {
        x: mid.positionLabel === 'LM' ? 25 : mid.positionLabel === 'RM' ? 75 : 50,
        y: shiftToward(throwPos.y, 10, team),
      }))
    }
  } else {
    for (let i = 0; i < attackers.length; i++) {
      actions.push(moveAction(attackers[i], {
        x: 40 + i * 20,
        y: shiftToward(throwPos.y, 12, team),
      }))
    }

    const remainingMids = midfielders.filter(m => !shortOptionPlayers.includes(m))
    for (const mid of remainingMids) {
      actions.push(moveAction(mid, { x: 50, y: throwPos.y }))
    }
  }

  const ownGoal = ownGoalY(team)
  for (let i = 0; i < Math.min(2, defenders.length); i++) {
    actions.push(moveAction(defenders[i], {
      x: 35 + i * 30,
      y: team === 1 ? ownGoal - 20 : ownGoal + 20,
    }))
  }
  for (let i = 2; i < defenders.length; i++) {
    actions.push(moveAction(defenders[i], {
      x: 30 + i * 15,
      y: (throwPos.y + ownGoal) / 2,
    }))
  }

  if (goalkeeper) {
    actions.push(moveAction(goalkeeper, { x: 50, y: team === 1 ? 93 : 7 }))
  }

  return actions
}

// ── Defensive ───────────────────────────────────────────────────────

export function positionDefensiveThrowIn(
  players: PlayerData[],
  opponents: PlayerData[],
  team: TeamSide,
  throwPos: Position,
): PlayerAction[] {
  const actions: PlayerAction[] = []
  const ownGoal = ownGoalY(team)

  const defenders = players.filter(p => isDefender(p.positionLabel))
  const midfielders = players.filter(p => isMidfielder(p.positionLabel))
  const attackers = players.filter(p => isAttacker(p.positionLabel))
  const goalkeeper = players.find(p => p.positionLabel === 'TW')

  const nearOpponents = opponents.filter(
    opp => distance(opp.position, throwPos) < 15,
  )

  for (let i = 0; i < midfielders.length; i++) {
    if (i < nearOpponents.length) {
      const opp = nearOpponents[i]
      actions.push(moveAction(midfielders[i], {
        x: opp.position.x * 0.7 + ownGoalCenter(team).x * 0.3,
        y: opp.position.y * 0.6 + ownGoal * 0.4,
      }))
    } else {
      const baseX = Math.max(25, Math.min(75, throwPos.x))
      actions.push(moveAction(midfielders[i], {
        x: baseX + (i % 2 === 0 ? -10 : 10),
        y: (throwPos.y + ownGoal) / 2,
      }))
    }
  }

  const defLineY = team === 1
    ? Math.max(throwPos.y + 10, ownGoal - 25)
    : Math.min(throwPos.y - 10, ownGoal + 25)

  for (let i = 0; i < defenders.length; i++) {
    actions.push(moveAction(defenders[i], {
      x: 25 + i * 20,
      y: defLineY,
    }))
  }

  for (let i = 0; i < Math.min(2, attackers.length); i++) {
    actions.push(moveAction(attackers[i], {
      x: 40 + i * 20,
      y: shiftToward(50, 5, team),
    }))
  }

  if (goalkeeper) {
    actions.push(moveAction(goalkeeper, { x: 50, y: team === 1 ? 95 : 5 }))
  }

  return actions
}
