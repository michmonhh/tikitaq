import type { PlayerData, GameEvent } from './types'
import type { TackleEncounter } from './movement'

export interface TackleResult {
  won: boolean
  winner: PlayerData
  loser: PlayerData
  event: GameEvent
}

/**
 * Resolve a tackle encounter. The defender has a probability-based chance
 * of winning the ball from the attacker.
 */
export function resolveTackle(encounter: TackleEncounter): TackleResult {
  const roll = Math.random()
  const won = roll < encounter.winProbability

  if (won) {
    return {
      won: true,
      winner: encounter.defender,
      loser: encounter.attacker,
      event: {
        type: 'tackle_won',
        playerId: encounter.defender.id,
        targetId: encounter.attacker.id,
        position: encounter.defender.position,
        message: `Tackle won by ${encounter.defender.positionLabel}!`,
      },
    }
  }

  return {
    won: false,
    winner: encounter.attacker,
    loser: encounter.defender,
    event: {
      type: 'tackle_lost',
      playerId: encounter.defender.id,
      targetId: encounter.attacker.id,
      position: encounter.attacker.position,
      message: `${encounter.attacker.positionLabel} shields the ball!`,
    },
  }
}
