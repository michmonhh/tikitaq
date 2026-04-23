/**
 * TIKITAQ AI — 1-Zug-Lookahead für Pass- und Bewegungsoptionen.
 *
 * Stufe 1 der Minimax-Erweiterung: Für jede Option des Ballführers
 * simulieren wir den Folge-State (Empfänger hat Ball an Zielposition)
 * und bewerten die beste Folgeoption des neuen Ballbesitzers.
 *
 * Der zurückgegebene Wert wird an der Aufrufstelle in playerDecision.ts
 * gewichtet zum Option-Score addiert:
 *
 *   opt.score += lookaheadValue(opt, ...) * successChance * LOOKAHEAD_WEIGHT
 *
 * Keine Rekursion — Folgeoptionen werden NICHT wieder mit Lookahead
 * bewertet (sonst exponenzieller Blow-up). Die Tiefe ist hart auf 2
 * begrenzt (ich → Folgeaktion). Echte Minimax-T=3-Tiefe kommt in
 * Stufe 3.
 *
 * Implementierungs-Notizen:
 * - Light-Clone: wir kopieren nur `players` (mit neuem Owner-Pos) und
 *   `ball`, nicht den vollen GameState. `structuredClone` wäre sauberer,
 *   aber ~100 μs vs ~5 μs ist bei 8 Optionen/Zug × 180 Turns × 612
 *   Team-Match-Zügen = 880k Clones/Round-Robin ein deutlicher Sprung.
 * - Scoring-Duplikat: Die Score-Formel + Bonusse sind hier dupliziert,
 *   weil playerDecision.ts carrier-spezifische Bonusse (`carrierIsFree`,
 *   `carrierPressure`) mitführt, die im Folgezug nicht mehr gelten. In
 *   Stufe 3 (Alpha-Beta-T=3) refaktorieren wir das zu einer gemeinsamen
 *   Kern-Funktion.
 */

import type { GameState, TeamSide, PlayerData, Position } from '../../types'
import type { TeamPlan, MatchMemory, FieldReading } from '../types'
import type { BallOption } from './types'
import {
  evaluateShoot, evaluatePass, evaluateDribbleOptions,
  evaluateAdvance, evaluateHold, evaluateThroughBallSpace,
} from './evaluators'
import { getStrategyBonus, getFieldBonus, getMemoryBonus } from './scoring'
import { getMovementRadius } from '../../geometry'
import { getRoleGroup } from '../positioning/roles'

/**
 * Feature-Flag. Auf `false` = deterministisch die alte 1-Zug-KI.
 * Auf `true` = Ballführer-Entscheidungen werden um Empfänger-Folgeoptionen
 * erweitert (Stufe 1, ~2× Arena-Laufzeit).
 */
export const AI_LOOKAHEAD_ENABLED = true

/**
 * Gewicht des Lookahead-Werts relativ zum Direkt-Score.
 * 0.0 = aus, 1.0 = Folgezug gleichwertig zum aktuellen Zug.
 *
 * 2026-04-22: Start war 0.35, aber das dominierte den Base-Score und
 * führte zu Pass-Überhang (Schüsse -35 %, Tore 2.66 → 2.47). Der
 * Folgescore enthält bereits shoot/advance/through-Bonusse und hat
 * damit eine Größenordnung von 50–150 Punkten. Auf 0.15 gesenkt:
 * Lookahead als Tiebreaker, nicht als Dominator.
 */
export const AI_LOOKAHEAD_WEIGHT = 0.15

/**
 * Typ-Aliasse für die Lookahead-Pipeline.
 * Nicht exportiert — nur für interne Dokumentation.
 */
type ContextArgs = {
  plan: TeamPlan | null
  fieldReading: FieldReading | null
  memory: MatchMemory | null
}

/**
 * Heuristische Mitspieler-Antizipation für den Lookahead-Simulator.
 *
 * Problem: Der einfache Light-Clone bewegt NUR den neuen Ballbesitzer.
 * Stürmer und OM bleiben stehen, auch wenn sie im echten Turn in die
 * Box ziehen würden (siehe offensive.ts). Dadurch unterschätzt der
 * Lookahead Flanken und Steilpässe auf Flügel-Spieler.
 *
 * Diese Funktion simuliert einen ABGESPECKTEN Positioning-Schritt:
 * wenn der neue Ballbesitzer seitlich (x<25 / x>75) in der gegnerischen
 * Hälfte steht, ziehen wir Stürmer und OM Richtung Strafraum-Zentrum.
 * Gegner reagieren ebenfalls: die nächsten drei Gegner bewegen sich
 * Richtung Ball (Press-Antizipation).
 */
