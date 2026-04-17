import { Camera } from './Camera'
import { VISUAL } from '../engine/constants'
import type { PlayerData, TeamSide, GameState } from '../engine/types'
import { getMovementRadius, getPassRadius, getTackleRadius, getInterceptRadius, distance } from '../engine/geometry'
import { getOffsideLine } from '../engine/passing'
import { calculateTackleWinChance } from '../engine/movement'

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

  drawOpponentMovementRanges(ctx: CanvasRenderingContext2D, opponents: PlayerData[]) {
    ctx.save()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
    ctx.lineWidth = 1
    for (const opp of opponents) {
      const radius = getMovementRadius(opp)
      const origin = this.camera.toScreen(opp.origin.x, opp.origin.y)
      const screenR = this.camera.toScreenDistance(radius)
      ctx.beginPath()
      ctx.arc(origin.x, origin.y, screenR, 0, Math.PI * 2)
      ctx.stroke()
    }
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

  /**
   * Draw a dribbling heatmap showing how likely the player is to beat
   * each opponent at various positions within movement range.
   * Green = safe to dribble, Red = high risk of losing the ball.
   */
  drawDribblingHeatmap(ctx: CanvasRenderingContext2D, player: PlayerData, opponents: PlayerData[]) {
    const radius = getMovementRadius(player)
    const origin = this.camera.toScreen(player.origin.x, player.origin.y)
    const screenR = this.camera.toScreenDistance(radius)

    // Higher resolution grid for smoother appearance
    const steps = 22
    const cellSize = (screenR * 2) / steps
    const heatmapSize = Math.ceil(screenR * 2) + 2

    // Render heatmap to offscreen canvas for blur
    const offCanvas = document.createElement('canvas')
    offCanvas.width = heatmapSize
    offCanvas.height = heatmapSize
    const offCtx = offCanvas.getContext('2d')
    if (!offCtx) return

    const cx = heatmapSize / 2
    const cy = heatmapSize / 2

    for (let gx = 0; gx < steps; gx++) {
      for (let gy = 0; gy < steps; gy++) {
        const lx = -screenR + gx * cellSize + cellSize / 2
        const ly = -screenR + gy * cellSize + cellSize / 2

        // Inside circle check
        if (lx * lx + ly * ly > screenR * screenR) continue

        // Game coords for this cell
        const gamePos = this.camera.toGame(origin.x + lx, origin.y + ly)

        // Engine-konsistente Risiko-Berechnung: kumuliert über alle Gegner
        let survivalChance = 1
        for (const opp of opponents) {
          const oppRadius = getTackleRadius(opp)
          const dist = distance(gamePos, opp.position)
          if (dist <= oppRadius) {
            // Voll im Radius → voller Zweikampf
            survivalChance *= (1 - calculateTackleWinChance(opp, player))
          } else if (dist <= oppRadius * 1.5) {
            // Übergangszone: sanfter Gradient zum Rand
            const blend = (dist - oppRadius) / (oppRadius * 0.5)
            const partialRisk = calculateTackleWinChance(opp, player) * (1 - blend)
            survivalChance *= (1 - partialRisk)
          }
        }

        const safety = survivalChance
        const r = Math.round(255 * (1 - safety))
        const g = Math.round(255 * safety * 0.7)
        offCtx.fillStyle = `rgba(${r}, ${g}, 30, 0.45)`
        offCtx.fillRect(cx + lx - cellSize / 2, cy + ly - cellSize / 2, cellSize, cellSize)
      }
    }

    // Draw blurred heatmap onto main canvas, clipped to movement circle
    ctx.save()
    ctx.beginPath()
    ctx.arc(origin.x, origin.y, screenR, 0, Math.PI * 2)
    ctx.clip()
    ctx.filter = 'blur(6px)'
    ctx.drawImage(offCanvas, origin.x - cx, origin.y - cy)
    ctx.filter = 'none'
    ctx.restore()

    // Movement range border
    ctx.save()
    ctx.beginPath()
    ctx.arc(origin.x, origin.y, screenR, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])
    ctx.stroke()
    ctx.setLineDash([])
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
    const fontSize = Math.max(12, 16 * this.camera.baseScale)
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
