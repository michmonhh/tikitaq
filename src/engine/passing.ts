import type { PlayerData, GameState, PassAction, GameEvent, TeamSide, Position } from './types'
import { name } from './playerName'
import { getConfidenceModifier } from './confidence'
import * as T from '../data/tickerTexts'
import { tickerThroughBall } from '../data/tickerTexts'
import { distance, getPassRadius, getInterceptRadius, getTackleRadius, getMovementRadius, pointToSegmentDistance, clampToRadius, clampToPitch } from './geometry'
import { PASSING, PITCH } from './constants'

/**
 * Scatter the ball randomly near a target position (for failed passes).
 * The ball doesn't land precisely on the target — it drifts.
 */
function scatterBallPosition(target: Position, maxScatter: number = 8): Position {
  const angle = Math.random() * Math.PI * 2
  const dist = 3 + Math.random() * maxScatter // At least 3 units off target
  return {
    x: target.x + Math.cos(angle) * dist,
    y: target.y + Math.sin(angle) * dist,
  }
}

export type PassType = 'ground' | 'high'

export interface PassResult {
  success: boolean
  passType: PassType
  interceptedBy: PlayerData | null
  receiver: PlayerData | null
  ballLandingPos: Position | null  // Where the ball ends up if pass fails without interception
  outOfBounds: 'throw_in' | 'corner' | null
  receiverNewPosition: Position | null  // Through ball: receiver runs here on success
  event: GameEvent
}

/**
 * Validate that a pass is possible.
 */
export function canPass(player: PlayerData, state: GameState): boolean {
  if (player.team !== state.currentTurn) return false
  if (state.ball.ownerId !== player.id) return false
  if (state.passesThisTurn >= 2) return false // Max 2 passes per turn
  return true
}

/**
 * Constrain a pass target within the player's pass radius.
 */
export function constrainPass(player: PlayerData, target: Position): Position {
  const radius = getPassRadius(player)
  return clampToRadius(target, player.position, radius)
}

/**
 * Find the closest teammate near a target position (for pass reception).
 */
export function findReceiver(
  passer: PlayerData,
  target: Position,
  players: PlayerData[]
): PlayerData | null {
  const teammates = players.filter(
    p => p.team === passer.team && p.id !== passer.id
  )

  let closest: PlayerData | null = null
  let closestDist: number = PASSING.RECEIVE_RADIUS

  for (const mate of teammates) {
    const dist = distance(mate.position, target)
    if (dist < closestDist) {
      closestDist = dist
      closest = mate
    }
  }

  return closest
}

/**
 * Check if any opponent's defensive radius blocks the direct pass lane.
 */
export function isPassLaneBlocked(
  passer: PlayerData,
  target: Position,
  opponents: PlayerData[]
): boolean {
  for (const opp of opponents) {
    const defRadius = getTackleRadius(opp)
    const distToLane = pointToSegmentDistance(opp.position, passer.position, target)
    if (distToLane <= defRadius) {
      return true
    }
  }
  return false
}

/**
 * Check if any opponent can intercept a ground pass.
 * Only applies to ground passes.
 */
export function checkInterception(
  passer: PlayerData,
  target: Position,
  opponents: PlayerData[]
): PlayerData | null {
  let bestInterceptor: PlayerData | null = null
  let bestDist = Infinity

  for (const opp of opponents) {
    const interceptRadius = getInterceptRadius(opp)
    const distToLane = pointToSegmentDistance(opp.position, passer.position, target)

    if (distToLane <= interceptRadius) {
      if (distToLane < bestDist) {
        bestDist = distToLane
        bestInterceptor = opp
      }
    }
  }

  return bestInterceptor
}

/**
 * Calculate pass success probability.
 * Factors:
 * - Passer's shortPassing / highPassing stat
 * - Distance to receiver
 * - Ground vs high pass type
 * - Receiver's ability to control under pressure (ballShielding, pacing)
 * - Opponent pressure on the receiver
 *
 * @param opponents - optional, pass all opponents to calculate receiver pressure
 */
