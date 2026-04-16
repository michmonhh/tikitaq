import type { GameState, PlayerAction, PlayerData } from '../../types'
import type { BallOption } from './types'

/** Konvertiert BallOption → Engine-Aktion */
export function toAction(carrier: PlayerData, opt: BallOption): PlayerAction {
  switch (opt.type) {
    case 'shoot':
      return { type: 'shoot', playerId: carrier.id, target: opt.target }

    case 'short_pass':
    case 'long_ball':
    case 'through_ball':
    case 'cross':
      return { type: 'pass', playerId: carrier.id, target: opt.target, receiverId: opt.receiverId! }

    case 'dribble':
    case 'advance':
    case 'hold':
      return { type: 'move', playerId: carrier.id, target: opt.target }
  }
}

export function getReceiverLabel(opt: BallOption, state: GameState): string {
  if (!opt.receiverId) return '?'
  const p = state.players.find(pl => pl.id === opt.receiverId)
  return p ? `${p.positionLabel} ${p.lastName}` : '?'
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
