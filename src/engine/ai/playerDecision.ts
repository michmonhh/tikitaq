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
 *
 * Submodule:
 *   playerDecision/types.ts       — BallOption / BallOptionType
 *   playerDecision/evaluators.ts  — Einzelbewertungen (Schuss, Pass, Dribble, …)
 *   playerDecision/scoring.ts     — Strategie-/Feld-/Memory-Bonusse
 *   playerDecision/helpers.ts     — Konvertierung + Utilities
 */

import type { GameState, TeamSide, PlayerAction, PlayerData } from '../types'
import type { TeamPlan, MatchMemory, FieldReading } from './types'
import type { BallOption } from './playerDecision/types'
import {
  evaluateShoot, evaluatePass, evaluateDribbleOptions,
  evaluateAdvance, evaluateHold, evaluateThroughBallSpace,
} from './playerDecision/evaluators'
import { getStrategyBonus, getFieldBonus, getMemoryBonus } from './playerDecision/scoring'
import { toAction, getReceiverLabel } from './playerDecision/helpers'

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
  const options = generateOptions(carrier, state, team)
  if (options.length === 0) return null

  // ── Bewerten ──
  const baseRisk = plan?.riskAppetite ?? 0.5
  const oppGoalY = team === 1 ? 0 : 100

  // Echte Euclid-Distanz zum Tor-Mittelpunkt, nicht nur Y.
  // Vorher: Math.abs(y - oppGoalY) — Flügelspieler (x=30, y=15) galten als
  //   nah am Tor obwohl echte Distanz 25. User-Replay: KI schießt zu früh.
  const goalCx = 50  // PITCH.CENTER_X
  const distToGoal = Math.sqrt(
    (carrier.position.x - goalCx) ** 2 +
    (carrier.position.y - oppGoalY) ** 2,
  )

  // Risikoeskalation: je näher am Tor, desto aggressiver
  const goalUrgency = distToGoal < 21 ? (21 - distToGoal) / 21 : 0  // 0–1
  const riskAppetite = Math.min(0.90, baseRisk + goalUrgency * 0.35)

  // "Frei-durch"-Erkennung: kein Gegner (außer TW) nah am Ballträger.
  // User-Replay-Beobachtung: ein OM war komplett frei, hat aber lieber zum
  // (bereits bedrängten) ST gepasst statt selbst aufs Tor zu laufen. Wenn
  // der Ballträger mehr Luft hat als seine Pass-Empfänger, soll er selbst
  // gehen.
  const carrierOpps = state.players.filter(p => p.team !== team && p.positionLabel !== 'TW')
  let carrierPressure = Infinity
  for (const opp of carrierOpps) {
    const d = Math.hypot(carrier.position.x - opp.position.x, carrier.position.y - opp.position.y)
    if (d < carrierPressure) carrierPressure = d
  }
  const carrierIsFree = carrierPressure > 10

  for (const opt of options) {
    // Kernformel: reward × risk + successChance × (1-risk)
    opt.score = (opt.reward * riskAppetite + opt.successChance * (1 - riskAppetite)) * 100
    // Bonusse
    if (plan) opt.score += getStrategyBonus(opt, plan)
    if (fieldReading) opt.score += getFieldBonus(opt, fieldReading, team)
    if (memory) opt.score += getMemoryBonus(opt, memory)

    // Schuss-Bewertung: Zonen-gestuft, keine Weitschüsse mehr.
    // evaluateShoot filtert > 20 m bereits ab, deshalb hier keine
    // Weitschuss-Spezialbehandlung nötig. Innerhalb 20 m belohnen wir
    // Nahdistanz klar stärker als Rand.
    if (opt.type === 'shoot') {
      if (distToGoal < 10) opt.score += 35       // Fünfmeter: klar schießen
      else if (distToGoal < 14) opt.score += 22  // innerhalb 16er
      else if (distToGoal < 18) opt.score += 10  // Rand 16er
      // 18–20 m: neutral — Option existiert noch, aber ohne Bonus
    }

    // Vorrücken belohnen wenn noch vor dem 16er und Raum nach vorne.
    // Ziel: KI läuft bis in den Strafraum, bevor sie schießt.
    if (opt.type === 'advance' && distToGoal > 14 && distToGoal < 40) {
      opt.score += 12
    }

    // Steilpass-Bonus: gefährlichste Option belohnen.
    // 2026-04-22: +8 → +15 — User hat im Replay gesehen, dass die KI zu
    // selten den riskanten Ball nach vorn sucht.
    if (opt.type === 'through_ball') opt.score += 15

    // Frei-durch: Ballträger selbst gehen lassen, nicht abgeben.
    if (carrierIsFree) {
      if (opt.type === 'advance' || opt.type === 'dribble') {
        opt.score += 22  // stark bevorzugen
      }
      // Bei Pass-Optionen: wenn der Empfänger UNTER DRUCK steht, während
      // der Ballträger frei ist, Pass bestrafen. Wir geben den Ball nicht
      // in eine schlechtere Lage ab.
      if (opt.receiverId) {
        const receiver = state.players.find(p => p.id === opt.receiverId)
        if (receiver) {
          let receiverPressure = Infinity
          for (const opp of carrierOpps) {
            const d = Math.hypot(
              receiver.position.x - opp.position.x,
              receiver.position.y - opp.position.y,
            )
            if (d < receiverPressure) receiverPressure = d
          }
          if (receiverPressure < carrierPressure - 3) {
            opt.score -= 15
          }
        }
      }
    }

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
