import type { PlayerData, Position } from '../../engine/types'

export type DragTarget =
  | { type: 'player'; player: PlayerData }
  | { type: 'ball' }
  | null

export interface InputState {
  isDragging: boolean
  dragTarget: DragTarget
  dragPosition: Position | null  // Current drag position in game coords
  pointerDown: boolean
}

export type InputCallback = (state: InputState) => void
export type DragEndCallback = (target: DragTarget, position: Position) => void
export type TapCallback = (player: PlayerData | null) => void
