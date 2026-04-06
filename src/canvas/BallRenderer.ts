import { Camera } from './Camera'
import { VISUAL } from '../engine/constants'
import type { BallData } from '../engine/types'

export class BallRenderer {
  private camera: Camera

  constructor(camera: Camera) {
    this.camera = camera
  }

  draw(ctx: CanvasRenderingContext2D, ball: BallData, isDragging: boolean, dragPos?: { x: number; y: number }) {
    const gamePos = isDragging && dragPos ? dragPos : ball.position
    const pos = this.camera.toScreen(gamePos.x, gamePos.y)
    const r = VISUAL.BALL_RADIUS * this.camera.scale

    ctx.save()

    // Shadow
    ctx.beginPath()
    ctx.ellipse(pos.x + 1, pos.y + r * 0.4, r * 0.7, r * 0.2, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    ctx.fill()

    // Ball body
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2)
    const grad = ctx.createRadialGradient(pos.x - r * 0.3, pos.y - r * 0.3, 0, pos.x, pos.y, r)
    grad.addColorStop(0, '#ffffff')
    grad.addColorStop(1, '#cccccc')
    ctx.fillStyle = grad
    ctx.fill()
    ctx.strokeStyle = '#999999'
    ctx.lineWidth = 1
    ctx.stroke()

    // Pentagon pattern (simplified)
    ctx.fillStyle = '#333333'
    const pentR = r * 0.35
    for (let i = 0; i < 5; i++) {
      const angle = (i * Math.PI * 2) / 5 - Math.PI / 2
      const px = pos.x + Math.cos(angle) * r * 0.45
      const py = pos.y + Math.sin(angle) * r * 0.45
      ctx.beginPath()
      ctx.arc(px, py, pentR * 0.4, 0, Math.PI * 2)
      ctx.fill()
    }

    // Dragging indicator
    if (isDragging) {
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, r + 3, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'
      ctx.lineWidth = 2
      ctx.setLineDash([3, 3])
      ctx.stroke()
      ctx.setLineDash([])
    }

    ctx.restore()
  }
}
