import { Camera } from './Camera'
import type { PlayerData, BallData, Position } from '../engine/types'
import { rawDistance } from '../engine/geometry'

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

type InputCallback = (state: InputState) => void
type DragEndCallback = (target: DragTarget, position: Position) => void

/**
 * Handles pointer/touch input on the canvas and converts
 * screen coordinates to game coordinates via the Camera.
 */
export class InputHandler {
  private camera: Camera
  private canvas: HTMLCanvasElement
  private state: InputState = {
    isDragging: false,
    dragTarget: null,
    dragPosition: null,
    pointerDown: false,
  }

  private onChange: InputCallback
  private onDragEnd: DragEndCallback
  private players: PlayerData[] = []
  private ball: BallData = { position: { x: 50, y: 50 }, ownerId: null }
  private currentTeam: 1 | 2 = 1
  private localTeam: 1 | 2 | null = null // For duel mode

  private boundPointerDown: (e: PointerEvent) => void
  private boundPointerMove: (e: PointerEvent) => void
  private boundPointerUp: (e: PointerEvent) => void

  constructor(
    camera: Camera,
    canvas: HTMLCanvasElement,
    onChange: InputCallback,
    onDragEnd: DragEndCallback
  ) {
    this.camera = camera
    this.canvas = canvas
    this.onChange = onChange
    this.onDragEnd = onDragEnd

    this.boundPointerDown = this.handlePointerDown.bind(this)
    this.boundPointerMove = this.handlePointerMove.bind(this)
    this.boundPointerUp = this.handlePointerUp.bind(this)

    canvas.addEventListener('pointerdown', this.boundPointerDown)
    canvas.addEventListener('pointermove', this.boundPointerMove)
    canvas.addEventListener('pointerup', this.boundPointerUp)
    canvas.addEventListener('pointerleave', this.boundPointerUp)
    canvas.style.touchAction = 'none' // Prevent scroll on touch
  }

  updateGameState(players: PlayerData[], ball: BallData, currentTeam: 1 | 2, localTeam?: 1 | 2 | null) {
    this.players = players
    this.ball = ball
    this.currentTeam = currentTeam
    this.localTeam = localTeam ?? null
  }

  private getGamePos(e: PointerEvent): Position {
    const rect = this.canvas.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    return this.camera.toGame(screenX, screenY)
  }

  private handlePointerDown(e: PointerEvent) {
    e.preventDefault()
    const pos = this.getGamePos(e)
    this.state.pointerDown = true

    // Determine what was clicked: player or ball
    // Larger hit radius on touch devices for easier selection
    const isTouch = e.pointerType === 'touch'
    const hitRadius = isTouch ? 8 : 6

    // Check if clicking the ball (only if owned by current team)
    const ballOwner = this.ball.ownerId
      ? this.players.find(p => p.id === this.ball.ownerId)
      : null

    if (ballOwner && ballOwner.team === this.currentTeam) {
      const distToBall = rawDistance(pos, this.ball.position)
      if (distToBall < hitRadius) {
        this.state.isDragging = true
        this.state.dragTarget = { type: 'ball' }
        this.state.dragPosition = pos
        this.onChange(this.state)
        return
      }
    }

    // Check if clicking a player on the current team
    const activeTeam = this.localTeam ?? this.currentTeam
    const clickablePlayer = this.findClosestPlayer(pos, activeTeam, hitRadius)

    if (clickablePlayer && !clickablePlayer.hasActed) {
      this.state.isDragging = true
      this.state.dragTarget = { type: 'player', player: clickablePlayer }
      this.state.dragPosition = pos
      this.onChange(this.state)
    }
  }

  private handlePointerMove(e: PointerEvent) {
    if (!this.state.isDragging) return
    e.preventDefault()
    this.state.dragPosition = this.getGamePos(e)
    this.onChange(this.state)
  }

  private handlePointerUp(e: PointerEvent) {
    if (!this.state.isDragging || !this.state.dragPosition) {
      this.state.pointerDown = false
      return
    }

    e.preventDefault()
    const pos = this.state.dragPosition

    // Reset state
    this.state.isDragging = false
    this.state.pointerDown = false
    const prevTarget = this.state.dragTarget
    this.state.dragTarget = null
    this.state.dragPosition = null

    this.onChange(this.state)
    this.onDragEnd(prevTarget, pos)
  }

  private findClosestPlayer(pos: Position, team: 1 | 2, maxDist: number): PlayerData | null {
    let closest: PlayerData | null = null
    let closestDist = maxDist

    for (const player of this.players) {
      if (player.team !== team) continue
      const dist = rawDistance(pos, player.position)
      if (dist < closestDist) {
        closestDist = dist
        closest = player
      }
    }

    return closest
  }

  destroy() {
    this.canvas.removeEventListener('pointerdown', this.boundPointerDown)
    this.canvas.removeEventListener('pointermove', this.boundPointerMove)
    this.canvas.removeEventListener('pointerup', this.boundPointerUp)
    this.canvas.removeEventListener('pointerleave', this.boundPointerUp)
  }
}
