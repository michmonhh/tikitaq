import { useRef, useEffect, useCallback } from 'react'

/**
 * Hook to manage a canvas element with automatic resize handling.
 * Returns a ref for the canvas and the current dimensions.
 */
export function useCanvas(onResize?: (width: number, height: number) => void) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleResize = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const rect = container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1

    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`

    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(dpr, dpr)
    }

    onResize?.(rect.width, rect.height)
  }, [onResize])

  useEffect(() => {
    handleResize()

    const observer = new ResizeObserver(handleResize)
    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    return () => observer.disconnect()
  }, [handleResize])

  return { canvasRef, containerRef }
}
