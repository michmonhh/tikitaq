import type { Camera } from '../../canvas/Camera'
import type { Position } from '../../engine/types'

/**
 * Draws a "RISK: XX%" pill above a point on the pitch.
 * Used for pass risk (lane blocked → suffix ⬆) and dribble risk.
 *
 * Color coding:
 *   ≤20 %  green   (#4caf50)
 *   ≤50 %  yellow  (#ffc107)
 *   >50 %  red     (#f44336)
 */
export function drawRiskLabel(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  gamePos: Position,
  riskPct: number,
  suffix = '',
) {
  const screenPos = camera.toScreen(gamePos.x, gamePos.y)
  const fontSize = Math.max(11, 14 * camera.baseScale)

  ctx.save()
  ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'

  const color = riskPct <= 20 ? '#4caf50' : riskPct <= 50 ? '#ffc107' : '#f44336'

  const text = `RISK: ${riskPct}%${suffix}`
  const metrics = ctx.measureText(text)
  const pad = 3
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
  ctx.beginPath()
  ctx.roundRect(
    screenPos.x - metrics.width / 2 - pad,
    screenPos.y - fontSize - pad * 2 - 12,
    metrics.width + pad * 2,
    fontSize + pad * 2,
    3,
  )
  ctx.fill()

  ctx.fillStyle = color
  ctx.fillText(text, screenPos.x, screenPos.y - 14)
  ctx.restore()
}
