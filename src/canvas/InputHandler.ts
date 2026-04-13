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
type TapCallback = (player: PlayerData | null) => void

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
  private onTap: TapCallback
  private players: PlayerData[] = []
  private ball: BallData = { position: { x: 50, y: 50 }, ownerId: null }
  private currentTeam: 1 | 2 = 1
  private localTeam: 1 | 2 | null = null // For duel mode
  private isKickoffPhase = false
  private mustPass = false
  private penaltyMode: 'shooter' | 'keeper' | null = null
  private pointerDownPos: Position | null = null // For tap detection

  // Zoom: double-tap detection
  private lastTapTime = 0
  private lastTapGamePos: Position | null = null

  // Zoom: pinch-to-zoom
  private activePointers = new Map<number, { x: number; y: number }>()
  private pinchStartDist: number | null = null

  // Zoom: panning when zoomed
  private isPanning = false
  private lastPanScreenX = 0
  private lastPanScreenY = 0

  private boundPointerDown: (e: PointerEvent) => void
  private boundPointerMove: (e: PointerEvent) => void
  private boundPointerUp: (e: PointerEvent) => void

  constructor(
    camera: Camera,
    canvas: HTMLCanvasElement,
    onChange: InputCallback,
    onDragEnd: DragEndCallback,
    onTap: TapCallback
  ) {
    this.camera = camera
    this.canvas = canvas
    this.onChange = onChange
    this.onDragEnd = onDragEnd
    this.onTap = onTap

    this.boundPointerDown = this.handlePointerDown.bind(this)
    this.boundPointerMove = this.handlePointerMove.bind(this)
    this.boundPointerUp = this.handlePointerUp.bind(this)

    canvas.addEventListener('pointerdown', this.boundPointerDown)
    canvas.addEventListener('pointermove', this.boundPointerMove)
    canvas.addEventListener('pointerup', this.boundPointerUp)
    canvas.addEventListener('pointerleave', this.boundPointerUp)
    canvas.style.touchAction = 'none' // Prevent scroll on touch
  }

  updateGameState(players: PlayerData[], ball: BallData, currentTeam: 1 | 2, localTeam?: 1 | 2 | null, isKickoffPhase?: boolean, mustPass?: boolean, penaltyMode?: 'shooter' | 'keeper' | null) {
    this.players = players
    this.ball = ball
    this.currentTeam = currentTeam
    this.localTeam = localTeam ?? null
    this.isKickoffPhase = isKickoffPhase ?? false
    this.mustPass = mustPass ?? false
    this.penaltyMode = penaltyMode ?? null
  }

  private getGamePos(e: PointerEvent): Position {
    const rect = this.canvas.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    return this.camera.toGame(screenX, screenY)
  }

  private handlePointerDown(e: PointerEvent) {
    e.preventDefault()

    // Track pointer for pinch gesture
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

    // Multi-touch → pinch mode: cancel any ongoing drag/pan
    if (this.activePointers.size >= 2) {
      this.cancelCurrentGesture()
      this.pinchStartDist = this.getPinchDistance()
      return
    }

    const pos = this.getGamePos(e)
    this.state.pointerDown = true
    this.pointerDownPos = pos // Save for tap detection

    // Determine what was clicked: player or ball
    const isTouch = e.pointerType === 'touch'
    const hitRadius = isTouch ? 8 : 6

    // Must pass: only allow ball interaction, no player movement
    // Exception: during set pieces the defending team can still reposition
    const isDefendingSetPiece = this.mustPass && this.isKickoffPhase &&
      this.localTeam != null && this.localTeam !== this.currentTeam
    if (this.mustPass && !isDefendingSetPiece) {
      const ballOwner = this.ball.ownerId
        ? this.players.find(p => p.id === this.ball.ownerId)
        : null
      const ballDisplayPos = ballOwner
        ? { x: ballOwner.position.x + 2.5, y: ballOwner.position.y + 1.5 }
        : this.ball.position

      if (ballOwner && ballOwner.team === this.currentTeam) {
        const distToBall = rawDistance(pos, ballDisplayPos)
        if (distToBall < hitRadius) {
          this.state.isDragging = true
          this.state.dragTarget = { type: 'ball' }
          this.state.dragPosition = pos
          this.onChange(this.state)
          return
        }
      }
      this.tryStartPan(e)
      return
    }

    // Penalty mode: both sides can reposition own players freely
    if (this.penaltyMode) {
      if (this.penaltyMode === 'shooter') {
        // Ball dragging (to shoot) or player repositioning
        const activeTeam = this.localTeam ?? this.currentTeam
        const ballOwner = this.ball.ownerId
          ? this.players.find(p => p.id === this.ball.ownerId)
          : null
        const ballDisplayPos = ballOwner
          ? { x: ballOwner.position.x + 2.5, y: ballOwner.position.y + 1.5 }
          : this.ball.position

        const canClickBall = ballOwner && ballOwner.team === activeTeam
        const distToBall = canClickBall ? rawDistance(pos, ballDisplayPos) : Infinity

        // Check ball first
        if (distToBall < hitRadius) {
          this.state.isDragging = true
          this.state.dragTarget = { type: 'ball' }
          this.state.dragPosition = pos
          this.onChange(this.state)
          return
        }

        // Otherwise allow dragging own players (except ball carrier)
        const clickedPlayer = this.findClosestPlayer(pos, activeTeam, hitRadius)
        if (clickedPlayer && clickedPlayer.id !== this.ball.ownerId) {
          this.state.isDragging = true
          this.state.dragTarget = { type: 'player', player: clickedPlayer }
          this.state.dragPosition = pos
          this.onChange(this.state)
          return
        }
      } else {
        // Keeper: allow dragging any own team player (free positioning)
        const activeTeam = this.localTeam ?? this.currentTeam
        const clickedPlayer = this.findClosestPlayer(pos, activeTeam, hitRadius)
        if (clickedPlayer) {
          this.state.isDragging = true
          this.state.dragTarget = { type: 'player', player: clickedPlayer }
          this.state.dragPosition = pos
          this.onChange(this.state)
          return
        }
      }
      this.tryStartPan(e)
      return
    }

    // During kickoff/set piece phase: only own team players can be repositioned, no ball
    if (this.isKickoffPhase) {
      const activeTeam = this.localTeam ?? this.currentTeam
      const ownPlayer = this.findClosestPlayer(pos, activeTeam, hitRadius)
      if (ownPlayer) {
        this.state.isDragging = true
        this.state.dragTarget = { type: 'player', player: ownPlayer }
        this.state.dragPosition = pos
        this.onChange(this.state)
        return
      }
      this.tryStartPan(e)
      return
    }

    const activeTeam = this.localTeam ?? this.currentTeam

    // Find closest player on active team
    const clickablePlayer = this.findClosestPlayer(pos, activeTeam, hitRadius)
    const distToPlayer = clickablePlayer ? rawDistance(pos, clickablePlayer.position) : Infinity

    // Find ball (visually offset from carrier)
    const ballOwner = this.ball.ownerId
      ? this.players.find(p => p.id === this.ball.ownerId)
      : null

    const ballDisplayPos = ballOwner
      ? { x: ballOwner.position.x + 2.5, y: ballOwner.position.y + 1.5 }
      : this.ball.position

    const canClickBall = ballOwner && ballOwner.team === this.currentTeam
    const distToBall = canClickBall ? rawDistance(pos, ballDisplayPos) : Infinity

    // Pick whichever is closer to the click
    if (distToBall < hitRadius && distToBall < distToPlayer) {
      this.state.isDragging = true
      this.state.dragTarget = { type: 'ball' }
      this.state.dragPosition = pos
      this.onChange(this.state)
      return
    }

    if (clickablePlayer && !clickablePlayer.hasActed && distToPlayer < hitRadius) {
      this.state.isDragging = true
      this.state.dragTarget = { type: 'player', player: clickablePlayer }
      this.state.dragPosition = pos
      this.onChange(this.state)
      return
    }

    // Nothing was hit — if zoomed, start panning
    this.tryStartPan(e)
  }

  private handlePointerMove(e: PointerEvent) {
    // Track pointer for pinch
    if (this.activePointers.has(e.pointerId)) {
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }

    // Pinch gesture: check zoom toggle
    if (this.activePointers.size >= 2 && this.pinchStartDist !== null) {
      const dist = this.getPinchDistance()
      const ratio = dist / this.pinchStartDist
      if (ratio > 1.5 && !this.camera.isZoomed) {
        const center = this.getPinchGameCenter()
        this.camera.toggleZoom(center.x, center.y)
        this.pinchStartDist = null // prevent repeat
      } else if (ratio < 0.67 && this.camera.isZoomed) {
        this.camera.toggleZoom(50, 50)
        this.pinchStartDist = null
      }
      return
    }

    // Panning
    if (this.isPanning) {
      e.preventDefault()
      this.camera.panByScreenDelta(e.clientX - this.lastPanScreenX, e.clientY - this.lastPanScreenY)
      this.lastPanScreenX = e.clientX
      this.lastPanScreenY = e.clientY
      return
    }

    if (!this.state.isDragging) return
    e.preventDefault()
    this.state.dragPosition = this.getGamePos(e)
    this.onChange(this.state)
  }

  private handlePointerUp(e: PointerEvent) {
    // Remove pointer from tracking
    this.activePointers.delete(e.pointerId)

    // End pinch mode if was pinching
    if (this.pinchStartDist !== null) {
      if (this.activePointers.size < 2) {
        this.pinchStartDist = null
      }
      this.state.pointerDown = false
      this.pointerDownPos = null
      return
    }

    // End panning
    if (this.isPanning) {
      this.isPanning = false
      // Check for double-tap even after short pan (tap detection)
      const upPos = this.getGamePos(e)
      if (this.pointerDownPos) {
        const moved = rawDistance(upPos, this.pointerDownPos)
        if (moved < 3 && this.checkDoubleTap(upPos)) {
          this.state.pointerDown = false
          this.pointerDownPos = null
          return
        }
      }
      this.state.pointerDown = false
      this.pointerDownPos = null
      return
    }

    const upPos = this.getGamePos(e)

    // Check for tap: pointer barely moved from down position
    if (this.pointerDownPos && !this.state.isDragging) {
      const moved = rawDistance(upPos, this.pointerDownPos)
      if (moved < 3) {
        // Double-tap → toggle zoom
        if (this.checkDoubleTap(upPos)) {
          this.state.pointerDown = false
          this.pointerDownPos = null
          return
        }
        // Single tap — find any player near tap position (either team)
        const tappedPlayer = this.findClosestPlayerAnyTeam(upPos, 6)
        this.onTap(tappedPlayer)
      }
      this.state.pointerDown = false
      this.pointerDownPos = null
      return
    }

    if (!this.state.isDragging || !this.state.dragPosition) {
      this.state.pointerDown = false
      this.pointerDownPos = null
      return
    }

    e.preventDefault()
    const pos = this.state.dragPosition

    // Check if this was actually a tap (dragged very short distance)
    if (this.pointerDownPos) {
      const dragDist = rawDistance(pos, this.pointerDownPos)
      if (dragDist < 2 && this.state.dragTarget?.type === 'player') {
        // Double-tap on player → zoom (takes priority)
        if (this.checkDoubleTap(upPos)) {
          this.state.isDragging = false
          this.state.pointerDown = false
          this.state.dragTarget = null
          this.state.dragPosition = null
          this.pointerDownPos = null
          this.onChange(this.state)
          return
        }
        // Single tap on player — select, don't move
        this.onTap(this.state.dragTarget.player)
        this.state.isDragging = false
        this.state.pointerDown = false
        this.state.dragTarget = null
        this.state.dragPosition = null
        this.pointerDownPos = null
        this.onChange(this.state)
        return
      }
    }

    // Reset state
    this.state.isDragging = false
    this.state.pointerDown = false
    this.pointerDownPos = null
    const prevTarget = this.state.dragTarget
    this.state.dragTarget = null
    this.state.dragPosition = null

    this.onChange(this.state)
    this.onDragEnd(prevTarget, pos)
  }

  // --- Zoom gesture helpers ---

  /** Start panning if zoomed (called when no drag target was found). */
  private tryStartPan(e: PointerEvent) {
    if (this.camera.isZoomed) {
      this.isPanning = true
      this.lastPanScreenX = e.clientX
      this.lastPanScreenY = e.clientY
    }
  }

  /** Returns true if this tap completes a double-tap → toggles zoom. */
  private checkDoubleTap(pos: Position): boolean {
    const now = Date.now()
    if (this.lastTapTime && now - this.lastTapTime < 350 && this.lastTapGamePos) {
      const dist = rawDistance(pos, this.lastTapGamePos)
      if (dist < 8) {
        this.camera.toggleZoom(pos.x, pos.y)
        this.lastTapTime = 0
        this.lastTapGamePos = null
        return true
      }
    }
    this.lastTapTime = now
    this.lastTapGamePos = pos
    return false
  }

  /** Cancel any ongoing drag or pan (e.g. when entering pinch mode). */
  private cancelCurrentGesture() {
    if (this.state.isDragging) {
      this.state.isDragging = false
      this.state.dragTarget = null
      this.state.dragPosition = null
      this.onChange(this.state)
    }
    this.isPanning = false
    this.state.pointerDown = false
    this.pointerDownPos = null
  }

  /** Distance between two active pointers (screen pixels). */
  private getPinchDistance(): number {
    const pts = [...this.activePointers.values()]
    if (pts.length < 2) return 0
    const dx = pts[0].x - pts[1].x
    const dy = pts[0].y - pts[1].y
    return Math.sqrt(dx * dx + dy * dy)
  }

  /** Center of pinch in game coordinates. */
  private getPinchGameCenter(): Position {
    const pts = [...this.activePointers.values()]
    if (pts.length < 2) return { x: 50, y: 50 }
    const rect = this.canvas.getBoundingClientRect()
    const cx = (pts[0].x + pts[1].x) / 2 - rect.left
    const cy = (pts[0].y + pts[1].y) / 2 - rect.top
    return this.camera.toGame(cx, cy)
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

  private findClosestPlayerAnyTeam(pos: Position, maxDist: number): PlayerData | null {
    let closest: PlayerData | null = null
    let closestDist = maxDist

    for (const player of this.players) {
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
