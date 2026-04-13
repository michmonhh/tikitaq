/**
 * Free kick positioning — offensive and defensive.
 */

import type { PlayerData, Position, PlayerAction, TeamSide } from '../types'
import { distance } from '../geometry'
import {
  ownGoalY, attackGoalY, ownGoalCenter,
  distToAttackGoal, shiftToward, clamp,
  isDefender, isAttacker, isMidfielder,
  moveAction,
} from './setPieceHelpers'

// ── Wall formation ──────────────────────────────────────────────────

/**
 * Compute positions for a defensive wall.
 *
 * The wall sits 9.15 units from the ball along the direct line toward the
 * goal center.  Players are spread perpendicular to that line, 2 units
 * apart, and centred on the shooting angle.
 */
function formWall(
  ballPos: Position,
  goalCenter: Position,
  numPlayers: number,
): Position[] {
  const dx = goalCenter.x - ballPos.x
  const dy = goalCenter.y - ballPos.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return []

  const ux = dx / len
  const uy = dy / len

  const wallCenterX = ballPos.x + ux * 9.15
  const wallCenterY = ballPos.y + uy * 9.15

  const px = -uy
  const py = ux

  const positions: Position[] = []
  const spacing = 5
  const offset = ((numPlayers - 1) * spacing) / 2

  for (let i = 0; i < numPlayers; i++) {
    const shift = i * spacing - offset
    positions.push(
      clamp({
        x: wallCenterX + px * shift,
        y: wallCenterY + py * shift,
      }),
    )
  }
  return positions
}

// ── Offensive ───────────────────────────────────────────────────────

export function positionOffensiveFreekick(
  players: PlayerData[],
  opponents: PlayerData[],
  team: TeamSide,
  ballPos: Position,
): PlayerAction[] {
  const actions: PlayerAction[] = []
  const goalDist = distToAttackGoal(ballPos.y, team)
  const goalY = attackGoalY(team)

  const attackers = players.filter(p => isAttacker(p.positionLabel))
  const midfielders = players.filter(p => isMidfielder(p.positionLabel))
  const defenders = players.filter(p => isDefender(p.positionLabel))
  const goalkeeper = players.find(p => p.positionLabel === 'TW')

  if (goalDist <= 35) {
    // Attacking third: load the box
    const boxTargets: Position[] = [
      { x: 35, y: team === 1 ? goalY + 14 : goalY - 14 },
      { x: 65, y: team === 1 ? goalY + 14 : goalY - 14 },
      { x: 50, y: team === 1 ? goalY + 18 : goalY - 18 },
      { x: 42, y: team === 1 ? goalY + 22 : goalY - 22 },
    ]

    const boxRunners = [...attackers, ...midfielders].slice(0, 4)
    for (let i = 0; i < boxRunners.length; i++) {
      actions.push(moveAction(boxRunners[i], boxTargets[i % boxTargets.length]))
    }

    const remainingMids = midfielders.filter(m => !boxRunners.includes(m))
    for (const mid of remainingMids) {
      actions.push(moveAction(mid, {
        x: ballPos.x + (mid.positionLabel === 'LM' ? -8 : 8),
        y: ballPos.y,
      }))
    }

    const ownGoal = ownGoalY(team)
    for (let i = 0; i < defenders.length; i++) {
      const stayBackY = team === 1 ? ownGoal - 30 : ownGoal + 30
      const xSpread = 25 + i * 20
      actions.push(moveAction(defenders[i], { x: xSpread, y: stayBackY }))
    }

    if (goalkeeper) {
      actions.push(moveAction(goalkeeper, { x: 50, y: team === 1 ? 93 : 7 }))
    }
  } else if (goalDist <= 65) {
    // Midfield: balanced positioning
    const shortOptions = midfielders.slice(0, 2)
    for (let i = 0; i < shortOptions.length; i++) {
      const xOff = i === 0 ? -10 : 10
      actions.push(moveAction(shortOptions[i], {
        x: ballPos.x + xOff,
        y: shiftToward(ballPos.y, 5, team),
      }))
    }

    for (let i = 0; i < attackers.length; i++) {
      actions.push(moveAction(attackers[i], {
        x: 40 + i * 20,
        y: shiftToward(ballPos.y, 20, team),
      }))
    }

    const remainingMids = midfielders.filter(m => !shortOptions.includes(m))
    for (const mid of remainingMids) {
      const xTarget = mid.positionLabel === 'LM' ? 20 : mid.positionLabel === 'RM' ? 80 : 50
      actions.push(moveAction(mid, {
        x: xTarget,
        y: shiftToward(ballPos.y, 10, team),
      }))
    }

    const halfwayY = (ballPos.y + ownGoalY(team)) / 2
    for (let i = 0; i < defenders.length; i++) {
      const xSpread = 30 + i * 18
      actions.push(moveAction(defenders[i], { x: xSpread, y: halfwayY }))
    }

    if (goalkeeper) {
      actions.push(moveAction(goalkeeper, { x: 50, y: team === 1 ? 93 : 7 }))
    }
  } else {
    // Own half: compact and safe
    for (let i = 0; i < midfielders.length; i++) {
      const xOff = (i % 2 === 0 ? -12 : 12)
      actions.push(moveAction(midfielders[i], {
        x: ballPos.x + xOff,
        y: shiftToward(ballPos.y, 8 + i * 4, team),
      }))
    }

    for (let i = 0; i < attackers.length; i++) {
      actions.push(moveAction(attackers[i], { x: 40 + i * 20, y: 50 }))
    }

    const ownGoal = ownGoalY(team)
    for (let i = 0; i < defenders.length; i++) {
      actions.push(moveAction(defenders[i], {
        x: 30 + i * 18,
        y: team === 1 ? ownGoal - 20 : ownGoal + 20,
      }))
    }

    if (goalkeeper) {
      actions.push(moveAction(goalkeeper, { x: 50, y: team === 1 ? 95 : 5 }))
    }
  }

  return actions
}

