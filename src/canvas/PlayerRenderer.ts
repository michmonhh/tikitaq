import { Camera } from './Camera'
import { VISUAL } from '../engine/constants'
import type { PlayerData, TeamSide } from '../engine/types'

export class PlayerRenderer {
  private camera: Camera

  constructor(camera: Camera) {
    this.camera = camera
  }

  draw(
    ctx: CanvasRenderingContext2D,
    players: PlayerData[],
    activePlayerId: string | null,
    dragPosition?: { x: number; y: number } | null,
    animatedPositions?: Map<string, { x: number; y: number }>,
    selectedPlayerId?: string | null,
    localTeam?: TeamSide | null,
    currentTurn?: TeamSide | null,
    isSetupPhase?: boolean
  ) {
    const sorted = [...players].sort((a, b) => {
      if (a.id === activePlayerId) return 1
      if (b.id === activePlayerId) return -1
      return a.position.y - b.position.y
    })

    // When it's the opponent's turn, dim the local team's players — but NOT during
    // set piece phases (kickoff / free_kick / corner / throw_in), where the user
    // may still reposition defenders even when the opponent is the taker.
    const isOpponentTurn = !isSetupPhase && localTeam != null && currentTurn != null && currentTurn !== localTeam

    for (const player of sorted) {
      const isActive = player.id === activePlayerId
      const isSelected = player.id === selectedPlayerId
      const animPos = animatedPositions?.get(player.id) ?? null
      const drawPos = isActive && dragPosition ? dragPosition : animPos
      const showFitness = localTeam ? player.team === localTeam : player.team === 1
      const isDimmed = isOpponentTurn && player.team === localTeam
      this.drawPlayer(ctx, player, isActive, drawPos, isSelected, showFitness, isDimmed)
    }
  }

  private drawPlayer(
    ctx: CanvasRenderingContext2D,
    player: PlayerData,
    isActive: boolean,
    overridePos?: { x: number; y: number } | null,
    isSelected?: boolean,
    showFitness?: boolean,
    isDimmed?: boolean
  ) {
    const gamePos = overridePos ?? player.position
    const pos = this.camera.toScreen(gamePos.x, gamePos.y)
    const baseR = VISUAL.PLAYER_RADIUS * this.camera.baseScale
    const r = isActive ? baseR * 1.25 : baseR

    ctx.save()

    // When dimmed (opponent's turn), reduce overall opacity
    if (isDimmed) {
      ctx.globalAlpha = 0.5
    }

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
      ctx.globalAlpha = isDimmed ? 0.3 : 0.45
      ctx.fillStyle = this.desaturate(color)
    } else {
      if (isDimmed) ctx.globalAlpha = 0.5
      ctx.fillStyle = color
    }

    ctx.fill()

    // Border
    const highlighted = isActive || isSelected
    ctx.strokeStyle = highlighted ? '#ffffff' : 'rgba(0,0,0,0.3)'
    ctx.lineWidth = highlighted ? 2.5 : 1.5
    ctx.stroke()

    // Selected/Active glow
    if (highlighted) {
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, r + 4, 0, Math.PI * 2)
      ctx.strokeStyle = isSelected ? 'rgba(0, 200, 83, 0.6)' : 'rgba(255, 255, 255, 0.5)'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // Cannot-tackle marker: gestrichelter oranger Ring, wenn der Spieler in diesem
    // Gegnerzug nach Ballverlust keinen Zweikampf führen darf.
    if (player.cannotTackle && !highlighted) {
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, r + 3, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255, 140, 0, 0.9)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([3, 3])
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Position label
    ctx.globalAlpha = isDimmed ? 0.5 : 1
    const fontSize = Math.max(8, r * 0.7)
    ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = player.team === 1 ? '#1a1a1a' : '#ffffff'
    ctx.fillText(player.positionLabel, pos.x, pos.y)

    // Selected: show name below disc
    if (isSelected) {
      const nameSize = Math.max(9, 11 * this.camera.baseScale)
      ctx.font = `600 ${nameSize}px system-ui, -apple-system, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'
      ctx.lineWidth = 3
      const name = player.lastName || player.positionLabel
      ctx.strokeText(name, pos.x, pos.y + r + 4)
      ctx.fillText(name, pos.x, pos.y + r + 4)
    }

    // Fitness bar above the player (own team only)
    if (showFitness && player.fitness < 100) {
      const barW = r * 1.6
      const barH = Math.max(2, 3 * this.camera.baseScale)
      const barX = pos.x - barW / 2
      const barY = pos.y - r - barH - 3

      // Background
      ctx.globalAlpha = 0.5
      ctx.fillStyle = '#333333'
      ctx.fillRect(barX, barY, barW, barH)

      // Fill
      ctx.globalAlpha = 0.9
      const pct = Math.max(0, Math.min(100, player.fitness)) / 100
      const barColor = pct > 0.6 ? '#4caf50' : pct > 0.3 ? '#ffc107' : '#f44336'
      ctx.fillStyle = barColor
      ctx.fillRect(barX, barY, barW * pct, barH)

      ctx.globalAlpha = 1
    }

    ctx.restore()
  }

  private team1Color: string = VISUAL.TEAM1_COLOR
  private team2Color: string = VISUAL.TEAM2_COLOR

  setTeamColors(team1Color: string, team2Color: string) {
    this.team1Color = team1Color
    this.team2Color = team2Color
  }

  private getColor(team: TeamSide): string {
    return team === 1 ? this.team1Color : this.team2Color
  }

  private desaturate(hex: string): string {
    // Simple desaturation by blending with gray
    return hex + '88' // Add alpha for faded effect
  }
}
