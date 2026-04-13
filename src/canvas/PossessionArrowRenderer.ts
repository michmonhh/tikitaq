import { Camera } from './Camera'

/**
 * Renders three chevron arrows that animate in the direction of play
 * whenever ball possession changes between teams.
 * Drawn between the pitch and the players (z-order).
 */
export class PossessionArrowRenderer {
  private camera: Camera
  private startTime = 0
  private active = false
  private direction: 'up' | 'down' = 'up'
  private color = '#ffffff'

  // --- Tuning ---
  private static readonly DURATION = 1800       // total animation length (ms)
  private static readonly ARROW_COUNT = 3
  private static readonly HALF_W = 54.6         // arrow half-width (game-units), 42 × 1.3
  private static readonly HALF_H = 19.5         // arrow half-height (game-units), 15 × 1.3
  private static readonly MAX_ALPHA = 0.7        // peak opacity

  // Travel range: arrows move from 25% to 75% of the pitch (in attack direction)
  private static readonly START_Y = 25          // game-units from attack goal
  private static readonly END_Y = 75            // game-units from attack goal

  /**
   * Normalised chevron (pointing UP). Derived from the reference SVG.
   * Tip at (0, -1), base at (±1, +1), inner notch at (0, -0.19).
   */
  private static readonly CHEVRON = [
    { x: -0.60, y:  1.00 },  // inner-left base
    { x: -1.00, y:  1.00 },  // outer-left base
    { x:  0.00, y: -1.00 },  // tip
    { x:  1.00, y:  1.00 },  // outer-right base
    { x:  0.60, y:  1.00 },  // inner-right base
    { x:  0.00, y: -0.19 },  // inner notch
  ]

  constructor(camera: Camera) {
    this.camera = camera
  }

  /** Kick off the animation for the team that just gained the ball. */
  trigger(direction: 'up' | 'down', color: string) {
    this.startTime = performance.now()
    this.active = true
    this.direction = direction
    this.color = color
  }

  /** Call once per frame, between pitch and player rendering. */
  draw(ctx: CanvasRenderingContext2D, now: number) {
    if (!this.active) return

    const elapsed = now - this.startTime
    if (elapsed > PossessionArrowRenderer.DURATION) {
      this.active = false
      return
    }

    const progress = elapsed / PossessionArrowRenderer.DURATION // 0 → 1

    // All arrows share the same fade (simultaneous in/out)
    const alpha = Math.sin(progress * Math.PI) * PossessionArrowRenderer.MAX_ALPHA
    if (alpha < 0.005) return

    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = this.color
    ctx.shadowColor = this.color
    ctx.shadowBlur = 24 * this.camera.scale

    for (let i = 0; i < PossessionArrowRenderer.ARROW_COUNT; i++) {
      this.drawArrow(ctx, i, progress)
    }

    ctx.restore()
  }

  // ---------------------------------------------------------------

  private drawArrow(ctx: CanvasRenderingContext2D, index: number, progress: number) {
    const { ARROW_COUNT, HALF_W, HALF_H, START_Y, END_Y, CHEVRON } = PossessionArrowRenderer

    // Evenly space the three arrows across the travel range
    // At progress=0 they sit at the start positions, at progress=1 at the end
    const travelRange = END_Y - START_Y                     // 50 game-units
    const spacing = travelRange / (ARROW_COUNT + 1)         // equal gaps
    const slotOffset = spacing * (index + 1)                // 1/4, 2/4, 3/4 of range

    // Current y in "distance from attack-side goal" coordinates (0 = goal, 100 = own goal)
    const yInAttackCoords = START_Y + slotOffset + progress * travelRange * 0.5 - travelRange * 0.25

    // Convert to game coords: Team 1 attacks toward y=0, Team 2 attacks toward y=100
    const gameY = this.direction === 'up'
      ? 100 - yInAttackCoords     // Team 1 attacks upward → high y at start, decreasing
      : yInAttackCoords           // Team 2 attacks downward → low y at start, increasing

    const center = this.camera.toScreen(50, gameY)
    const hw = HALF_W * this.camera.scale
    const hh = HALF_H * this.camera.scale
    const flipY = this.direction === 'up' ? 1 : -1

    ctx.beginPath()
    ctx.moveTo(
      center.x + CHEVRON[0].x * hw,
      center.y + CHEVRON[0].y * hh * flipY,
    )
    for (let i = 1; i < CHEVRON.length; i++) {
      ctx.lineTo(
        center.x + CHEVRON[i].x * hw,
        center.y + CHEVRON[i].y * hh * flipY,
      )
    }
    ctx.closePath()
    ctx.fill()
  }
}
