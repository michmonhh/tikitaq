/**
 * TIKITAQ AI — Spielerentscheidung (Schicht 2)
 *
 * Bewertet alle Optionen des Ballführers:
 * Torschuss, Kurzpass, Langer Ball, Steilpass, Flanke,
 * Dribbeln, Vorrücken, Ball behaupten
 *
 * Kernformel:
 *   optionScore = reward × riskAppetite + successChance × (1 - riskAppetite)
 *
 * Plus Strategie-, Feld- und Memory-Bonusse.
 */

import type { GameState, TeamSide, PlayerAction, PlayerData, Position } from '../types'
import type { TeamPlan, MatchMemory, FieldReading, AttackStrategy } from './types'
import { PATTERNS } from './types'
import {
  getMovementRadius, distance, clampToRadius, clampToPitch,
  getPassRadius, pointToSegmentDistance, getTackleRadius,
} from '../geometry'
import { PITCH } from '../constants'
import { calculateShotAccuracy } from '../shooting'
import { isOffside, getOffsideLine } from '../passing'
import { calculateDribbleRisk } from '../movement'
import { getTrend } from './memory'

// ══════════════════════════════════════════
//  Typen
// ══════════════════════════════════════════

type BallOptionType =
  | 'shoot'
  | 'short_pass'
  | 'long_ball'
  | 'through_ball'
  | 'cross'
  | 'dribble'
  | 'advance'
  | 'hold'

interface BallOption {
  type: BallOptionType
  target: Position
  receiverId?: string
  successChance: number   // 0–1
  reward: number          // 0–1
  score: number           // Endscore nach allen Bonussen
  reason: string
}

// ══════════════════════════════════════════
//  Hauptfunktion
// ══════════════════════════════════════════

/**
 * Entscheidet was der Ballführer tut.
 * Gibt eine PlayerAction zurück, oder null wenn keine sinnvolle Option.
 */
export function decideBallAction(
  carrier: PlayerData,
  state: GameState,
  team: TeamSide,
  plan: TeamPlan | null,
  fieldReading: FieldReading | null,
  memory: MatchMemory | null,
  reasoning: Map<string, string>,
): PlayerAction | null {

  // ── Sonderfälle: Muss passen ──
  if (state.mustPass) {
    return chooseForcedPass(carrier, state, team, plan, fieldReading, reasoning, 'Anstoß — muss passen')
  }
  if (carrier.positionLabel === 'TW') {
    return chooseForcedPass(carrier, state, team, plan, fieldReading, reasoning, null)
  }

  // ── Alle Optionen generieren ──
  const options = generateOptions(carrier, state, team, plan, fieldReading)
  if (options.length === 0) return null

  // ── Bewerten ──
  const baseRisk = plan?.riskAppetite ?? 0.5
  const oppGoalY = team === 1 ? 0 : 100
  const distToGoal = Math.abs(carrier.position.y - oppGoalY)

  // Risikoeskalation: je näher am Tor, desto aggressiver
  const goalUrgency = distToGoal < 21 ? (21 - distToGoal) / 21 : 0  // 0–1
  const riskAppetite = Math.min(0.90, baseRisk + goalUrgency * 0.35)

  for (const opt of options) {
    // Kernformel: reward × risk + successChance × (1-risk)
    opt.score = (opt.reward * riskAppetite + opt.successChance * (1 - riskAppetite)) * 100
    // Bonusse
    if (plan) opt.score += getStrategyBonus(opt, plan)
    if (fieldReading) opt.score += getFieldBonus(opt, fieldReading, team)
    if (memory) opt.score += getMemoryBonus(opt, memory)

    // Schuss-Bonus: nah am Tor stark bevorzugen (40% näher als vorher)
    if (opt.type === 'shoot') {
      if (distToGoal < 12) opt.score += 25   // Nahdistanz → fast immer schießen
      else if (distToGoal < 18) opt.score += 12
    }

    // Steilpass-Bonus: gefährlichste Option belohnen
    if (opt.type === 'through_ball') opt.score += 8

    // Rauschen für Varianz
    opt.score += (Math.random() - 0.5) * 6  // ±3
  }

  // ── Beste Option wählen ──
  options.sort((a, b) => b.score - a.score)
  const best = options[0]

  reasoning.set(carrier.id, best.reason)
  return toAction(carrier, best)
}