export function calculatePassSuccess(
  passer: PlayerData,
  receiverPos: Position,
  passType: PassType,
  receiver?: PlayerData | null,
  opponents?: PlayerData[]
): number {
  const dist = distance(passer.position, receiverPos)

  // Base accuracy from passer stat (0-100 → 0.5-1.0 range)
  const stat = passType === 'ground' ? passer.stats.shortPassing : passer.stats.highPassing
  const baseAccuracy = 0.5 + (stat / 100) * 0.5

  // Distance penalty: further away = less accurate
  const distPenalty = dist * 0.005

  // High passes are half as likely to succeed as ground passes
  const typeFactor = passType === 'ground' ? 1.0 : 0.5

  let rawChance = (baseAccuracy - distPenalty) * typeFactor

  // Receiver quality: better receivers handle difficult passes
  if (receiver) {
    // Receiver's ball control bonus (0-5% bonus from ballShielding)
    const controlBonus = (receiver.stats.ballShielding / 100) * 0.05
    rawChance += controlBonus

    // Receiver under opponent pressure?
    if (opponents && opponents.length > 0) {
      let pressure = 0
      for (const opp of opponents) {
        const distToReceiver = distance(opp.position, receiverPos)
        if (distToReceiver < 10) {
          pressure += (10 - distToReceiver) * 0.01
        }
      }
      // Pressure reduces chance, but receiver's ballShielding mitigates it
      const shieldFactor = receiver.stats.ballShielding / 100 // 0-1
      const pressurePenalty = pressure * (1.2 - shieldFactor) // High shielding = less penalty
      rawChance -= pressurePenalty

      // Fast receivers can adjust position — small bonus
      rawChance += (receiver.stats.pacing / 100) * 0.03
    }
  }

  // Apply passer's confidence modifier
  rawChance *= getConfidenceModifier(passer)

  // Reduce miss rate by 68% (base 60% + additional 20% reduction)
  const chance = 1 - (1 - rawChance) * 0.32
  return Math.max(0.15, Math.min(0.98, chance))
}

/**
 * Check if a position is out of bounds and determine the restart type.
 */
function checkOutOfBounds(
  pos: Position,
  passingTeam: TeamSide
): 'throw_in' | 'corner' | null {
  // Side lines (X out of bounds)
  if (pos.x < PITCH.MIN_X || pos.x > PITCH.MAX_X) {
    return 'throw_in'
  }

  // Goal lines (Y out of bounds)
  if (pos.y < PITCH.MIN_Y) {
    // Ball went over top goal line
    // Corner if the defending team (team 2, who defends y=0) touched it last
    // But since it's a pass from passingTeam, it's a goal kick for team 2 → simplify as corner for passingTeam's opponent
    return passingTeam === 1 ? 'corner' : 'throw_in'
  }
  if (pos.y > PITCH.MAX_Y) {
    return passingTeam === 2 ? 'corner' : 'throw_in'
  }

  return null
}

/**
 * Calculate the offside line for a given defending team.
 */
export function getOffsideLine(players: PlayerData[], defendingTeam: TeamSide): number {
  const defenders = players.filter(p => p.team === defendingTeam)

  if (defendingTeam === 2) {
    // Team 2 verteidigt Tor bei y=0 → Abseitslinie = 2. Spieler von unten
    // Origin = Position am Anfang der Runde (maßgeblich für Abseits)
    const sortedByY = defenders.map(p => p.origin.y).sort((a, b) => a - b)
    const raw = sortedByY.length >= 2 ? sortedByY[1] : 0
    return Math.min(raw, 50)  // Maximal bis Mittellinie — eigene Hälfte ist kein Abseits
  } else {
    // Team 1 verteidigt Tor bei y=100 → Abseitslinie = 2. Spieler von oben
    const sortedByY = defenders.map(p => p.origin.y).sort((a, b) => b - a)
    const raw = sortedByY.length >= 2 ? sortedByY[1] : 100
    return Math.max(raw, 50)  // Maximal bis Mittellinie — eigene Hälfte ist kein Abseits
  }
}

/**
 * Check if a receiver would be in an offside position.
 * Benutzt origin (Position am Rundenanfang), nicht aktuelle Position.
 * Kein Abseits wenn der Empfänger hinter dem Ball steht (Querpässe, Rückpässe).
 */
export function isOffside(
  receiver: PlayerData,
  defendingTeam: TeamSide,
  players: PlayerData[],
  ballY: number,
): boolean {
  // Origin = maßgebliche Position für Abseitsberechnung
  const recY = receiver.origin.y

  // Kein Abseits wenn Empfänger auf Ballhöhe oder dahinter
  if (defendingTeam === 2) {
    // Team 1 greift Richtung y=0 an → "hinter dem Ball" = höheres y
    if (recY >= ballY) return false
  } else {
    // Team 2 greift Richtung y=100 an → "hinter dem Ball" = niedrigeres y
    if (recY <= ballY) return false
  }

  const offsideLine = getOffsideLine(players, defendingTeam)

  if (defendingTeam === 2) {
    return recY < offsideLine
  } else {
    return recY > offsideLine
  }
}

/**
 * Berechne die Abseits-Wahrscheinlichkeit für einen Steilpass.
 *
 * - Origin im Abseits → IMMER 100% (egal wie gut der Spieler ist)
 * - Origin knapp onside → Wahrscheinlichkeit abhängig von Spielerqualität
 *   (bessere Spieler timen ihren Lauf besser und riskieren die knappe Position)
 * - Origin klar onside (>3 Einheiten) → 0%
 *
 * Nutzt origin (Rundenstart-Position) für die Berechnung.
 */
