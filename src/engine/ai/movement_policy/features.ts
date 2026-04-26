/**
 * Feature-Encoder für Off-Ball Movement-Policy.
 *
 * Spiegel zur Carrier-Policy in src/engine/ai/policy/features.ts, aber
 * auf den Off-Ball-Kontext zugeschnitten:
 *
 * - Per-Player-Observation (kein Match-übergreifender State)
 * - Carrier-Info als zentrales Feature
 * - Coach-Output (Strategy / Intent) als Conditioning-Input
 * - Optionen-Features (mit Type one-hot + target + score)
 *
 * Muss 1:1 mit ml/movement_features.py synchron bleiben.
 */

import type { GameState, PlayerData, TeamSide } from '../../types'
import type { TeamPlan } from '../types'
import type {
  DefenseStrategy, AttackStrategy, TransitionBehavior,
} from '../types'
import type { MatchIntent } from '../matchIntent'
import type { MovementOption, MovementOptionType } from './types'

// ── Konstanten (spiegeln Python movement_features.py) ────────────

export const ROLE_LABELS = ['TW', 'IV', 'LV', 'RV', 'ZDM', 'ZM', 'LM', 'RM', 'OM', 'ST'] as const

export const DEFENSE_STRATEGIES: DefenseStrategy[] =
  ['high_press', 'mid_press', 'deep_block', 'man_marking', 'catenaccio']

export const ATTACK_STRATEGIES: AttackStrategy[] =
  ['possession', 'counter', 'wing_play', 'switch_play', 'direct']

export const TRANSITION_BEHAVIORS: TransitionBehavior[] =
  ['gegenpress', 'fall_back']

export const INTENT_SIDES = ['left', 'center', 'right'] as const

export const MOVEMENT_OPTION_TYPES: MovementOptionType[] = [
  'defensive_position',
  'offensive_position',
  'press_carrier',
  'block_pass_lane',
  'man_marking',
  'cover_counter',
  'overlap_run',
  'cut_inside',
  'support_carrier',
  'stay',
]

// Player-Feature pro Spieler-Slot:
//   2 (pos) + 10 (role one-hot) + 8 (stats norm) + 1 (fitness) + 1 (confidence) = 22
const PLAYER_FEAT_DIM = 2 + ROLE_LABELS.length + 8 + 1 + 1

// Coach-Output:
//   5 (defense one-hot) + 5 (attack one-hot) + 2 (transition one-hot)
//   + 3 (intent side one-hot) + 1 (intent turns valid) + 1 (riskAppetite)
//   + 1 (selfImage) + 1 (confidence)
const COACH_FEAT_DIM = 5 + 5 + 2 + 3 + 1 + 1 + 1 + 1

// Globale Match-Features:
//   3 (ball xy + has_owner) + 1 (ball owner is own team)
//   + 4 (score_diff, game_time, team_ind, mustDecide)
const GLOBAL_FEAT_DIM = 3 + 1 + 4

// Total per-Player observation:
//   PLAYER_FEAT_DIM (self)
//   + PLAYER_FEAT_DIM (carrier — leer wenn ballLoose)
//   + 5 * PLAYER_FEAT_DIM (5 nächste Mitspieler)
//   + 5 * PLAYER_FEAT_DIM (5 nächste Gegner)
//   + COACH_FEAT_DIM
//   + GLOBAL_FEAT_DIM
export const MOVEMENT_GLOBAL_DIM =
  PLAYER_FEAT_DIM           // self
  + PLAYER_FEAT_DIM         // carrier (oder ghost)
  + 5 * PLAYER_FEAT_DIM     // nearest mates
  + 5 * PLAYER_FEAT_DIM     // nearest opponents
  + COACH_FEAT_DIM
  + GLOBAL_FEAT_DIM

// Option-Feature:
//   10 (type one-hot)
//   + 2 (target xy)
//   + 1 (heuristik score)
//   + 2 (relative target offset from player.pos)
//   + 1 (target is in own half)
export const MOVEMENT_OPTION_DIM = MOVEMENT_OPTION_TYPES.length + 2 + 1 + 2 + 1

export const MOVEMENT_MAX_OPTIONS = 10

// ── Encoder-Helpers ───────────────────────────────────────────

function oneHot<T extends string>(value: T | undefined | null, vocab: readonly T[]): number[] {
  const out = new Array(vocab.length).fill(0)
  if (value != null) {
    const idx = vocab.indexOf(value as T)
    if (idx >= 0) out[idx] = 1
  }
  return out
}

function encodePlayer(p: PlayerData | null): number[] {
  if (!p) return new Array(PLAYER_FEAT_DIM).fill(0)
  return [
    p.position.x / 100,
    p.position.y / 100,
    ...oneHot(p.positionLabel as typeof ROLE_LABELS[number], ROLE_LABELS),
    p.stats.pacing / 100,
    p.stats.finishing / 100,
    p.stats.shortPassing / 100,
    p.stats.highPassing / 100,
    p.stats.tackling / 100,
    p.stats.defensiveRadius / 100,
    p.stats.ballShielding / 100,
    p.stats.dribbling / 100,
    p.fitness / 100,
    p.confidence / 100,
  ]
}

