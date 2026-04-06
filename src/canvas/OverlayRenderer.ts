import { Camera } from './Camera'
import { VISUAL } from '../engine/constants'
import type { PlayerData, TeamSide, GameState } from '../engine/types'
import { getMovementRadius, getPassRadius, getTackleRadius, getInterceptRadius } from '../engine/geometry'
import { getOffsideLine } from '../engine/passing'

export type DragMode = 'move' | 'pass' | null

export class OverlayRenderer {
  private camera: Camera

  constructor(camera: Camera) {
    this.camera = camera
  }

  drawMovementRange(ctx: CanvasRenderingContext2D, player: PlayerData) {
    const radius = getMovementRadius(player)
    const origin = this.camera.toScreen(player.origin.x, player.origin.y)
    const screenR = this.camera.toScreenDistance(radius)

    ctx.save()
    ctx.beginPath()
    ctx.arc(origin.x, origin.y, screenR, 0, Math.PI * 2)
    ctx.fillStyle = VISUAL.MOVEMENT_RANGE_COLOR
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([5, 5])
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }

  drawPassRange(ctx: CanvasRenderingContext2D, player: PlayerData) {
    const radius = getPassRadius(player)
    const pos = this.camera.toScreen(player.position.x, player.position.y)
    const screenR = this.camera.toScreenDistance(radius)

    ctx.save()
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, screenR, 0, Math.PI * 2)
    ctx.fillStyle = VISUAL.PASS_RANGE_COLOR
    ctx.fill()
    ctx.strokeStyle = 'rgba(0, 200, 80, 0.5)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([5, 5])
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }

  drawTackleRanges(ctx: CanvasRenderingContext2D, opponents: PlayerData[]) {
    ctx.save()
    for (const opp of opponents) {
      const radius = getTackleRadius(opp)
      const pos = this.camera.toScreen(opp.position.x, opp.position.y)
      const screenR = this.camera.toScreenDistance(radius)

      ctx.beginPath()
      ctx.arc(pos.x, pos.y, screenR, 0, Math.PI * 2)
      ctx.fillStyle = VISUAL.TACKLE_RANGE_COLOR
      ctx.fill()
      ctx.strokeStyle = 'rgba(255, 50, 50, 0.5)'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.stroke()
    }
    ctx.setLineDash([])
    ctx.restore()
  }

  drawInterceptRanges(ctx: CanvasRenderingContext2D, opponents: PlayerData[]) {
    ctx.save()
    ctx.globalAlpha = 0.2
    for (const opp of opponents) {
      const radius = getInterceptRadius(opp)
      const pos = this.camera.toScreen(opp.position.x, opp.position.y)
      const screenR = this.camera.toScreenDistance(radius)

      ctx.beginPath()
      ctx.arc(pos.x, pos.y, screenR, 0, Math.PI * 2)
      ctx.strokeStyle = '#ff8800'
      ctx.lineWidth = 1
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    ctx.restore()
  }

  drawOffsideLine(ctx: CanvasRenderingContext2D, state: GameState) {
    const attackingTeam = state.currentTurn
    const defendingTeam: TeamSide = attackingTeam === 1 ? 2 : 1
    const offsideY = getOffsideLine(state.players, defendingTeam)

    const left = this.camera.toScreen(0, offsideY)
    const right = this.camera.toScreen(100, offsideY)

    ctx.save()
    ctx.beginPath()
    ctx.moveTo(left.x, left.y)
    ctx.lineTo(right.x, right.y)
    ctx.strokeStyle = VISUAL.OFFSIDE_LINE_COLOR
    ctx.lineWidth = 1.5
    ctx.setLineDash([8, 4])
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }

  drawPassLine(
    ctx: CanvasRenderingContext2D,
    from: { x: number; y: number },
    to: { x: number; y: number }
  ) {
    const screenFrom = this.camera.toScreen(from.x, from.y)
    const screenTo = this.camera.toScreen(to.x, to.y)

    ctx.save()
    ctx.beginPath()
    ctx.moveTo(screenFrom.x, screenFrom.y)
    ctx.lineTo(screenTo.x, screenTo.y)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.stroke()
    ctx.setLineDash([])

    // Arrow head
    const angle = Math.atan2(screenTo.y - screenFrom.y, screenTo.x - screenFrom.x)
    const headLen = 10
    ctx.beginPath()
    ctx.moveTo(screenTo.x, screenTo.y)
    ctx.lineTo(
      screenTo.x - headLen * Math.cos(angle - 0.4),
      screenTo.y - headLen * Math.sin(angle - 0.4)
    )
    ctx.moveTo(screenTo.x, screenTo.y)
    ctx.lineTo(
      screenTo.x - headLen * Math.cos(angle + 0.4),
      screenTo.y - headLen * Math.sin(angle + 0.4)
    )
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'
    ctx.stroke()

    ctx.restore()
  }

  drawEventMessage(ctx: CanvasRenderingContext2D, message: string, position: { x: number; y: number }) {
    const pos = this.camera.toScreen(position.x, position.y)

    ctx.save()
    const fontSize = Math.max(12, 16 * this.camera.scale)
    ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'

    // Background
    const metrics = ctx.measureText(message)
    const pad = 6
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
    ctx.beginPath()
    ctx.roundRect(
      pos.x - metrics.width / 2 - pad,
      pos.y - fontSize - pad * 2,
      metrics.width + pad * 2,
      fontSize + pad * 2,
      4
    )
    ctx.fill()

    ctx.fillStyle = '#ffffff'
    ctx.fillText(message, pos.x, pos.y - pad)
    ctx.restore()
  }
}