// ── Defensive ───────────────────────────────────────────────────────

export function positionDefensiveFreekick(
  players: PlayerData[],
  opponents: PlayerData[],
  team: TeamSide,
  ballPos: Position,
): PlayerAction[] {
  const actions: PlayerAction[] = []
  const ownGoal = ownGoalCenter(team)
  const distFromOwnGoal = Math.abs(ballPos.y - ownGoalY(team))

  const defenders = players.filter(p => isDefender(p.positionLabel))
  const midfielders = players.filter(p => isMidfielder(p.positionLabel))
  const attackers = players.filter(p => isAttacker(p.positionLabel))
  const goalkeeper = players.find(p => p.positionLabel === 'TW')

  if (distFromOwnGoal <= 30) {
    // Dangerous free kick near own goal: form a wall
    const wallCount = Math.min(4, defenders.length + midfielders.length)
    const wallPositions = formWall(ballPos, ownGoal, wallCount)

    const wallCandidates = [...defenders, ...midfielders]
    const wallPlayers: PlayerData[] = []
    for (let i = 0; i < wallCount && i < wallCandidates.length; i++) {
      wallPlayers.push(wallCandidates[i])
      actions.push(moveAction(wallCandidates[i], wallPositions[i]))
    }

    if (goalkeeper) {
      const gkX = Math.max(38, Math.min(62, ballPos.x))
      actions.push(moveAction(goalkeeper, { x: gkX, y: ownGoalY(team) === 100 ? 97 : 3 }))
    }

    const remainingDef = [...defenders, ...midfielders].filter(
      p => !wallPlayers.includes(p),
    )
    const oppAttackersInBox = opponents.filter(opp => {
      const oppDistFromGoal = Math.abs(opp.position.y - ownGoalY(team))
      return oppDistFromGoal <= 22 + 5
    })

    for (let i = 0; i < remainingDef.length; i++) {
      if (i < oppAttackersInBox.length) {
        const opp = oppAttackersInBox[i]
        actions.push(moveAction(remainingDef[i], {
          x: (opp.position.x + ownGoal.x) / 2,
          y: (opp.position.y + ownGoalY(team)) / 2,
        }))
      } else {
        actions.push(moveAction(remainingDef[i], {
          x: 35 + i * 15,
          y: team === 1 ? ownGoalY(team) - 12 : ownGoalY(team) + 12,
        }))
      }
    }

    for (let i = 0; i < attackers.length && i < 2; i++) {
      actions.push(moveAction(attackers[i], { x: 35 + i * 30, y: 50 }))
    }
  } else {
    // Midfield free kick: compact shape
    const midY = (ballPos.y + ownGoalY(team)) / 2

    for (let i = 0; i < defenders.length; i++) {
      actions.push(moveAction(defenders[i], {
        x: 25 + i * 20,
        y: team === 1 ? Math.max(midY, ballPos.y + 5) : Math.min(midY, ballPos.y - 5),
      }))
    }

    const nearOpponents = opponents.filter(
      opp => distance(opp.position, ballPos) < 20,
    )
    for (let i = 0; i < midfielders.length; i++) {
      if (i < nearOpponents.length) {
        const opp = nearOpponents[i]
        actions.push(moveAction(midfielders[i], {
          x: opp.position.x,
          y: (opp.position.y + ownGoalY(team)) / 2,
        }))
      } else {
        actions.push(moveAction(midfielders[i], {
          x: 30 + i * 20,
          y: shiftToward(ballPos.y, -5, team),
        }))
      }
    }

    for (let i = 0; i < attackers.length && i < 2; i++) {
      actions.push(moveAction(attackers[i], {
        x: 35 + i * 30,
        y: shiftToward(50, 10, team),
      }))
    }

    if (goalkeeper) {
      actions.push(moveAction(goalkeeper, { x: 50, y: team === 1 ? 95 : 5 }))
    }
  }

  return actions
}