export function throughBallOffsideProbability(
  receiver: PlayerData,
  defendingTeam: TeamSide,
  players: PlayerData[],
  ballY: number,
): number {
  const recY = receiver.origin.y

  // Hinter dem Ball = kein Abseits möglich
  if (defendingTeam === 2 && recY >= ballY) return 0
  if (defendingTeam === 1 && recY <= ballY) return 0

  const offsideLine = getOffsideLine(players, defendingTeam)

  // Abstand zur Abseitslinie (positiv = abseits, negativ = onside)
  const distPastLine = defendingTeam === 2
    ? offsideLine - recY   // Team 1 greift Richtung y=0 an
    : recY - offsideLine   // Team 2 greift Richtung y=100 an

  // Origin im Abseits → IMMER abseits, keine Rettung durch Qualität
  if (distPastLine >= 0) return 1.0

  // Klar onside (> 3 Einheiten hinter der Linie): kein Risiko
  if (distPastLine < -3) return 0

  // Knapp onside (-3 bis 0): Wahrscheinlichkeit steigt je näher an der Linie
  // distPastLine ist hier zwischen -3 und 0
  // -3: 0%, -2: ~20%, -1: ~40%, -0.5: ~50%
  const base = Math.min(0.60, (3 + distPastLine) * 0.20)

  // Qualität des Empfängers reduziert Wahrscheinlichkeit (gutes Timing)
  const qualityFactor = (receiver.stats.pacing * 0.6 + receiver.stats.quality * 0.4) / 100
  const reduction = qualityFactor * 0.45  // Max 45% Reduktion bei Weltklasse

  return Math.max(0, base - reduction)
}

/**
 * Execute a pass action.
 *
 * Automatically decides between ground pass and high pass:
 * - Defender's defensive radius in the pass lane → high pass
 * - Otherwise → ground pass
 *
 * Success probability depends on:
 * - shortPassing (ground) or highPassing (high) stat
 * - Distance to receiver (further = less accurate)
 * - Ground passes succeed at double the rate of high passes
 *
 * If a pass fails without interception, the ball lands freely at the
 * target position. If that position is out of bounds → throw-in or corner.
 */
