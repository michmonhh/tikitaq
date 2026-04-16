import type { Camera } from '../../canvas/Camera'

/**
 * Draws a big centered event label (e.g. "TOR!", "ABSEITS") on the pitch.
 * Rendered at screen coordinates so it stays visible when zoomed/panned.
 */
export function drawOverlayLabel(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  label: string,
  color: string | null,
) {
  const centerScreen = { x: camera.width / 2, y: camera.height * 0.4 }
  const fontSize = Math.max(14, 18 * camera.baseScale)

  ctx.save()
  ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const metrics = ctx.measureText(label)
  const padX = 12, padY = 8
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
  ctx.beginPath()
  ctx.roundRect(
    centerScreen.x - metrics.width / 2 - padX,
    centerScreen.y - fontSize / 2 - padY,
    metrics.width + padX * 2,
    fontSize + padY * 2,
    8,
  )
  ctx.fill()

  ctx.fillStyle = color ?? '#ffffff'
  ctx.fillText(label, centerScreen.x, centerScreen.y)
  ctx.restore()
}
