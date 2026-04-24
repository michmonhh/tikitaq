/**
 * TIKITAQ — TS-Feature-Encoder für ONNX-Inferenz.
 *
 * Exakter 1:1-Spiegel von `ml/features.py`. Muss IMMER synchron gehalten
 * werden — wenn sich eine Feature-Dimension ändert, muss sie auf beiden
 * Seiten geändert werden, sonst liefert das Netz Unsinn.
 *
 * Die Produktions-Nutzung: von ONNX-Policy in der TS-Arena (onnxPolicy.ts)
 * und später für Browser-Inferenz (onnxruntime-web).
 */

import type { GameState, PlayerData, TeamSide } from '../../types'
import type { BallOption } from '../playerDecision/types'
import type { MatchIntent } from '../matchIntent'

// ── Konstanten (spiegeln Python) ──────────────────────────────

export const ROLE_LABELS = ['TW', 'IV', 'LV', 'RV', 'ZDM', 'LM', 'RM', 'OM', 'ST'] as const
export const OPTION_TYPES = [
  'shoot', 'short_pass', 'long_ball', 'through_ball',
  'cross', 'dribble', 'advance', 'hold',
] as const
export const INTENT_SIDES = ['left', 'center', 'right'] as const

export const PLAYER_FEAT_DIM = 13
export const GLOBAL_FEATURE_DIM = 3 + PLAYER_FEAT_DIM + 4 + 3 + 10 * PLAYER_FEAT_DIM + 11 * PLAYER_FEAT_DIM
export const OPTION_FEATURE_DIM = 8 + 2 + 1 + 1 + 1 + 2

// ── Einzel-Encoder ──────────────────────────────────────────

function roleOneHot(label: string): number[] {
  const out = new Array<number>(ROLE_LABELS.length).fill(0)
  const idx = (ROLE_LABELS as readonly string[]).indexOf(label)
  if (idx >= 0) out[idx] = 1
  return out
}

function optionTypeOneHot(t: string): number[] {
  const out = new Array<number>(OPTION_TYPES.length).fill(0)
  const idx = (OPTION_TYPES as readonly string[]).indexOf(t)
  if (idx >= 0) out[idx] = 1
  return out
}

function intentOneHot(side: 'left' | 'center' | 'right' | null): number[] {
  const out = new Array<number>(INTENT_SIDES.length).fill(0)
  const target = side ?? 'center'
  const idx = (INTENT_SIDES as readonly string[]).indexOf(target)
  if (idx >= 0) out[idx] = 1
  return out
}

function encodePlayer(p: PlayerData): number[] {
  return [
    p.position.x / 100,
    p.position.y / 100,
    ...roleOneHot(p.positionLabel),
    p.fitness / 100,
    p.confidence / 100,
  ]
}

function ghostPlayer(): number[] {
  return new Array<number>(PLAYER_FEAT_DIM).fill(0)
}

function encodeOption(opt: BallOption): number[] {
  const hasReceiver = opt.receiverId != null
  return [
    ...optionTypeOneHot(opt.type),
    opt.target.x / 100,
    opt.target.y / 100,
    opt.successChance,
    opt.reward,
    hasReceiver ? 1 : 0,
    hasReceiver ? opt.target.x / 100 : 0,
    hasReceiver ? opt.target.y / 100 : 0,
  ]
}

// ── Haupt-Encoder ───────────────────────────────────────────

export interface EncodedSample {
  /** Float32Array der Länge GLOBAL_FEATURE_DIM */
  globalFeat: Float32Array
  /** Float32Array der Länge maxOptions × OPTION_FEATURE_DIM */
  optionsFlat: Float32Array
  /** Float32Array der Länge maxOptions — 1 für valide, 0 für Padding */
  mask: Float32Array
  /** Wie viele valide Optionen existieren (< maxOptions) */
  numOptions: number
}

/**
 * Encodet einen GameState + Optionen in Tensor-fähige Float32Arrays,
 * bereit für onnxruntime-node Inferenz.
 */
export function encodeStateForPolicy(
  state: GameState,
  team: TeamSide,
  carrier: PlayerData,
  options: BallOption[],
  intent: MatchIntent | null,
  maxOptions: number = 16,
): EncodedSample {
  const ball = state.ball.position
  const carrierFeats = encodePlayer(carrier)

  const score = state.score
  const ownScore = team === 1 ? score.team1 : score.team2
  const oppScore = team === 1 ? score.team2 : score.team1
  const scoreDiff = (ownScore - oppScore) / 10

  const intentSide = intent?.attackSide ?? null
  const turnIdx = Math.floor(state.gameTime * 2)
  const intentTurnsValid = intent
    ? Math.max(0, intent.validUntilTurn - turnIdx) / 5
    : 0

  // Teammates & Opponents (ohne carrier)
  const allTeammates = state.players.filter(p => p.team === team && p.id !== carrier.id)
  const allOpponents = state.players.filter(p => p.team !== team)

  const teamFeats: number[] = []
  for (let i = 0; i < 10; i++) {
    teamFeats.push(...(i < allTeammates.length ? encodePlayer(allTeammates[i]) : ghostPlayer()))
  }

  const oppFeats: number[] = []
  for (let i = 0; i < 11; i++) {
    oppFeats.push(...(i < allOpponents.length ? encodePlayer(allOpponents[i]) : ghostPlayer()))
  }

  const globalVec = [
    ball.x / 100,
    ball.y / 100,
    1.0,  // possession indicator
    ...carrierFeats,
    scoreDiff,
    state.gameTime / 90,
    intentTurnsValid,
    team,
    ...intentOneHot(intentSide),
    ...teamFeats,
    ...oppFeats,
  ]

  if (globalVec.length !== GLOBAL_FEATURE_DIM) {
    throw new Error(
      `global dim mismatch: expected ${GLOBAL_FEATURE_DIM}, got ${globalVec.length}`,
    )
  }

  const globalFeat = new Float32Array(globalVec)

  // Options-Matrix (flach: maxOptions × OPTION_FEATURE_DIM)
  const optionsFlat = new Float32Array(maxOptions * OPTION_FEATURE_DIM)
  const mask = new Float32Array(maxOptions)
  const numOptions = Math.min(options.length, maxOptions)

  for (let i = 0; i < numOptions; i++) {
    const optFeats = encodeOption(options[i])
    for (let j = 0; j < OPTION_FEATURE_DIM; j++) {
      optionsFlat[i * OPTION_FEATURE_DIM + j] = optFeats[j]
    }
    mask[i] = 1
  }

  return { globalFeat, optionsFlat, mask, numOptions }
}