export function applyPass(
  action: PassAction,
  state: GameState
): PassResult {
  const passer = state.players.find(p => p.id === action.playerId)!
  const opponents = state.players.filter(p => p.team !== passer.team)
  const target = constrainPass(passer, action.target)

  // Find receiver near target
  let receiver = findReceiver(passer, target, state.players)
  let isThroughBallIntoSpace = false

  // Through ball into space: no receiver at target, but named receiver can run there
  if (!receiver && action.receiverId) {
    const namedReceiver = state.players.find(p => p.id === action.receiverId)
    if (namedReceiver && namedReceiver.team === passer.team) {
      const reachDist = distance(namedReceiver.position, target)
      const moveRad = getMovementRadius(namedReceiver)
      if (reachDist <= moveRad * 1.3) {
        receiver = namedReceiver
        isThroughBallIntoSpace = true
      }
    }
  }

  if (!receiver) {
    // No receiver near target — ball scatters near target
    const scattered = scatterBallPosition(target)
    const outOfBounds = checkOutOfBounds(scattered, passer.team)
    const landingPos = outOfBounds ? scattered : clampToPitch(scattered)
    if (outOfBounds) {
      return {
        success: false, passType: 'ground', interceptedBy: null, receiver: null,
        ballLandingPos: landingPos, outOfBounds, receiverNewPosition: null,
        event: {
          type: outOfBounds === 'corner' ? 'corner' : 'throw_in',
          playerId: passer.id,
          position: landingPos,
          message: outOfBounds === 'corner' ? T.tickerPassOutCorner(name(passer)) : T.tickerPassOutThrow(name(passer)),
        },
      }
    }
    return {
      success: false, passType: 'ground', interceptedBy: null, receiver: null,
      ballLandingPos: landingPos, outOfBounds: null, receiverNewPosition: null,
      event: {
        type: 'pass_lost',
        playerId: passer.id,
        position: landingPos,
        message: T.tickerPassLost(name(passer)),
      },
    }
  }

  // Abseitscheck — nutzt origin (Rundenstart-Position), nicht aktuelle Position
  // Kein Abseits direkt nach Eckstoß (FIFA Law 11.3)
  const defendingTeam: TeamSide = passer.team === 1 ? 2 : 1
  if (state.lastSetPiece !== 'corner') {
    let caughtOffside = false

    if (isThroughBallIntoSpace) {
      // Steilpass: probabilistische Abseitsprüfung — Qualität des Empfängers zählt
      const prob = throughBallOffsideProbability(receiver, defendingTeam, state.players, passer.position.y)
      caughtOffside = prob > 0 && Math.random() < prob
    } else {
      // Normaler Pass: deterministische Abseitsprüfung
      caughtOffside = isOffside(receiver, defendingTeam, state.players, passer.position.y)
    }

    if (caughtOffside) {
      // Freistoß an der Ballposition (wo der Pass gespielt wurde), nicht beim Empfänger
      return {
        success: false, passType: 'ground', interceptedBy: null, receiver,
        ballLandingPos: null, outOfBounds: null, receiverNewPosition: null,
        event: {
          type: 'offside',
          playerId: passer.id,
          targetId: receiver.id,
          position: passer.position,
          message: T.tickerOffside(name(receiver)),
        },
      }
    }
  }

  // Through ball into space: always high (lobbed over defense)
  // Normal pass: high if lane is blocked
  const passType: PassType = isThroughBallIntoSpace
    ? 'high'
    : (isPassLaneBlocked(passer, receiver.position, opponents) ? 'high' : 'ground')

  // Calculate success probability
  let successChance = calculatePassSuccess(passer, target, passType, receiver, opponents)
  if (isThroughBallIntoSpace) {
    // Through balls are harder — but fast runners mitigate this
    successChance *= 0.75 + (receiver.stats.pacing / 100) * 0.20
  }

  const roll = Math.random()
  const passSucceeds = roll < successChance

  // Failed pass → scatter near target
  const failResult = (pType: PassType): PassResult => {
    if (pType === 'ground') {
      const interceptor = checkInterception(passer, target, opponents)
      if (interceptor) {
        return {
          success: false, passType: pType, interceptedBy: interceptor, receiver,
          ballLandingPos: null, outOfBounds: null, receiverNewPosition: null,
          event: {
            type: 'pass_intercepted',
            playerId: passer.id,
            targetId: interceptor.id,
            position: interceptor.position,
            message: T.tickerPassIntercepted(name(passer), name(interceptor)),
          },
        }
      }
    }
    // Steilpass in den Raum: Ball landet exakt am Zielpunkt (bewusst gespielt)
    // Normaler Fehlpass: Ball streut zufällig
    const landingRaw = isThroughBallIntoSpace ? target : scatterBallPosition(receiver.position)
    const outOfBounds = checkOutOfBounds(landingRaw, passer.team)
    const landingPos = outOfBounds ? landingRaw : clampToPitch(landingRaw)
    if (outOfBounds) {
      return {
        success: false, passType: pType, interceptedBy: null, receiver,
        ballLandingPos: landingPos, outOfBounds, receiverNewPosition: null,
        event: {
          type: outOfBounds === 'corner' ? 'corner' : 'throw_in',
          playerId: passer.id,
          position: landingPos,
          message: outOfBounds === 'corner' ? T.tickerPassOutCorner(name(passer)) : T.tickerPassOutThrow(name(passer)),
        },
      }
    }
    return {
      success: false, passType: pType, interceptedBy: null, receiver,
      ballLandingPos: landingPos, outOfBounds: null, receiverNewPosition: null,
      event: {
        type: 'pass_lost',
        playerId: passer.id,
        position: landingPos,
        message: T.tickerPassLost(name(passer)),
      },
    }
  }

  if (!passSucceeds) return failResult(passType)

  // Successful ground pass — still check interception
  if (passType === 'ground') {
    const interceptor = checkInterception(passer, receiver.position, opponents)
    if (interceptor) {
      return {
        success: false, passType: 'ground', interceptedBy: interceptor, receiver,
        ballLandingPos: null, outOfBounds: null, receiverNewPosition: null,
        event: {
          type: 'pass_intercepted',
          playerId: passer.id,
          targetId: interceptor.id,
          position: interceptor.position,
          message: T.tickerPassIntercepted(name(passer), name(interceptor)),
        },
      }
    }
  }

  // Success
  const throughBallTarget = isThroughBallIntoSpace ? clampToPitch(target) : null
  const successMsg = isThroughBallIntoSpace
    ? tickerThroughBall(name(passer), name(receiver))
    : passType === 'high'
      ? T.tickerPassHigh(name(passer), name(receiver))
      : T.tickerPassGround(name(passer), name(receiver))

  return {
    success: true, passType, interceptedBy: null, receiver,
    ballLandingPos: null, outOfBounds: null,
    receiverNewPosition: throughBallTarget,
    event: {
      type: 'pass_complete',
      playerId: passer.id,
      targetId: receiver.id,
      position: throughBallTarget ?? receiver.position,
      message: successMsg,
    },
  }
}
