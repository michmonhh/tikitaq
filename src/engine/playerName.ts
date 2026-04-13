import type { PlayerData } from './types'

/** Get a player's display name (last name, or position label as fallback) */
export function name(player: PlayerData): string {
  return player.lastName || player.positionLabel
}
