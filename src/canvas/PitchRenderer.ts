import { Camera } from './Camera'
import { PITCH, VISUAL } from '../engine/constants'

/**
 * Renders the football pitch: field, lines, penalty areas, goals, etc.
 */
export class PitchRenderer {
  private camera: Camera

  constructor(camera: Camera) {
    this.camera = camera
  }

  draw(ctx: CanvasRenderingContext2D) {
    this.drawField(ctx)
    this.drawOuterLines(ctx)
    this.drawCenterLine(ctx)
    this.drawCenterCircle(ctx)
    this.drawPenaltyAreas(ctx)
    this.drawGoalAreas(ctx)
    this.drawGoals(ctx)
    this.drawCornerArcs(ctx)
    this.drawPenaltySpots(ctx)
    this.drawCenterSpot(ctx)
  }

  private drawField(ctx: CanvasRenderingContext2D) {
    const b = this.camera.bounds
    // Gradient for depth
    const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.height)
    grad.addColorStop(0, '#1e6b35')
    grad.addColorStop(0.5, '#2d8a4e')
    grad.addColorStop(1, '#1e6b35')
    ctx.fillStyle = grad
    ctx.fillRect(b.x, b.y, b.width, b.height)

    // Mow stripes
    const stripeCount = 12
    const stripeH = b.height / stripeCount
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)'
    for (let i = 0; i < stripeCount; i += 2) {
      ctx.fillRect(b.x, b.y + i * stripeH, b.width, stripeH)
    }
  }

  private lineWidth(): number {
    return Math.max(1, this.camera.scale * 1.5)
  }

  private drawOuterLines(ctx: CanvasRenderingContext2D) {
    const tl = this.camera.toScreen(0, 0)
    const br = this.camera.toScreen(100, 100)
    ctx.strokeStyle = VISUAL.LINE_COLOR
    ctx.lineWidth = this.lineWidth()
    ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y)
  }

  private drawCenterLine(ctx: CanvasRenderingContext2D) {
    const left = this.camera.toScreen(0, 50)
    const right = this.camera.toScreen(100, 50)
    ctx.beginPath()
    ctx.moveTo(left.x, left.y)
    ctx.lineTo(right.x, right.y)
    ctx.strokeStyle = VISUAL.LINE_COLOR
    ctx.lineWidth = this.lineWidth()
    ctx.stroke()
  }

  private drawCenterCircle(ctx: CanvasRenderingContext2D) {
    const center = this.camera.toScreen(PITCH.CENTER_X, PITCH.CENTER_Y)
    const radius = this.camera.toScreenDistance(PITCH.CENTER_CIRCLE_RADIUS)
    ctx.beginPath()
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2)
    ctx.strokeStyle = VISUAL.LINE_COLOR
    ctx.lineWidth = this.lineWidth()
    ctx.stroke()
  }

  private drawCenterSpot(ctx: CanvasRenderingContext2D) {
    const center = this.camera.toScreen(PITCH.CENTER_X, PITCH.CENTER_Y)
    ctx.beginPath()
    ctx.arc(center.x, center.y, this.camera.scale * 3, 0, Math.PI * 2)
    ctx.fillStyle = VISUAL.LINE_COLOR
    ctx.fill()
  }

  private drawPenaltyAreas(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = VISUAL.LINE_COLOR
    ctx.lineWidth = this.lineWidth()

    // Top penalty area
    const topTL = this.camera.toScreen(PITCH.PENALTY_AREA_LEFT, 0)
    const topBR = this.camera.toScreen(PITCH.PENALTY_AREA_RIGHT, PITCH.PENALTY_AREA_DEPTH)
    ctx.strokeRect(topTL.x, topTL.y, topBR.x - topTL.x, topBR.y - topTL.y)

    // Bottom penalty area
    const botTL = this.camera.toScreen(PITCH.PENALTY_AREA_LEFT, 100 - PITCH.PENALTY_AREA_DEPTH)
    const botBR = this.camera.toScreen(PITCH.PENALTY_AREA_RIGHT, 100)
    ctx.strokeRect(botTL.x, botTL.y, botBR.x - botTL.x, botBR.y - botTL.y)
  }

  private drawGoalAreas(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = VISUAL.LINE_COLOR
    ctx.lineWidth = this.lineWidth()

    // Top goal area
    const topTL = this.camera.toScreen(PITCH.GOAL_AREA_LEFT, 0)
    const topBR = this.camera.toScreen(PITCH.GOAL_AREA_RIGHT, PITCH.GOAL_AREA_DEPTH)
    ctx.strokeRect(topTL.x, topTL.y, topBR.x - topTL.x, topBR.y - topTL.y)

    // Bottom goal area
    const botTL = this.camera.toScreen(PITCH.GOAL_AREA_LEFT, 100 - PITCH.GOAL_AREA_DEPTH)
    const botBR = this.camera.toScreen(PITCH.GOAL_AREA_RIGHT, 100)
    ctx.strokeRect(botTL.x, botTL.y, botBR.x - botTL.x, botBR.y - botTL.y)
  }

  private drawGoals(ctx: CanvasRenderingContext2D) {
    const goalDepth = 3 // Visual depth of goal behind line
    const postWidth = Math.max(2, this.camera.scale * 2)

    ctx.lineWidth = postWidth
    ctx.strokeStyle = '#ffffff'

    // Top goal (behind y=0 line)
    const topL = this.camera.toScreen(PITCH.GOAL_LEFT, -goalDepth)
    const topR = this.camera.toScreen(PITCH.GOAL_RIGHT, -goalDepth)
    const topLineL = this.camera.toScreen(PITCH.GOAL_LEFT, 0)
    const topLineR = this.camera.toScreen(PITCH.GOAL_RIGHT, 0)

    ctx.beginPath()
    ctx.moveTo(topLineL.x, topLineL.y)
    ctx.lineTo(topL.x, topL.y)
    ctx.lineTo(topR.x, topR.y)
    ctx.lineTo(topLineR.x, topLineR.y)
    ctx.stroke()

    // Net fill
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.fill()

    // Bottom goal (behind y=100 line)
    const botL = this.camera.toScreen(PITCH.GOAL_LEFT, 100 + goalDepth)
    const botR = this.camera.toScreen(PITCH.GOAL_RIGHT, 100 + goalDepth)
    const botLineL = this.camera.toScreen(PITCH.GOAL_LEFT, 100)
    const botLineR = this.camera.toScreen(PITCH.GOAL_RIGHT, 100)

    ctx.beginPath()
    ctx.moveTo(botLineL.x, botLineL.y)
    ctx.lineTo(botL.x, botL.y)
    ctx.lineTo(botR.x, botR.y)
    ctx.lineTo(botLineR.x, botLineR.y)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.fill()
  }

  private drawCornerArcs(ctx: CanvasRenderingContext2D) {
    const radius = this.camera.toScreenDistance(1.5)
    ctx.strokeStyle = VISUAL.LINE_COLOR
    ctx.lineWidth = this.lineWidth()

    const corners = [
      { pos: [0, 0], start: 0, end: Math.PI / 2 },
      { pos: [100, 0], start: Math.PI / 2, end: Math.PI },
      { pos: [0, 100], start: -Math.PI / 2, end: 0 },
      { pos: [100, 100], start: Math.PI, end: Math.PI * 1.5 },
    ]

    for (const corner of corners) {
      const p = this.camera.toScreen(corner.pos[0], corner.pos[1])
      ctx.beginPath()
      ctx.arc(p.x, p.y, radius, corner.start, corner.end)
      ctx.stroke()
    }
  }

  private drawPenaltySpots(ctx: CanvasRenderingContext2D) {
    const dotR = this.camera.scale * 2.5
    ctx.fillStyle = VISUAL.LINE_COLOR

    const top = this.camera.toScreen(PITCH.CENTER_X, PITCH.PENALTY_SPOT_TOP_Y)
    ctx.beginPath()
    ctx.arc(top.x, top.y, dotR, 0, Math.PI * 2)
    ctx.fill()

    const bot = this.camera.toScreen(PITCH.CENTER_X, PITCH.PENALTY_SPOT_BOTTOM_Y)
    ctx.beginPath()
    ctx.arc(bot.x, bot.y, dotR, 0, Math.PI * 2)
    ctx.fill()
  }
}
