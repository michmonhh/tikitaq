import type { PlayerData, Position, GameState, MoveAction, GameEvent } from './types'
import { name } from './playerName'
import { getConfidenceModifier } from './confidence'
import * as T from '../data/tickerTexts'
import { distance, getMovementRadius, getTackleRadius, clampToPitch, clampToRadius, pointToSegmentDistance } from './geometry'

export interface MoveResult {
  updatedPlayer: PlayerData
  ballPickedUp: boolean
  tackle: TackleEncounter | null
  event: GameEvent | null
}

export interface TackleEncounter {
  defender: PlayerData
  attacker: PlayerData
  winProbability: number
}

/**
 * Validate and constrain a move target within the player's movement radius.
 */
export function constrainMove(player: PlayerData, target: { x: number; y: number }): { x: number; y: number } {
  const radius = getMovementRadius(player)
  const constrained = clampToRadius(target, player.origin, radius)
  return clampToPitch(constrained)
}

/**
 * Check if a player can move.
 * Players can move unless they:
 * - received a pass this turn
 * - were involved in a tackle this turn
 * - already have hasActed set (from other events)
 */
export function canPlayerMove(player: PlayerData, state: GameState): boolean {
  if (player.team !== state.currentTurn) return false
  if (player.hasActed) return false
  return true
}

/**
 * Apply a move action to the game state. Returns the move result.
 * Moving does NOT set hasActed — players can keep moving until
 * they receive a pass, have a tackle, or the turn ends.
 * Moving DOES set hasMoved (tracks that the player moved this turn).
 */
export function applyMove(
  action: MoveAction,
  state: GameState
): MoveResult {
  const player = state.players.find(p => p.id === action.playerId)
  if (!player) throw new Error(`Player ${action.playerId} not found`)

  const target = constrainMove(player, action.target)

  const updatedPlayer: PlayerData = {
    ...player,
    position: { ...target },
    // Moving does NOT set hasActed — player can act again
    hasMoved: true,
  }

  // Check if player picks up the ball (ball is unowned and nearby)
  let ballPickedUp = false
  if (!state.ball.ownerId && !state.ballOwnerChangedThisTurn) {
    const distToBall = distance(target, state.ball.position)
    if (distToBall < 3) {
      ballPickedUp = true
    }
  }

  // Check for tackle encounter with opponent ball carriers
  let tackle: TackleEncounter | null = null
  const opponents = state.players.filter(p => p.team !== player.team)
  const ballCarrier = state.ball.ownerId
    ? opponents.find(p => p.id === state.ball.ownerId)
    : null

  if (ballCarrier && !updatedPlayer.cannotTackle) {
    const tackleRadius = getTackleRadius(updatedPlayer)
    const distToCarrier = distance(target, ballCarrier.position)

    if (distToCarrier <= tackleRadius) {
      tackle = {
        defender: updatedPlayer,
        attacker: ballCarrier,
        winProbability: calculateTackleWinChance(updatedPlayer, ballCarrier),
      }
    }
  }

  // Ballträger dribbelt durch den defensiven Radius eines/mehrerer Gegner
  if (!tackle && state.ball.ownerId === player.id) {
    // Alle Gegner sammeln, deren Radius der Laufweg kreuzt
    const threats: { opp: PlayerData; segDist: number; winChance: number }[] = []

    for (const opp of opponents) {
      // Gegner, die gerade den Ball im Zweikampf verloren haben, dürfen nicht tackeln
      if (opp.cannotTackle) continue
      const oppRadius = getTackleRadius(opp)
      const segDist = pointToSegmentDistance(opp.position, player.origin, target)
      if (segDist <= oppRadius) {
        threats.push({
          opp,
          segDist,
          winChance: calculateTackleWinChance(opp, updatedPlayer),
        })
      }
    }

    if (threats.length > 0) {
      // Erster Gegner entlang des Pfads → ihm wird der Zweikampf zugeschrieben (Foul/Karte)
      threats.sort((a, b) => a.segDist - b.segDist)
      const firstThreat = threats[0]

      // Kumulierte Zweikampfwahrscheinlichkeit: 1 - ∏(1 - winChance_i)
      // 2 Gegner à 40% → 64%, 3 Gegner à 40% → 78%
      let survivalChance = 1
      for (const t of threats) survivalChance *= (1 - t.winChance)
      const compoundWinProb = Math.min(0.95, 1 - survivalChance)

      tackle = {
        defender: firstThreat.opp,
        attacker: updatedPlayer,
        winProbability: compoundWinProb,
      }
    }
  }

  return {
    updatedPlayer,
    ballPickedUp,
    tackle,
    event: {
      type: 'move',
      playerId: player.id,
      position: target,
      message: T.tickerMove(name(player)),
    },
  }
}

/**
 * Calculate probability that the tackler wins the ball.
 *
 * Carrier skill = 70% dribbling + 30% ball shielding (gute Dribbler dominieren)
 * Tackler skill = tackling
 * Base 45% (leichter Vorteil Ballführer), verschoben um 0.7% pro Stat-Punkt Differenz
 * Confidence beider Spieler + Fitness des Ballführers fließen ein.
 *
 * Beispiel: Elite-Dribbler (95/80) vs. Durchschnittsverteidiger (70):
 *   carrierSkill=90.5, diff=-20.5 → base 0.307 → Dribbler gewinnt ~70%
 */
export function calculateTackleWinChance(tackler: PlayerData, carrier: PlayerData): number {
  const carrierSkill = carrier.stats.dribbling * 0.7 + carrier.stats.ballShielding * 0.3
  const diff = tackler.stats.tackling - carrierSkill

  // Base 45% (leichter Carrier-Vorteil), 0.7% pro Stat-Punkt Differenz
  let chance = 0.45 + diff * 0.007

  // Confidence: hohe Carrier-Confidence senkt Risiko, hohe Tackler-Confidence erhöht es
  chance *= getConfidenceModifier(tackler) / getConfidenceModifier(carrier)

  // Fitness: müder Ballführer ist leichter zu stoppen
  const carrierFitness = 0.7 + (carrier.fitness / 100) * 0.3 // 0.7–1.0
  chance /= carrierFitness

  return Math.max(0.10, Math.min(0.90, chance))
}

/**
 * Calculate dribble risk for a ball carrier moving from `from` to `to`.
 * Returns 0 if the path doesn't cross any opponent's defensive radius,
 * otherwise the compounded tackle probability across ALL opponents in the path.
 * Formula: risk = 1 - ∏(1 - winChance_i)
 * E.g. 2 opponents at 40% each → 1 - 0.6 × 0.6 = 64%
 */
export function calculateDribbleRisk(
  carrier: PlayerData,
  from: Position,
  to: Position,
  opponents: PlayerData[],
): number {
  let survivalChance = 1
  for (const opp of opponents) {
    const oppRadius = getTackleRadius(opp)
    const segDist = pointToSegmentDistance(opp.position, from, to)
    if (segDist <= oppRadius) {
      survivalChance *= (1 - calculateTackleWinChance(opp, carrier))
    }
  }
  return survivalChance < 1 ? Math.min(0.95, 1 - survivalChance) : 0
}