// ══════════════════════════════════════════
//  Erzwungener Pass (Anstoß / Torwart)
// ══════════════════════════════════════════

function chooseForcedPass(
  carrier: PlayerData,
  state: GameState,
  team: TeamSide,
  plan: TeamPlan | null,
  fieldReading: FieldReading | null,
  reasoning: Map<string, string>,
  forcedReason: string | null,
): PlayerAction | null {
  const teammates = state.players.filter(p => p.team === team && p.id !== carrier.id)
  const opponents = state.players.filter(p => p.team !== team)
  const defTeam: TeamSide = team === 1 ? 2 : 1
  const oppGoalY = team === 1 ? 0 : 100

  // Nur Pass-Optionen generieren
  const options: BallOption[] = []
  for (const mate of teammates) {
    const opt = evaluatePass(carrier, mate, state, team, opponents, defTeam, oppGoalY)
    if (opt) options.push(opt)
  }
  if (options.length === 0) return null

  // Bewerten (mit Strategie-Kontext)
  const riskAppetite = plan?.riskAppetite ?? 0.5
  for (const opt of options) {
    opt.score = (opt.reward * riskAppetite + opt.successChance * (1 - riskAppetite)) * 100
    if (plan) opt.score += getStrategyBonus(opt, plan)
    if (fieldReading) opt.score += getFieldBonus(opt, fieldReading, team)
    opt.score += (Math.random() - 0.5) * 6
  }

  options.sort((a, b) => b.score - a.score)
  const best = options[0]

  // Reasoning
  const isGK = carrier.positionLabel === 'TW'
  if (forcedReason) {
    reasoning.set(carrier.id, forcedReason)
  } else if (isGK) {
    const label = getReceiverLabel(best, state)
    const desc = best.type === 'long_ball' ? 'Langer Abschlag' : 'Kurzer Abschlag'
    reasoning.set(carrier.id, `${desc} auf ${label}`)
  } else {
    reasoning.set(carrier.id, best.reason)
  }

  return toAction(carrier, best)
}

// ══════════════════════════════════════════
//  Optionen generieren
// ══════════════════════════════════════════

function generateOptions(
  carrier: PlayerData,
  state: GameState,
  team: TeamSide,
  plan: TeamPlan | null,
  fieldReading: FieldReading | null,
): BallOption[] {
  const options: BallOption[] = []
  const opponents = state.players.filter(p => p.team !== team)
  const teammates = state.players.filter(p => p.team === team && p.id !== carrier.id)
  const defTeam: TeamSide = team === 1 ? 2 : 1
  const oppGoalY = team === 1 ? 0 : 100

  // 1. Torschuss
  const shootOpt = evaluateShoot(carrier, team, oppGoalY)
  if (shootOpt) options.push(shootOpt)

  // 2. Pässe (nur wenn noch erlaubt)
  if (state.passesThisTurn < 2) {
    for (const mate of teammates) {
      const opt = evaluatePass(carrier, mate, state, team, opponents, defTeam, oppGoalY)
      if (opt) options.push(opt)
    }
    // Steilpass in den freien Raum (hinter die Abwehrkette)
    const tbSpace = evaluateThroughBallSpace(carrier, state, team, opponents, teammates, defTeam, oppGoalY)
    if (tbSpace) options.push(tbSpace)
  }

  // 3. Dribbeln
  options.push(...evaluateDribbleOptions(carrier, team, opponents, oppGoalY))

  // 4. Vorrücken
  const advOpt = evaluateAdvance(carrier, team, opponents, oppGoalY)
  if (advOpt) options.push(advOpt)

  // 5. Ball behaupten
  options.push(evaluateHold(carrier, team, opponents))

  return options
}

// ══════════════════════════════════════════
//  Einzelbewertungen
// ══════════════════════════════════════════

/** Torschuss */
function evaluateShoot(
  carrier: PlayerData,
  team: TeamSide,
  oppGoalY: number,
): BallOption | null {
  const distToGoal = Math.abs(carrier.position.y - oppGoalY)
  if (distToGoal > 24) return null

  const accuracy = calculateShotAccuracy(carrier, carrier.position, team)
  if (accuracy < 0.05) return null

  const tx = PITCH.CENTER_X + (Math.random() - 0.5) * 8
  return {
    type: 'shoot',
    target: { x: tx, y: oppGoalY },
    successChance: accuracy,
    reward: 1.0,
    score: 0,
    reason: `Torschuss (${Math.round(accuracy * 100)}%)`,
  }
}

