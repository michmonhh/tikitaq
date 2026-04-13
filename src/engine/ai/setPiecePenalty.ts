/**
 * Penalty positioning — shooting and defending team.
 *
 * Defending team: positions strategically based on keeperChoice —
 * field players cover the side the keeper doesn't, counter-runners
 * go wide.
 *
 * Shooting team (reactive): analyses the opponent's defensive setup
 * and shifts rebound-hunters dramatically toward the weak side.
 */

import type { GameState, TeamSide, Position, PlayerAction, PenaltyDirection } from '../types'
import { PITCH } from '../constants'
import { ownGoalY, moveAction, enforceSpacing } from './setPieceHelpers'

export function repositionForPenalty(
  state: GameState,
  team: TeamSide,
  shooterTeam: TeamSide,
  shooterId: string,
  keeperId: string,
  reactive = false,
  keeperChoice?: PenaltyDirection | null,
): PlayerAction[] {
  const actions: PlayerAction[] = []
  const isShootingTeam = team === shooterTeam

  // Penalty area edge Y (outside the box, toward midfield)
  const penaltyEdgeY = shooterTeam === 1 ? PITCH.PENALTY_AREA_DEPTH : (100 - PITCH.PENALTY_AREA_DEPTH)
  // "Away from goal" direction
  const awayDir = shooterTeam === 1 ? 1 : -1

  type SetPiecePlayer = { id: string; positionLabel: string; team: TeamSide; position: Position }
  const teamPlayers: SetPiecePlayer[] = state.players.filter(p => p.team === team)

  // Arc slots along penalty area edge
  const arcSlots: Position[] = [
    { x: 25, y: penaltyEdgeY + awayDir * 4 },  // 0: links außen
    { x: 34, y: penaltyEdgeY + awayDir * 2 },  // 1: halb-links
    { x: 42, y: penaltyEdgeY + awayDir * 1 },  // 2: links-zentral
    { x: 50, y: penaltyEdgeY + awayDir * 0.5 },// 3: zentral
    { x: 58, y: penaltyEdgeY + awayDir * 1 },  // 4: rechts-zentral
    { x: 66, y: penaltyEdgeY + awayDir * 2 },  // 5: halb-rechts
    { x: 75, y: penaltyEdgeY + awayDir * 4 },  // 6: rechts außen
  ]

  for (const player of teamPlayers) {
    if (player.id === shooterId || player.id === keeperId) continue
    const role = player.positionLabel

    if (isShootingTeam) {
      positionShooterPlayer(actions, player, role, teamPlayers, shooterId, arcSlots, penaltyEdgeY, awayDir, team, reactive, state, keeperId)
    } else {
      positionDefenderPlayer(actions, player, role, teamPlayers, keeperId, arcSlots, penaltyEdgeY, awayDir, team, keeperChoice)
    }
  }

  // Enforce minimum spacing — include all players NOT being repositioned as fixed
  // (other team's players + shooter + keeper)
  const movedIds = new Set(actions.map(a => a.playerId))
  const fixed: Position[] = state.players
    .filter(p => !movedIds.has(p.id))
    .map(p => p.position)
  enforceSpacing(actions, fixed)

  return actions
}

// ── Shooting team positioning ─────────────────────────────────────

