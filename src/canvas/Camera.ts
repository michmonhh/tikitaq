/**
 * Camera handles the transformation from game coordinates (0-100)
 * to canvas pixel coordinates, including the 3D perspective tilt.
 */
export class Camera {
  private canvasWidth = 0
  private canvasHeight = 0

  // Pitch area within canvas (with padding)
  private pitchX = 0
  private pitchY = 0
  private pitchW = 0
  private pitchH = 0

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
  }

  /** Convert game position (0-100) to canvas pixels. */
  toScreen(gameX: number, gameY: number): { x: number; y: number } {
    const x = this.pitchX + (gameX / 100) * this.pitchW
    const y = this.pitchY + (gameY / 100) * this.pitchH
    return { x, y }
  }

  /** Convert canvas pixels to game position (0-100). */
  toGame(screenX: number, screenY: number): { x: number; y: number } {
    const x = ((screenX - this.pitchX) / this.pitchW) * 100
    const y = ((screenY - this.pitchY) / this.pitchH) * 100
    return { x, y }
  }

  /** Convert a game-space distance to screen pixels (average of X and Y scale). */
  toScreenDistance(gameDistance: number): number {
    const scaleX = this.pitchW / 100
    const scaleY = this.pitchH / 100
    return gameDistance * ((scaleX + scaleY) / 2)
  }

  /** Scale factor for rendering elements (players, ball, etc.). */
  get scale(): number {
    return this.pitchW / 400 // Base design at 400px width
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
}