/** Pass auf einen Mitspieler */
function evaluatePass(
  carrier: PlayerData,
  mate: PlayerData,
  state: GameState,
  team: TeamSide,
  opponents: PlayerData[],
  defTeam: TeamSide,
  oppGoalY: number,
): BallOption | null {
  const dist = distance(carrier.position, mate.position)
  const range = getPassRadius(carrier)
  if (dist > range || dist < 4) return null
  if (isOffside(mate, defTeam, state.players, carrier.position.y)) return null

  // Passtyp klassifizieren
  const passType = classifyPass(carrier, mate, team, defTeam, state, oppGoalY)

  // Erfolgswahrscheinlichkeit
  const stat = (passType === 'long_ball' || passType === 'cross')
    ? carrier.stats.highPassing
    : carrier.stats.shortPassing
  let successChance = passSuccessChance(stat, dist, opponents, carrier, mate)

  // Riskantere Passtypen (leichter Malus, nicht zu stark)
  if (passType === 'through_ball') successChance *= 0.85
  if (passType === 'cross') successChance *= 0.85

  // Reward basierend auf Empfänger-Position
  const progress = team === 1
    ? carrier.position.y - mate.position.y
    : mate.position.y - carrier.position.y
  const goalDist = Math.abs(mate.position.y - oppGoalY)

  // Ist der Empfänger frei? (kein Gegner in 12 Einheiten)
  const receiverIsFree = !opponents.some(o => distance(mate.position, o.position) < 12)

  let reward: number
  if (progress < 0) {
    // Rückpass: sicher aber wenig Ertrag
    reward = 0.10 + successChance * 0.08
  } else {
    reward = 0.35 + (progress / 50) * 0.35
    if (goalDist < 25) reward += 0.25        // Nah am Tor = großer Bonus
    if (goalDist < 15) reward += 0.15        // Im Strafraum = extra Bonus
    if (passType === 'through_ball') reward += 0.20
    if (passType === 'cross') reward += 0.15
    // Freier Empfänger mit Raumgewinn = große Chance
    if (receiverIsFree && progress > 10) reward += 0.20
  }
  reward = clamp(reward, 0.05, 1.0)

  // Target (Steilpass: in den Lauf)
  let target: Position = { ...mate.position }
  if (passType === 'through_ball') {
    const dir = team === 1 ? -1 : 1
    target = { x: mate.position.x, y: mate.position.y + dir * 2 }
  }

  const typeNames: Record<string, string> = {
    short_pass: 'Kurzpass', long_ball: 'Langer Ball',
    through_ball: 'Steilpass', cross: 'Flanke',
  }
  const label = `${mate.positionLabel} ${mate.lastName}`

  return {
    type: passType,
    target,
    receiverId: mate.id,
    successChance,
    reward,
    score: 0,
    reason: `${typeNames[passType]} auf ${label}`,
  }
}

/** Klassifiziert den Passtyp basierend auf Situation */
function classifyPass(
  carrier: PlayerData,
  mate: PlayerData,
  team: TeamSide,
  defTeam: TeamSide,
  state: GameState,
  oppGoalY: number,
): 'short_pass' | 'long_ball' | 'through_ball' | 'cross' {
  const dist = distance(carrier.position, mate.position)
  const offsideLine = getOffsideLine(state.players, defTeam)

  // Flanke: Passgeber auf dem Flügel, Empfänger zentral + tornah
  const passerWide = carrier.position.x < 25 || carrier.position.x > 75
  const receiverCentral = mate.position.x > 25 && mate.position.x < 75
  const receiverNearGoal = Math.abs(mate.position.y - oppGoalY) < 25
  if (passerWide && receiverCentral && receiverNearGoal) return 'cross'

  // Steilpass: Empfänger nahe Abwehrlinie, Raum dahinter
  const nearLine = team === 1
    ? mate.position.y < offsideLine + 8 && mate.position.y > offsideLine - 5
    : mate.position.y > offsideLine - 8 && mate.position.y < offsideLine + 5
  const spaceBehind = team === 1 ? offsideLine > 15 : offsideLine < 85
  if (nearLine && spaceBehind && dist < 35) return 'through_ball'

  // Langer Ball vs. Kurzpass
  if (dist > 25) return 'long_ball'
  return 'short_pass'
}

