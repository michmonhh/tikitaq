import { Camera } from './Camera'
import { VISUAL } from '../engine/constants'
import type { PlayerData, TeamSide } from '../engine/types'

export class PlayerRenderer {
  private camera: Camera

  constructor(camera: Camera) {
    this.camera = camera
  }

  draw(ctx: CanvasRenderingContext2D, players: PlayerData[], activePlayerId: string | null) {
    // Draw non-active players first, then active on top
    const sorted = [...players].sort((a, b) => {
      if (a.id === activePlayerId) return 1
      if (b.id === activePlayerId) return -1
      return a.position.y - b.position.y // Back-to-front for depth
    })

    for (const player of sorted) {
      this.drawPlayer(ctx, player, player.id === activePlayerId)
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, player: PlayerData, isActive: boolean) {
    const pos = this.camera.toScreen(player.position.x, player.position.y)
    const baseR = VISUAL.PLAYER_RADIUS * this.camera.scale
    const r = isActive ? baseR * 1.25 : baseR

    ctx.save()

    // Shadow
    ctx.beginPath()
    ctx.ellipse(pos.x, pos.y + r * 0.3, r * 0.8, r * 0.25, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'
    ctx.fill()

    // Disc
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2)

    const color = this.getColor(player.team)
    if (player.hasActed) {
      ctx.globalAlpha = 0.45
      ctx.fillStyle = this.desaturate(color)
    } else {
      ctx.fillStyle = color
    }

    ctx.fill()

    // Border
    ctx.strokeStyle = isActive ? '#ffffff' : 'rgba(0,0,0,0.3)'
    ctx.lineWidth = isActive ? 2.5 : 1.5
    ctx.stroke()

    // Active glow
    if (isActive) {
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, r + 4, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // Position label
    ctx.globalAlpha = 1
    const fontSize = Math.max(8, r * 0.7)
    ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = player.team === 1 ? '#1a1a1a' : '#ffffff'
    ctx.fillText(player.positionLabel, pos.x, pos.y)

    ctx.restore()
  }

  private getColor(team: TeamSide): string {
    return team === 1 ? VISUAL.TEAM1_COLOR : VISUAL.TEAM2_COLOR
  }

  private desaturate(hex: string): string {
    // Simple desaturation by blending with gray
    return hex + '88' // Add alpha for faded effect
  }
}
