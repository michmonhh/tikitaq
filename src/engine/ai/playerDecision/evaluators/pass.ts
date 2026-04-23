import type { GameState, TeamSide, PlayerData, Position } from '../../../types'
import { distance, getPassRadius, pointToSegmentDistance, getTackleRadius } from '../../../geometry'
import { isOffside, getOffsideLine } from '../../../passing'
import type { BallOption } from '../types'
import { clamp } from '../helpers'

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

/** Pass auf einen Mitspieler */
export function evaluatePass(
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
  // FIFA Law 11.3: kein Abseits direkt nach Eckstoß. Ohne diese Ausnahme
  // filtert evaluatePass alle Mitspieler im 16er (die relativ zum Taker
  // an der Eckfahne im Abseits stehen) und die KI findet keinen Passempfänger.
  // Ergebnis: Ecken werden nicht ausgeführt, Spielfluss bricht ab.
  if (state.lastSetPiece !== 'corner'
    && isOffside(mate, defTeam, state.players, carrier.position.y)) return null

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