/** Basis-Erfolgswahrscheinlichkeit eines Passes */
function passSuccessChance(
  stat: number,
  dist: number,
  opponents: PlayerData[],
  passer: PlayerData,
  receiver: PlayerData,
): number {
  // Basis aus Stat: stat 50 → 0.75, stat 70 → 0.85, stat 90 → 0.95
  let chance = 0.50 + stat / 200

  // Distanz-Malus (reduziert — lange Bälle sollen möglich sein)
  chance -= dist / 300

  // Gegner im Passweg
  for (const opp of opponents) {
    const d = pointToSegmentDistance(opp.position, passer.position, receiver.position)
    if (d < getTackleRadius(opp)) {
      chance -= 0.15
      break
    } else if (d < getTackleRadius(opp) * 2) {
      chance -= 0.07
    }
  }

  // Empfänger unter Druck
  let receiverFree = true
  for (const opp of opponents) {
    if (distance(receiver.position, opp.position) < 5) {
      chance -= 0.08
      receiverFree = false
      break
    } else if (distance(receiver.position, opp.position) < 12) {
      receiverFree = false
    }
  }

  // Freier Empfänger: kein Gegner in 12 Einheiten → Bonus
  if (receiverFree) chance += 0.10

  return clamp(chance, 0.05, 0.95)
}

/** Dribbling-Optionen gegen nahe Gegner */
function evaluateDribbleOptions(
  carrier: PlayerData,
  team: TeamSide,
  opponents: PlayerData[],
  oppGoalY: number,
): BallOption[] {
  const options: BallOption[] = []
  const moveRad = getMovementRadius(carrier)

  for (const opp of opponents) {
    const dist = distance(carrier.position, opp.position)
    if (dist > 15 || dist < 2) continue

    // Richtung: am Gegner vorbei (Verlängerung Ballführer → Gegner)
    const dx = opp.position.x - carrier.position.x
    const dy = opp.position.y - carrier.position.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len === 0) continue

    let target: Position = {
      x: opp.position.x + (dx / len) * 5,
      y: opp.position.y + (dy / len) * 5,
    }
    target = clampToRadius(target, carrier.origin, moveRad)
    target = clampToPitch(target)

    // Erfolgswahrscheinlichkeit: Pfad-basiertes Dribble-Risiko (Engine-konsistent)
    const dribbleRisk = calculateDribbleRisk(carrier, carrier.origin, target, [opp])
    const successChance = dribbleRisk > 0
      ? clamp(1 - dribbleRisk, 0.10, 0.85)
      : clamp(0.50 + (carrier.stats.dribbling - opp.stats.tackling) / 100, 0.10, 0.90)

    // Reward: was gewinnen wir?
    const goalDistBefore = Math.abs(carrier.position.y - oppGoalY)
    const goalDistAfter = Math.abs(target.y - oppGoalY)
    let reward = 0.40 + (goalDistBefore - goalDistAfter) / 100 * 0.50

    // Dribbeln im eigenen Drittel: stark bestrafen
    const inOwnThird = team === 1 ? carrier.position.y > 66 : carrier.position.y < 34
    if (inOwnThird) reward *= 0.30

    // Bonus im letzten Drittel: Gegner überspielen ist besonders wertvoll
    const inFinalThird = team === 1 ? carrier.position.y < 34 : carrier.position.y > 66
    if (inFinalThird) reward = Math.min(1, reward + 0.15)

    reward = clamp(reward, 0.05, 1.0)

    options.push({
      type: 'dribble',
      target,
      successChance,
      reward,
      score: 0,
      reason: `Dribbelt an ${opp.positionLabel} vorbei`,
    })
  }

  return options
}