function positionShooterPlayer(
  actions: PlayerAction[],
  player: { id: string; positionLabel: string; team: 1 | 2; position: Position },
  role: string,
  teamPlayers: { id: string; positionLabel: string; team: 1 | 2; position: Position }[],
  shooterId: string,
  arcSlots: Position[],
  penaltyEdgeY: number,
  awayDir: number,
  team: 1 | 2,
  reactive: boolean,
  state: GameState,
  keeperId: string,
) {
  // Reactive analysis
  let weakSide: 'left' | 'right' | 'balanced' = 'balanced'
  let counterThreat = 0

  if (reactive) {
    const opponents = state.players.filter(p => p.team !== team && p.id !== keeperId)
    const nearArea = opponents.filter(p => Math.abs(p.position.y - penaltyEdgeY) < 15)
    const leftDef = nearArea.filter(p => p.position.x < 40).length
    const rightDef = nearArea.filter(p => p.position.x > 60).length
    weakSide = leftDef < rightDef ? 'left' : rightDef < leftDef ? 'right' : 'balanced'

    counterThreat = opponents.filter(p =>
      team === 1 // shooting team direction
        ? p.position.y > 55
        : p.position.y < 45
    ).length
  }

  // TW → own goal
  if (role === 'TW') {
    const ownGoal = ownGoalY(team)
    actions.push(moveAction(player, { x: 50, y: team === 1 ? ownGoal - 3 : ownGoal + 3 }))
    return
  }

  // IV → counter-security
  if (role === 'IV') {
    const idx = teamPlayers.filter(p => p.positionLabel === 'IV' && p.id !== shooterId).indexOf(player)
    const depth = counterThreat >= 2 ? 22 : 15
    let x = 40 + idx * 20
    if (reactive && weakSide === 'left') x = 35 + idx * 15
    else if (reactive && weakSide === 'right') x = 50 + idx * 15
    actions.push(moveAction(player, { x, y: 50 + awayDir * depth }))
    return
  }

  // LV/RV → dramatic shift toward weak side
  if (role === 'LV') {
    if (reactive && weakSide === 'left') {
      actions.push(moveAction(player, { x: 18, y: penaltyEdgeY + awayDir * 1.5 }))
    } else if (reactive && weakSide === 'right') {
      // Swing LV to right side to help
      actions.push(moveAction(player, { x: 65, y: penaltyEdgeY + awayDir * 3 }))
    } else {
      actions.push(moveAction(player, { x: 20, y: penaltyEdgeY + awayDir * 8 }))
    }
    return
  }
  if (role === 'RV') {
    if (reactive && weakSide === 'right') {
      actions.push(moveAction(player, { x: 82, y: penaltyEdgeY + awayDir * 1.5 }))
    } else if (reactive && weakSide === 'left') {
      // Swing RV to left side to help
      actions.push(moveAction(player, { x: 35, y: penaltyEdgeY + awayDir * 3 }))
    } else {
      actions.push(moveAction(player, { x: 80, y: penaltyEdgeY + awayDir * 8 }))
    }
    return
  }

  // Midfield + attack → arc slots, dramatically shifted toward weak side
  const baseMap: Record<string, number> = { LM: 1, ZDM: 3, OM: 4, RM: 5, ST: 2 }
  let slotIdx = baseMap[role] ?? 3
  if (reactive && weakSide === 'left') slotIdx = Math.max(0, slotIdx - 2)
  else if (reactive && weakSide === 'right') slotIdx = Math.min(6, slotIdx + 2)
  actions.push(moveAction(player, arcSlots[slotIdx]))
}

// ── Defending team positioning ────────────────────────────────────

function positionDefenderPlayer(
  actions: PlayerAction[],
  player: { id: string; positionLabel: string; team: 1 | 2; position: Position },
  role: string,
  teamPlayers: { id: string; positionLabel: string; team: 1 | 2; position: Position }[],
  keeperId: string,
  arcSlots: Position[],
  penaltyEdgeY: number,
  awayDir: number,
  _team: 1 | 2,
  keeperChoice?: PenaltyDirection | null,
) {
  // Cover bias: field players emphasize the side the keeper DOESN'T cover
  const coverBias = keeperChoice === 'left' ? 10 : keeperChoice === 'right' ? -10 : 0

  // ST → wide counter-runners, spread for fast break
  if (role === 'ST') {
    const idx = teamPlayers.filter(p => p.positionLabel === 'ST' && p.id !== keeperId).indexOf(player)
    const counterX = idx === 0 ? 25 : 75
    actions.push(moveAction(player, { x: counterX, y: 50 - awayDir * 8 }))
    return
  }

  // OM → counter link, biased to opposite side of keeper
  if (role === 'OM') {
    actions.push(moveAction(player, { x: 50 + coverBias, y: 50 - awayDir * 3 }))
    return
  }

  // IV → cover opposite side from keeper, staggered depth
  if (role === 'IV') {
    const ivs = teamPlayers.filter(p => p.positionLabel === 'IV' && p.id !== keeperId)
    const ivIdx = ivs.indexOf(player)
    // One IV central-keeper-side, one shifted to cover-side
    const x = ivIdx === 0 ? 44 + coverBias : 56 + coverBias
    actions.push(moveAction(player, { x, y: penaltyEdgeY + awayDir * 1 }))
    return
  }

  // ZDM → slightly behind the arc, biased to cover side
  if (role === 'ZDM') {
    actions.push(moveAction(player, { x: 50 + coverBias * 0.6, y: penaltyEdgeY + awayDir * 2 }))
    return
  }

  // LM → arc left, pushed further left if keeper covers right
  if (role === 'LM') {
    const x = keeperChoice === 'right' ? 22 : 34
    actions.push(moveAction(player, { x, y: penaltyEdgeY + awayDir * 3 }))
    return
  }

  // RM → arc right, pushed further right if keeper covers left
  if (role === 'RM') {
    const x = keeperChoice === 'left' ? 78 : 66
    actions.push(moveAction(player, { x, y: penaltyEdgeY + awayDir * 3 }))
    return
  }

  // LV → wide left cover
  if (role === 'LV') {
    const x = keeperChoice === 'right' ? 18 : 28
    actions.push(moveAction(player, { x, y: penaltyEdgeY + awayDir * 4 }))
    return
  }

  // RV → wide right cover
  if (role === 'RV') {
    const x = keeperChoice === 'left' ? 82 : 72
    actions.push(moveAction(player, { x, y: penaltyEdgeY + awayDir * 4 }))
    return
  }

  // Fallback: central arc
  actions.push(moveAction(player, arcSlots[3]))
}
