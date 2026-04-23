import type { PlayerData, GameState, PassAction, GameEvent, TeamSide, Position } from '../types'
import { name } from '../playerName'
import * as T from '../../data/tickerTexts'
import { tickerThroughBall } from '../../data/tickerTexts'
import { distance, getMovementRadius, clampToPitch } from '../geometry'
import { PITCH } from '../constants'
import { constrainPass, findReceiver, isPassLaneBlocked, calculatePassSuccess, checkInterception, type PassType } from './mechanics'
import { isOffside, throughBallOffsideProbability } from './offside'

interface PassResult {
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
      // Freistoß an der Position des abseits-stehenden Empfängers (FIFA Law 12)
      return {
        success: false, passType: 'ground', interceptedBy: null, receiver,
        ballLandingPos: null, outOfBounds: null, receiverNewPosition: null,
        event: {
          type: 'offside',
          playerId: passer.id,
          targetId: receiver.id,
          position: receiver.position,
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
    // Through balls sind schwerer — aber schnelle Läufer mildern das ab.
    // 2026-04-22: 0.75+0.20 → 0.88+0.10 — der kumulierte Malus (Pass-Roll +
    // Interception-Check) reichte aus; diese Zusatzstufe drosselte Through-
    // Balls zu hart.
    successChance *= 0.88 + (receiver.stats.pacing / 100) * 0.10
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

  // Pass-Typ klassifizieren — für retrograde Analyse (z.B. "wie viele
  // Tore nach Steilpass?"). Heuristik: explizit isThroughBallIntoSpace,
  // sonst Distanz für short/long, Flanke bei Herkunft von der Seite.
  const passDist = distance(passer.position, receiver.position)
  const passerWide = passer.position.x < 25 || passer.position.x > 75
  const receiverCentral = receiver.position.x > 25 && receiver.position.x < 75
  const oppGoalY = passer.team === 1 ? 0 : 100
  const receiverNearGoal = Math.abs(receiver.position.y - oppGoalY) < 25
  const passKind: 'short_pass' | 'long_ball' | 'through_ball' | 'cross' =
    isThroughBallIntoSpace                              ? 'through_ball' :
    (passerWide && receiverCentral && receiverNearGoal) ? 'cross' :
    passDist > 25                                       ? 'long_ball' :
                                                          'short_pass'

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
      passKind,
    },
  }
}