/** Vorrücken in freien Raum */
function evaluateAdvance(
  carrier: PlayerData,
  team: TeamSide,
  opponents: PlayerData[],
  oppGoalY: number,
): BallOption | null {
  const moveRad = getMovementRadius(carrier)
  const dir = team === 1 ? -1 : 1

  // Gegner im Weg zählen
  let blocked = 0
  for (const opp of opponents) {
    const ahead = team === 1 ? opp.position.y < carrier.position.y : opp.position.y > carrier.position.y
    if (ahead && Math.abs(opp.position.x - carrier.position.x) < 12 && distance(carrier.position, opp.position) < 15) {
      blocked++
    }
  }
  if (blocked >= 2) return null

  const target = clampToPitch(clampToRadius(
    { x: carrier.position.x, y: carrier.position.y + dir * moveRad * 0.8 },
    carrier.origin, moveRad,
  ))

  const goalDist = Math.abs(carrier.position.y - oppGoalY)
  const newGoalDist = Math.abs(target.y - oppGoalY)

  // Dribble-Risiko: Laufweg durch gegnerischen Radius → reale Zweikampfgefahr
  const dribbleRisk = calculateDribbleRisk(carrier, carrier.origin, target, opponents)
  const successChance = dribbleRisk > 0
    ? clamp(1 - dribbleRisk, 0.10, 0.85)
    : (blocked === 0 ? 0.95 : 0.65)

  return {
    type: 'advance',
    target,
    successChance,
    reward: 0.30 + (goalDist - newGoalDist) / 100 * 0.40,
    score: 0,
    reason: `Rückt vor (${Math.round(goalDist)}m zum Tor)`,
  }
}

/** Ball behaupten — weicht vom nächsten Gegner aus */
function evaluateHold(
  carrier: PlayerData,
  team: TeamSide,
  opponents: PlayerData[],
): BallOption {
  let closestDist = Infinity
  let closestOpp: PlayerData | null = null

  for (const opp of opponents) {
    const d = distance(carrier.position, opp.position)
    if (d < closestDist) { closestDist = d; closestOpp = opp }
  }

  // Vom Gegner weg bewegen
  let target = { ...carrier.position }
  if (closestOpp && closestDist < 12) {
    const dx = carrier.position.x - closestOpp.position.x
    const dy = carrier.position.y - closestOpp.position.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len > 0) {
      const moveRad = getMovementRadius(carrier)
      target = clampToPitch(clampToRadius(
        {
          x: carrier.position.x + (dx / len) * moveRad * 0.3,
          y: carrier.position.y + (dy / len) * moveRad * 0.3,
        },
        carrier.origin, moveRad,
      ))
    }
  }

  // Druck bewerten
  let pressure = 0
  for (const opp of opponents) {
    const d = distance(carrier.position, opp.position)
    if (d < 10) pressure += (10 - d) / 10
  }

  return {
    type: 'hold',
    target,
    successChance: clamp(0.50 + carrier.stats.ballShielding / 200 - pressure * 0.20, 0.30, 0.95),
    reward: 0.15,
    score: 0,
    reason: 'Behauptet den Ball',
  }
}

// ══════════════════════════════════════════
//  Steilpass in den freien Raum
// ══════════════════════════════════════════

/** Sucht Raum hinter der gegnerischen Abwehrkette für einen Steilpass */
function evaluateThroughBallSpace(
  carrier: PlayerData,
  state: GameState,
  team: TeamSide,
  opponents: PlayerData[],
  teammates: PlayerData[],
  defTeam: TeamSide,
  oppGoalY: number,
): BallOption | null {
  const offsideLine = getOffsideLine(state.players, defTeam)
  const dir = team === 1 ? -1 : 1

  // Ist genug Raum hinter der Abwehr?
  const spaceBehind = team === 1 ? offsideLine : (100 - offsideLine)
  if (spaceBehind < 10) return null

  // Finde Spieler, die NICHT im Abseits stehen und einen Lauf machen können
  const runners = teammates.filter(mate => {
    if (mate.positionLabel === 'TW') return false
    if (isOffside(mate, defTeam, state.players, carrier.position.y)) return false

    // Muss in der vorderen 2/3 des Feldes sein (auch Mittelfeldspieler dürfen laufen)
    const inRange = team === 1 ? mate.position.y < 70 : mate.position.y > 30
    if (!inRange) return false

    // Muss erreichbar nah an der Abseitslinie sein
    const distToLine = Math.abs(mate.position.y - offsideLine)
    if (distToLine > 25) return false

    // Braucht etwas Tempo
    if (mate.stats.pacing < 50) return false

    return true
  })

  if (runners.length === 0) return null

  // Bester Läufer: schnell + nah an der Linie
  const best = runners.reduce((a, b) => {
    const aDistToLine = Math.abs(a.position.y - offsideLine)
    const bDistToLine = Math.abs(b.position.y - offsideLine)
    const aScore = a.stats.pacing * 0.6 + (20 - Math.min(aDistToLine, 20)) * 2
    const bScore = b.stats.pacing * 0.6 + (20 - Math.min(bDistToLine, 20)) * 2
    return aScore > bScore ? a : b
  })

  // Zielpunkt: hinter der Abwehrkette, etwas Richtung Mitte
  const moveRad = getMovementRadius(best)
  const depth = Math.min(moveRad * 0.9, 12)
  const targetY = offsideLine + dir * depth
  const targetX = best.position.x * 0.7 + PITCH.CENTER_X * 0.3

  const target = clampToPitch({ x: targetX, y: targetY })

  // Passreichweite prüfen
  const passRange = getPassRadius(carrier)
  if (distance(carrier.position, target) > passRange) return null

  // Kann der Läufer das Ziel erreichen?
  if (distance(best.position, target) > moveRad * 1.3) return null

  // Zu nah am Torwart? (Nicht in den Fünfmeterraum spielen)
  if (Math.abs(target.y - oppGoalY) < 6) return null

  // Erfolgswahrscheinlichkeit
  const stat = carrier.stats.highPassing
  let successChance = 0.40 + stat / 200  // 0.40–0.90

  // Gegner im Passweg
  for (const opp of opponents) {
    const d = pointToSegmentDistance(opp.position, carrier.position, target)
    if (d < getTackleRadius(opp)) { successChance -= 0.10; break }
    else if (d < getTackleRadius(opp) * 2) { successChance -= 0.05 }
  }

  // Tempo des Läufers hilft
  successChance += (best.stats.pacing - 60) / 150

  successChance = clamp(successChance, 0.15, 0.80)

  // Reward: hoch — potenziell Torchance
  const goalDist = Math.abs(target.y - oppGoalY)
  let reward = 0.70 + (35 - Math.min(goalDist, 35)) / 35 * 0.30
  reward = clamp(reward, 0.60, 1.0)

  const label = `${best.positionLabel} ${best.lastName}`

  return {
    type: 'through_ball',
    target,
    receiverId: best.id,
    successChance,
    reward,
    score: 0,
    reason: `Steilpass in den Raum für ${label}`,
  }
}