function simulateTeamResponse(
  state: GameState,
  newOwner: PlayerData,
  team: TeamSide,
): GameState {
  const oppGoalY = team === 1 ? 0 : 100
  const fwd = team === 1 ? -1 : 1
  const ownerWide = newOwner.position.x < 25 || newOwner.position.x > 75
  const ownerAdvanced = team === 1
    ? newOwner.position.y < 50
    : newOwner.position.y > 50

  // Nur wenn Flanken-Situation: Stürmer in die Box ziehen
  const shouldPullStrikersIntoBox = ownerWide && ownerAdvanced

  const opponentTeam: TeamSide = team === 1 ? 2 : 1
  const opponentsOnField = state.players.filter(
    p => p.team === opponentTeam && p.positionLabel !== 'TW',
  )
  // Top-3 nächste Gegner für Press-Antizipation
  const pressers = opponentsOnField
    .map(p => ({ p, d: Math.hypot(
      p.position.x - newOwner.position.x,
      p.position.y - newOwner.position.y,
    ) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
  const presserIds = new Set(pressers.map(e => e.p.id))

  const nextPlayers = state.players.map(p => {
    // Ballbesitzer bleibt wo er ist (wurde schon in simulateOptionState gesetzt)
    if (p.id === newOwner.id) return p

    // Mitspieler-Antizipation: Stürmer + OM in die Box
    if (p.team === team && shouldPullStrikersIntoBox) {
      const role = getRoleGroup(p)
      if (role === 'attacker' || p.positionLabel === 'OM') {
        const boxY = team === 1 ? 12 : 88
        const isSecondStriker = p.positionLabel === 'ST' && p.origin.x > 50
        const boxX = p.positionLabel === 'OM' ? 50
                   : isSecondStriker ? 58 : 42
        const pulledX = p.position.x * 0.4 + boxX * 0.6
        const pulledY = p.position.y * 0.4 + boxY * 0.6
        // Achtung: nicht über die Grundlinie schieben
        const clampedY = team === 1 ? Math.max(3, pulledY) : Math.min(97, pulledY)
        void oppGoalY; void fwd  // für späteres refinement reserviert
        return { ...p, position: { x: pulledX, y: clampedY } }
      }
    }

    // Gegner-Press-Antizipation: die 3 nächsten Gegner rücken nach
    if (presserIds.has(p.id)) {
      const moveRad = getMovementRadius(p)
      const dx = newOwner.position.x - p.position.x
      const dy = newOwner.position.y - p.position.y
      const dist = Math.hypot(dx, dy) || 1
      // Bis zu 50 % der MoveRadius oder 50 % der Distanz (was kleiner)
      const maxMove = Math.min(moveRad * 0.5, dist * 0.5)
      const nx = dx / dist
      const ny = dy / dist
      return {
        ...p,
        position: {
          x: p.position.x + nx * maxMove,
          y: p.position.y + ny * maxMove,
        },
      }
    }

    return p
  })

  return { ...state, players: nextPlayers }
}

/**
 * Erzeugt einen leichtgewichtigen Folge-State: neuer Ballbesitzer
 * an Zielposition, alles andere wie gehabt. Kein deepClone.
 */
function simulateOptionState(
  opt: BallOption,
  carrier: PlayerData,
  state: GameState,
): { nextState: GameState; newOwner: PlayerData } | null {
  // Shoot / hold haben keinen sinnvollen Folgezug aus Sicht des
  // Ballführers — Shoot endet mit Schuss, Hold bleibt stehen (der Wert
  // davon ist schon durch die Kernformel abgedeckt).
  if (opt.type === 'shoot' || opt.type === 'hold') return null

  let newOwnerId: string
  let newOwnerPos: Position

  if (opt.receiverId) {
    // Pass-artig: Empfänger wird neuer Besitzer, Position = Pass-Ziel
    // (für Through-Ball wird das Ziel in die Laufrichtung gesetzt)
    newOwnerId = opt.receiverId
    newOwnerPos = { ...opt.target }
  } else {
    // advance / dribble: carrier behält Ball, läuft zu opt.target
    newOwnerId = carrier.id
    newOwnerPos = { ...opt.target }
  }

  // Light-Clone: nur die Felder, die sich ändern.
  // `players`-Array shallow-kopiert, der neue Owner mit neuem Position-
  // Objekt. Stats, origin, gameStats etc. bleiben per Referenz gültig.
  const nextPlayers = state.players.map(p =>
    p.id === newOwnerId ? { ...p, position: newOwnerPos } : p,
  )
  const newOwner = nextPlayers.find(p => p.id === newOwnerId)
  if (!newOwner) return null

  const nextState: GameState = {
    ...state,
    ball: {
      ...state.ball,
      ownerId: newOwnerId,
      position: { ...newOwnerPos },
    },
    players: nextPlayers,
    // passesThisTurn wird hochgezählt, damit im Folgezug keine weiteren
    // Pässe angenommen werden (wie in echter Runde).
    passesThisTurn: opt.receiverId ? state.passesThisTurn + 1 : state.passesThisTurn,
  }

  return { nextState, newOwner }
}

/**
 * Generiert die Optionen eines Spielers im gegebenen State.
 * Dupliziert bewusst die Logik aus playerDecision.generateOptions
 * (ist dort nicht exportiert und würde sonst zirkulär importieren).
 */
function generateOptionsFor(
  carrier: PlayerData,
  state: GameState,
  team: TeamSide,
): BallOption[] {
  const options: BallOption[] = []
  const opponents = state.players.filter(p => p.team !== team)
  const teammates = state.players.filter(p => p.team === team && p.id !== carrier.id)
  const defTeam: TeamSide = team === 1 ? 2 : 1
  const oppGoalY = team === 1 ? 0 : 100

  const shootOpt = evaluateShoot(carrier, team, oppGoalY)
  if (shootOpt) options.push(shootOpt)

  if (state.passesThisTurn < 2) {
    for (const mate of teammates) {
      const opt = evaluatePass(carrier, mate, state, team, opponents, defTeam, oppGoalY)
      if (opt) options.push(opt)
    }
    const tbSpace = evaluateThroughBallSpace(carrier, state, team, opponents, teammates, defTeam, oppGoalY)
    if (tbSpace) options.push(tbSpace)
  }

  options.push(...evaluateDribbleOptions(carrier, team, opponents, oppGoalY))

  const advOpt = evaluateAdvance(carrier, team, opponents, oppGoalY)
  if (advOpt) options.push(advOpt)

  options.push(evaluateHold(carrier, team, opponents))

  return options
}

/**
 * Bewertet eine einzelne Folgeoption mit der Kern-Scoring-Formel +
 * Bonussen. KEINE Rekursion, kein weiterer Lookahead.
 */
function scoreSingleOption(
  opt: BallOption,
  owner: PlayerData,
  team: TeamSide,
  ctx: ContextArgs,
): number {
  const { plan, fieldReading, memory } = ctx

  const oppGoalY = team === 1 ? 0 : 100
  const distToGoal = Math.sqrt(
    (owner.position.x - 50) ** 2 +
    (owner.position.y - oppGoalY) ** 2,
  )
  const baseRisk = plan?.riskAppetite ?? 0.5
  const goalUrgency = distToGoal < 21 ? (21 - distToGoal) / 21 : 0
  const riskAppetite = Math.min(0.90, baseRisk + goalUrgency * 0.35)

  let score = (opt.reward * riskAppetite + opt.successChance * (1 - riskAppetite)) * 100

  if (plan) score += getStrategyBonus(opt, plan)
  if (fieldReading) score += getFieldBonus(opt, fieldReading, team)
  if (memory) score += getMemoryBonus(opt, memory)

  // Schuss-Zone-Bonus
  if (opt.type === 'shoot') {
    if (distToGoal < 10) score += 35
    else if (distToGoal < 14) score += 22
    else if (distToGoal < 18) score += 10
  }
  // Vorrücken zum Strafraum (parallel zu playerDecision.ts)
  if (opt.type === 'advance' && distToGoal > 14 && distToGoal < 40) {
    score += 12
  }
  // Steilpass + Flanke (parallel zu playerDecision.ts)
  if (opt.type === 'through_ball') score += 15
  if (opt.type === 'cross') score += 12

  return score
}

/**
 * Zentrale Lookahead-Funktion.
 *
 * Returns: Bester Score, den der Folgebesitzer im Folgezug erreichen
 * könnte. 0, wenn kein sinnvoller Folgezug (shoot/hold).
 */
export function lookaheadValue(
  opt: BallOption,
  carrier: PlayerData,
  state: GameState,
  team: TeamSide,
  plan: TeamPlan | null,
  fieldReading: FieldReading | null,
  memory: MatchMemory | null,
): number {
  const sim = simulateOptionState(opt, carrier, state)
  if (!sim) return 0

  const { nextState, newOwner } = sim

  // Stufe 3: Mitspieler- und Gegner-Antizipation im Folge-State.
  // Stürmer/OM ziehen in die Box bei Flanken-Situation, nächste
  // Gegner pressen den neuen Ballbesitzer.
  const anticipatedState = simulateTeamResponse(nextState, newOwner, team)
  const anticipatedOwner = anticipatedState.players.find(p => p.id === newOwner.id) ?? newOwner

  const nextOptions = generateOptionsFor(anticipatedOwner, anticipatedState, team)
  if (nextOptions.length === 0) return 0

  const ctx: ContextArgs = { plan, fieldReading, memory }
  let bestScore = -Infinity
  for (const o of nextOptions) {
    const s = scoreSingleOption(o, anticipatedOwner, team, ctx)
    if (s > bestScore) bestScore = s
  }
  if (bestScore === -Infinity) return 0

  // Nach der Antizipation ist der pressureFactor bereits durch die
  // Gegner-Bewegung berücksichtigt (Gegner sind näher am Owner, was
  // die Folge-Options-Successchance drückt). Dennoch ein leichter
  // Restdampfer für den Fall direkter Nähe.
  const opponents = anticipatedState.players.filter(
    p => p.team !== team && p.positionLabel !== 'TW',
  )
  let minOppDist = Infinity
  for (const opp of opponents) {
    const d = Math.hypot(
      anticipatedOwner.position.x - opp.position.x,
      anticipatedOwner.position.y - opp.position.y,
    )
    if (d < minOppDist) minOppDist = d
  }
  const pressureFactor = minOppDist >= 8 ? 1.0
                       : minOppDist <= 2 ? 0.5
                       : 0.5 + ((minOppDist - 2) / 6) * 0.5

  return bestScore * pressureFactor
}