function encodeCoach(plan: TeamPlan | null, intent: MatchIntent | null, currentTurn: number): number[] {
  const def = plan?.strategy.defense ?? null
  const atk = plan?.strategy.attack ?? null
  const tr = plan?.strategy.transition ?? null
  const intentSide = intent?.attackSide ?? null
  const intentTurnsValid = intent
    ? Math.max(0, intent.validUntilTurn - currentTurn) / 5
    : 0
  const risk = plan?.riskAppetite ?? 0.5
  const selfImage = (plan?.identity.selfImage ?? 50) / 100
  const conf = (plan?.identity.confidence ?? 50) / 100
  return [
    ...oneHot(def, DEFENSE_STRATEGIES),
    ...oneHot(atk, ATTACK_STRATEGIES),
    ...oneHot(tr, TRANSITION_BEHAVIORS),
    ...oneHot(intentSide, INTENT_SIDES),
    intentTurnsValid,
    risk,
    selfImage,
    conf,
  ]
}

function pickNearest(target: PlayerData, candidates: PlayerData[], n: number): PlayerData[] {
  return candidates
    .map(c => ({ p: c, d: dist(c.position, target.position) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map(x => x.p)
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

// ── Haupt-Encoder ───────────────────────────────────────────

export interface MovementEncodedSample {
  globalFeat: Float32Array
  optionsFlat: Float32Array
  mask: Float32Array
  numOptions: number
}

export function encodeMovementState(
  state: GameState,
  team: TeamSide,
  player: PlayerData,
  options: MovementOption[],
  plan: TeamPlan | null,
  intent: MatchIntent | null,
): MovementEncodedSample {
  const currentTurn = Math.floor(state.gameTime * 2)

  // Self
  const selfFeats = encodePlayer(player)

  // Carrier
  const carrier = state.players.find(p => p.id === state.ball.ownerId) ?? null
  const carrierFeats = encodePlayer(carrier)

  // Nearest 5 mates (ohne self)
  const allMates = state.players.filter(p =>
    p.team === team && p.id !== player.id && p.positionLabel !== 'TW',
  )
  const nearestMates = pickNearest(player, allMates, 5)
  const matesFeats: number[] = []
  for (let i = 0; i < 5; i++) {
    matesFeats.push(...encodePlayer(i < nearestMates.length ? nearestMates[i] : null))
  }

  // Nearest 5 opponents (ohne TW)
  const allOpps = state.players.filter(p =>
    p.team !== team && p.positionLabel !== 'TW',
  )
  const nearestOpps = pickNearest(player, allOpps, 5)
  const oppsFeats: number[] = []
  for (let i = 0; i < 5; i++) {
    oppsFeats.push(...encodePlayer(i < nearestOpps.length ? nearestOpps[i] : null))
  }

  // Coach + global
  const coachFeats = encodeCoach(plan, intent, currentTurn)
  const ownerTeam = carrier?.team
  const ownerIsOwn = ownerTeam === team ? 1 : 0
  const score = state.score
  const ownScore = team === 1 ? score.team1 : score.team2
  const oppScore = team === 1 ? score.team2 : score.team1
  const scoreDiff = (ownScore - oppScore) / 10

  const globalFeats = [
    state.ball.position.x / 100,
    state.ball.position.y / 100,
    state.ball.ownerId ? 1 : 0,
    ownerIsOwn,
    scoreDiff,
    state.gameTime / 90,
    team,
    state.mustDecide ? 1 : 0,
  ]

  const allFeats = [
    ...selfFeats,
    ...carrierFeats,
    ...matesFeats,
    ...oppsFeats,
    ...coachFeats,
    ...globalFeats,
  ]

  if (allFeats.length !== MOVEMENT_GLOBAL_DIM) {
    throw new Error(
      `Movement-Encoder dim mismatch: expected ${MOVEMENT_GLOBAL_DIM}, got ${allFeats.length}`,
    )
  }

  const globalFeat = new Float32Array(allFeats)

  // Options encoding
  const numOpts = Math.min(options.length, MOVEMENT_MAX_OPTIONS)
  const optionsFlat = new Float32Array(MOVEMENT_MAX_OPTIONS * MOVEMENT_OPTION_DIM)
  const mask = new Float32Array(MOVEMENT_MAX_OPTIONS)

  for (let i = 0; i < numOpts; i++) {
    const opt = options[i]
    const offsetX = (opt.target.x - player.position.x) / 50  // -1..+1 typisch
    const offsetY = (opt.target.y - player.position.y) / 50
    const ownGoalY = team === 1 ? 100 : 0
    const inOwnHalf = team === 1
      ? opt.target.y > 50
      : opt.target.y < 50
    const optFeats = [
      ...oneHot(opt.type, MOVEMENT_OPTION_TYPES),
      opt.target.x / 100,
      opt.target.y / 100,
      opt.score,
      offsetX,
      offsetY,
      inOwnHalf ? 1 : 0,
    ]
    for (let j = 0; j < MOVEMENT_OPTION_DIM; j++) {
      optionsFlat[i * MOVEMENT_OPTION_DIM + j] = optFeats[j]
    }
    mask[i] = 1
    void ownGoalY  // reserved for future shaping
  }

  return { globalFeat, optionsFlat, mask, numOptions: numOpts }
}