// ══════════════════════════════════════════
//  Strategie-Bonus (±20)
// ══════════════════════════════════════════

const STRATEGY_BONUS: Record<AttackStrategy, Partial<Record<BallOptionType, number>>> = {
  possession:  { short_pass: 10, long_ball: -5,  through_ball: 12, cross: 0,   dribble: 0,  advance: 8,  hold: 3 },
  counter:     { short_pass: -5, long_ball: 5,   through_ball: 18, cross: 5,   dribble: -5, advance: 12, hold: -10 },
  wing_play:   { short_pass: 0,  long_ball: 0,   through_ball: 8,  cross: 20,  dribble: 10, advance: 5,  hold: -5 },
  switch_play: { short_pass: 5,  long_ball: 10,  through_ball: 5,  cross: 0,   dribble: 0,  advance: 0,  hold: 0 },
  direct:      { short_pass: -10,long_ball: 15,  through_ball: 10, cross: 10,  dribble: -5, advance: 8,  hold: -10 },
}

function getStrategyBonus(opt: BallOption, plan: TeamPlan): number {
  return STRATEGY_BONUS[plan.strategy.attack]?.[opt.type] ?? 0
}

// ══════════════════════════════════════════
//  Feld-Bonus (±10)
// ══════════════════════════════════════════

function getFieldBonus(
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

// ══════════════════════════════════════════
//  Memory-Bonus (±10)
// ══════════════════════════════════════════

function getMemoryBonus(opt: BallOption, memory: MatchMemory): number {
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

// ══════════════════════════════════════════
//  Hilfsfunktionen
// ══════════════════════════════════════════

/** Konvertiert BallOption → Engine-Aktion */
function toAction(carrier: PlayerData, opt: BallOption): PlayerAction {
  switch (opt.type) {
    case 'shoot':
      return { type: 'shoot', playerId: carrier.id, target: opt.target }

    case 'short_pass':
    case 'long_ball':
    case 'through_ball':
    case 'cross':
      return { type: 'pass', playerId: carrier.id, target: opt.target, receiverId: opt.receiverId! }

    case 'dribble':
    case 'advance':
    case 'hold':
      return { type: 'move', playerId: carrier.id, target: opt.target }
  }
}

function getReceiverLabel(opt: BallOption, state: GameState): string {
  if (!opt.receiverId) return '?'
  const p = state.players.find(pl => pl.id === opt.receiverId)
  return p ? `${p.positionLabel} ${p.lastName}` : '?'
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
