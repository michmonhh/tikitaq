import type { Position } from '../engine/types'

type EasingFn = (t: number) => number

interface Animation {
  id: string
  from: Position
  to: Position
  startTime: number
  duration: number
  easing: EasingFn
}

// ── Easing-Funktionen ──────────────────────────────────────────────

/** Linear (Standard für Spieler) */
const linear: EasingFn = t => t

/** Ease-out-quint: noch stärkeres Abbremsen (t⁵) */
const easeOutQuint: EasingFn = t => 1 - (1 - t) ** 5

// ── Ball-Animationsdauer nach Distanz ──────────────────────────────

const BALL_MIN_DURATION = 200   // ms — kurze Pässe
const BALL_MAX_DURATION = 1500  // ms — lange Pässe
const BALL_MAX_DISTANCE = 80    // Spieleinheiten — ab hier maximale Dauer

/** Berechnet die Animationsdauer für den Ball basierend auf Distanz */
function ballDuration(from: Position, to: Position): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const t = Math.min(1, dist / BALL_MAX_DISTANCE)
  return BALL_MIN_DURATION + t * (BALL_MAX_DURATION - BALL_MIN_DURATION)
}

// ── Animator ───────────────────────────────────────────────────────

const BALL_KEY = '__ball__'

/**
 * Manages smooth position animations for player discs and the ball.
 * Singleton instance shared between store and renderer.
 */
class Animator {
  private animations: Map<string, Animation> = new Map()
  /** Ball visuell an fester Position halten (aufgeschobene Animation) */
  private ballHold: Position | null = null

  /** Spieler-Animation (linear) */
  animate(playerId: string, from: Position, to: Position, durationMs: number = 300) {
    this.animations.set(playerId, {
      id: playerId,
      from: { ...from },
      to: { ...to },
      startTime: performance.now(),
      duration: durationMs,
      easing: linear,
    })
  }

  /** Ball visuell an einer Position festhalten (State ändert sich, aber Ball bleibt sichtbar hier) */
  holdBallAt(pos: Position) {
    this.ballHold = { ...pos }
  }

  /** Ball-Animation mit ease-out und distanzabhängiger Dauer. Hebt ballHold auf. */
  animateBall(from: Position, to: Position) {
    this.ballHold = null
    const duration = ballDuration(from, to)
    this.animations.set(BALL_KEY, {
      id: BALL_KEY,
      from: { ...from },
      to: { ...to },
      startTime: performance.now(),
      duration,
      easing: easeOutQuint,
    })
  }

  /** Aktuelle interpolierte Position (oder null wenn keine Animation) */
  getPosition(id: string): Position | null {
    const anim = this.animations.get(id)
    if (!anim) return null

    const elapsed = performance.now() - anim.startTime
    const rawT = Math.min(1, elapsed / anim.duration)

    if (rawT >= 1) {
      this.animations.delete(id)
      return { ...anim.to }
    }

    const t = anim.easing(rawT)
    return {
      x: anim.from.x + (anim.to.x - anim.from.x) * t,
      y: anim.from.y + (anim.to.y - anim.from.y) * t,
    }
  }

  /** Ball-Position abfragen: Animation > Hold > null */
  getBallPosition(): Position | null {
    const animPos = this.getPosition(BALL_KEY)
    if (animPos) return animPos
    if (this.ballHold) return this.ballHold
    return null
  }

  /** Ist der Ball gerade in Animation? */
  isBallAnimating(): boolean {
    const anim = this.animations.get(BALL_KEY)
    if (!anim) return false
    return performance.now() - anim.startTime < anim.duration
  }

  isAnimating(): boolean {
    const now = performance.now()
    for (const [, anim] of this.animations) {
      if (now - anim.startTime < anim.duration) return true
    }
    // Clean finished
    this.animations.clear()
    return false
  }

  clear() {
    this.animations.clear()
    this.ballHold = null
  }
}

// Singleton — shared between store and render loop
export const animator = new Animator()
