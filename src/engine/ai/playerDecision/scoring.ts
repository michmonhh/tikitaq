import type { TeamSide } from '../../types'
import type { TeamPlan, MatchMemory, FieldReading, AttackStrategy } from '../types'
import { PATTERNS } from '../types'
import { getTrend } from '../memory'
import type { BallOption, BallOptionType } from './types'

const STRATEGY_BONUS: Record<AttackStrategy, Partial<Record<BallOptionType, number>>> = {
  possession:  { short_pass: 10, long_ball: -5,  through_ball: 12, cross: 0,   dribble: 0,  advance: 8,  hold: 3 },
  counter:     { short_pass: -5, long_ball: 5,   through_ball: 18, cross: 5,   dribble: -5, advance: 12, hold: -10 },
  wing_play:   { short_pass: 0,  long_ball: 0,   through_ball: 8,  cross: 20,  dribble: 10, advance: 5,  hold: -5 },
  switch_play: { short_pass: 5,  long_ball: 10,  through_ball: 5,  cross: 0,   dribble: 0,  advance: 0,  hold: 0 },
  direct:      { short_pass: -10,long_ball: 15,  through_ball: 10, cross: 10,  dribble: -5, advance: 8,  hold: -10 },
}

export function getStrategyBonus(opt: BallOption, plan: TeamPlan): number {
  return STRATEGY_BONUS[plan.strategy.attack]?.[opt.type] ?? 0
}

export function getFieldBonus(
  opt: BallOption,
  field: FieldReading,
  team: TeamSide,
): number {
  let bonus = 0
  const isPass = ['short_pass', 'long_ball', 'through_ball', 'cross'].includes(opt.type)

  // Schwache Seite → Pässe dorthin belohnen
  if (isPass) {
    if (field.weakSide === 'left' && opt.target.x < 40) bonus += 8
    if (field.weakSide === 'right' && opt.target.x > 60) bonus += 8
  }

  // Zentrale Verdichtung → zentrale Pässe bestrafen
  if (isPass && opt.target.x > 30 && opt.target.x < 70) {
    bonus -= field.centralCongestion * 10
  }

  // Gegner steht hoch → Steilpässe belohnen
  if (opt.type === 'through_ball' && field.opponentHighLine) bonus += 10

  // Große Lücke zwischen den Linien → Pässe in die Lücke
  if (field.gapBetweenLines > 20 && isPass) {
    const inGap = team === 1
      ? opt.target.y > 30 && opt.target.y < 60
      : opt.target.y > 40 && opt.target.y < 70
    if (inGap) bonus += 8
  }

  // Gegner kompakt → Seitenwechsel / Flanken belohnen
  if (field.opponentCompact) {
    if (opt.type === 'long_ball' || opt.type === 'cross') bonus += 5
  }

  return bonus
}

export function getMemoryBonus(opt: BallOption, memory: MatchMemory): number {
  let bonus = 0

  // Option-Typ → Memory-Muster
  const typePattern: Partial<Record<BallOptionType, string>> = {
    short_pass: PATTERNS.PASS_SHORT,
    long_ball: PATTERNS.PASS_LONG,
    through_ball: PATTERNS.THROUGH_BALL,
    cross: PATTERNS.CROSS,
  }
  const pat = typePattern[opt.type]
  if (pat) bonus += getTrend(memory, pat) * 10

  // Richtungs-Trend
  if (opt.target.x < 40) bonus += getTrend(memory, PATTERNS.PASS_LEFT) * 5
  else if (opt.target.x > 60) bonus += getTrend(memory, PATTERNS.PASS_RIGHT) * 5
  else bonus += getTrend(memory, PATTERNS.PASS_CENTER) * 5

  return bonus
}
