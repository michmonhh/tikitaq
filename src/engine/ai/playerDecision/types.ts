import type { Position } from '../../types'

export type BallOptionType =
  | 'shoot'
  | 'short_pass'
  | 'long_ball'
  | 'through_ball'
  | 'cross'
  | 'dribble'
  | 'advance'
  | 'hold'

export interface BallOption {
  type: BallOptionType
  target: Position
  receiverId?: string
  successChance: number   // 0–1
  reward: number          // 0–1
  score: number           // Endscore nach allen Bonussen
  reason: string
}
