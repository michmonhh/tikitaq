/**
 * Camera handles the transformation from game coordinates (0-100)
 * to canvas pixel coordinates, with optional zoom and pan.
 */
export class Camera {
  private canvasWidth = 0
  private canvasHeight = 0

  // Pitch area within canvas (with padding) — unzoomed layout
  private pitchX = 0
  private pitchY = 0
  private pitchW = 0
  private pitchH = 0

  // Zoom & pan state
  private zoomLevel = 1
  private panCX = 50   // viewport center in game coords (0-100)
  private panCY = 50

  // Mirror mode: when true, the view is flipped 180° so Team 2 plays "from the bottom"
  private _mirror = false

  resize(width: number, height: number) {
    this.canvasWidth = width
    this.canvasHeight = height

    // Pitch takes ~90% of canvas with padding
    const padding = Math.min(width, height) * 0.03
    const availW = width - padding * 2
    const availH = height - padding * 2

    // Maintain 2:3 aspect ratio (width:height) for the pitch
    const pitchAspect = 2 / 3
    if (availW / availH > pitchAspect) {
      this.pitchH = availH
      this.pitchW = availH * pitchAspect
    } else {
      this.pitchW = availW
      this.pitchH = availW / pitchAspect
    }

    this.pitchX = (width - this.pitchW) / 2
    this.pitchY = (height - this.pitchH) / 2
    this.clampPan()
  }

  /** Convert game position (0-100) to canvas pixels, accounting for zoom, pan & mirror. */
  toScreen(gameX: number, gameY: number): { x: number; y: number } {
    // Mirror: flip both axes so Team 2 plays "from the bottom"
    const gx = this._mirror ? 100 - gameX : gameX
    const gy = this._mirror ? 100 - gameY : gameY
    const x = this.pitchX + this.pitchW / 2 + (gx - this.panCX) * (this.pitchW / 100) * this.zoomLevel
    const y = this.pitchY + this.pitchH / 2 + (gy - this.panCY) * (this.pitchH / 100) * this.zoomLevel
    return { x, y }
  }

  /** Convert canvas pixels to game position (0-100), accounting for zoom, pan & mirror. */
  toGame(screenX: number, screenY: number): { x: number; y: number } {
    let x = this.panCX + (screenX - this.pitchX - this.pitchW / 2) * 100 / (this.pitchW * this.zoomLevel)
    let y = this.panCY + (screenY - this.pitchY - this.pitchH / 2) * 100 / (this.pitchH * this.zoomLevel)
    // Mirror: flip back to game coords
    if (this._mirror) { x = 100 - x; y = 100 - y }
    return { x, y }
  }

  /** Convert a game-space distance to screen pixels (zoom-aware). */
  toScreenDistance(gameDistance: number): number {
    const scaleX = this.pitchW / 100
    const scaleY = this.pitchH / 100
    return gameDistance * ((scaleX + scaleY) / 2) * this.zoomLevel
  }

  /** Convert a game-space radius to separate screen X/Y radii (zoom-aware). */
  toScreenRadii(gameRadius: number): { rx: number; ry: number } {
    return {
      rx: gameRadius * (this.pitchW / 100) * this.zoomLevel,
      ry: gameRadius * (this.pitchH / 100) * this.zoomLevel,
    }
  }

  /** Zoom-aware scale factor (includes zoom). Use for pitch elements that magnify. */
  get scale(): number {
    return this.baseScale * this.zoomLevel
  }

  /** Base scale factor without zoom. Use for UI elements that stay constant size (discs, ball, text). */
  get baseScale(): number {
    return this.pitchW / 400 // Base design at 400px width
  }

  get isZoomed(): boolean {
    return this.zoomLevel > 1
  }

  get zoom(): number {
    return this.zoomLevel
  }

  /** Toggle between 1× and 2× zoom, centering on the given game position. */
  toggleZoom(focusGameX: number, focusGameY: number) {
    if (this.zoomLevel <= 1) {
      this.zoomLevel = 2
      this.panCX = focusGameX
      this.panCY = focusGameY
      this.clampPan()
    } else {
      this.zoomLevel = 1
      this.panCX = 50
      this.panCY = 50
    }
  }

  /** Pan the viewport by a screen-pixel delta (for drag-to-pan). */
  panByScreenDelta(deltaScreenX: number, deltaScreenY: number) {
    if (this.zoomLevel <= 1) return
    this.panCX -= deltaScreenX * 100 / (this.pitchW * this.zoomLevel)
    this.panCY -= deltaScreenY * 100 / (this.pitchH * this.zoomLevel)
    this.clampPan()
  }

  private clampPan() {
    if (this.zoomLevel <= 1) {
      this.panCX = 50
      this.panCY = 50
      return
    }
    const halfVisX = 50 / this.zoomLevel
    const halfVisY = 50 / this.zoomLevel
    this.panCX = Math.max(halfVisX, Math.min(100 - halfVisX, this.panCX))
    this.panCY = Math.max(halfVisY, Math.min(100 - halfVisY, this.panCY))
  }

  get bounds() {
    return {
      x: this.pitchX,
      y: this.pitchY,
      width: this.pitchW,
      height: this.pitchH,
    }
  }

  get width() { return this.canvasWidth }
  get height() { return this.canvasHeight }

  /** Enable/disable 180° mirror mode (Team 2 perspective). */
  set mirror(on: boolean) { this._mirror = on }
  get mirror(): boolean { return this._mirror }
}
