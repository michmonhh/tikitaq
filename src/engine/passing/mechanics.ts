import type { PlayerData, Position } from '../types'
import { getConfidenceModifier } from '../confidence'
import { distance, getPassRadius, getInterceptRadius, getTackleRadius, pointToSegmentDistance, clampToRadius } from '../geometry'
import { PASSING } from '../constants'

export type PassType = 'ground' | 'high'

/**
 * Constrain a pass target within the player's pass radius.
 */
export function constrainPass(player: PlayerData, target: Position): Position {
  const radius = getPassRadius(player)
  return clampToRadius(target, player.position, radius)
}

/**
 * Find the closest teammate near a target position (for pass reception).
 */
export function findReceiver(
  passer: PlayerData,
  target: Position,
  players: PlayerData[]
): PlayerData | null {
  const teammates = players.filter(
    p => p.team === passer.team && p.id !== passer.id
  )

  let closest: PlayerData | null = null
  let closestDist: number = PASSING.RECEIVE_RADIUS

  for (const mate of teammates) {
    const dist = distance(mate.position, target)
    if (dist < closestDist) {
      closestDist = dist
      closest = mate
    }
  }

  return closest
}

/**
 * Check if any opponent's defensive radius blocks the direct pass lane.
 */
export function isPassLaneBlocked(
  passer: PlayerData,
  target: Position,
  opponents: PlayerData[]
): boolean {
  for (const opp of opponents) {
    const defRadius = getTackleRadius(opp)
    const distToLane = pointToSegmentDistance(opp.position, passer.position, target)
    if (distToLane <= defRadius) {
      return true
    }
  }
  return false
}

/**
 * Check if any opponent can intercept a ground pass.
 * Only applies to ground passes.
 */
export function checkInterception(
  passer: PlayerData,
  target: Position,
  opponents: PlayerData[]
): PlayerData | null {
  let bestInterceptor: PlayerData | null = null
  let bestDist = Infinity

  for (const opp of opponents) {
    const interceptRadius = getInterceptRadius(opp)
    const distToLane = pointToSegmentDistance(opp.position, passer.position, target)

    if (distToLane <= interceptRadius) {
      if (distToLane < bestDist) {
        bestDist = distToLane
        bestInterceptor = opp
      }
    }
  }

  return bestInterceptor
}

/**
 * Calculate pass success probability.
 * Factors:
 * - Passer's shortPassing / highPassing stat
 * - Distance to receiver
 * - Ground vs high pass type
 * - Receiver's ability to control under pressure (ballShielding, pacing)
 * - Opponent pressure on the receiver
 *
 * @param opponents - optional, pass all opponents to calculate receiver pressure
 */
export function calculatePassSuccess(
  passer: PlayerData,
  receiverPos: Position,
  passType: PassType,
  receiver?: PlayerData | null,
  opponents?: PlayerData[]
): number {
  const dist = distance(passer.position, receiverPos)

  // Base accuracy from passer stat (0-100 → 0.5-1.0 range)
  const stat = passType === 'ground' ? passer.stats.shortPassing : passer.stats.highPassing
  const baseAccuracy = 0.5 + (stat / 100) * 0.5

  // Distance penalty: further away = less accurate
  const distPenalty = dist * 0.005

  // High passes are half as likely to succeed as ground passes
  const typeFactor = passType === 'ground' ? 1.0 : 0.5

  let rawChance = (baseAccuracy - distPenalty) * typeFactor

  // Receiver quality: better receivers handle difficult passes
  if (receiver) {
    // Receiver's ball control bonus (0-5% bonus from ballShielding)
    const controlBonus = (receiver.stats.ballShielding / 100) * 0.05
    rawChance += controlBonus

    // Receiver under opponent pressure?
    if (opponents && opponents.length > 0) {
      let pressure = 0
      for (const opp of opponents) {
        const distToReceiver = distance(opp.position, receiverPos)
        if (distToReceiver < 10) {
          pressure += (10 - distToReceiver) * 0.01
        }
      }
      // Pressure reduces chance, but receiver's ballShielding mitigates it
      const shieldFactor = receiver.stats.ballShielding / 100 // 0-1
      const pressurePenalty = pressure * (1.2 - shieldFactor) // High shielding = less penalty
      rawChance -= pressurePenalty

      // Fast receivers can adjust position — small bonus
      rawChance += (receiver.stats.pacing / 100) * 0.03
    }
  }

  // Apply passer's confidence modifier
  rawChance *= getConfidenceModifier(passer)

  // Reduce miss rate by 68% (base 60% + additional 20% reduction)
  const chance = 1 - (1 - rawChance) * 0.32
  return Math.max(0.15, Math.min(0.98, chance))
}
