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
  evaluateEmergencyClearance,
} from './playerDecision/evaluators'
import { getStrategyBonus, getFieldBonus, getMemoryBonus } from './playerDecision/scoring'
import { toAction, getReceiverLabel } from './playerDecision/helpers'
import { lookaheadValue, AI_LOOKAHEAD_ENABLED, AI_LOOKAHEAD_WEIGHT } from './playerDecision/lookahead'
import { getIntent, getIntentPassBonus } from './matchIntent'
import { isTrainingExportActive } from './training'
import { consumePolicyDecision } from './policy/override'
import { setLastDecision } from './policy/lastDecision'

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

  // ── Policy-Override (ML-Inferenz aus vorherigem async Aufruf) ──
  // Wird von runAIMatch vor executeAITurn gefüllt, wenn eine BC-Policy
  // aktiv ist. Die gewählte Option überspringt die Heuristik komplett.
  const override = consumePolicyDecision(carrier.id)
  if (override) {
    const best = override.options[override.chosenIndex]
    if (best) {
      reasoning.set(carrier.id, `[${override.source}] ${best.reason}`)
      // LastDecision-Slot für Trajectory-Logging ist im Override-Pfad bereits
      // vom onBeforeAITurn-Hook gefüllt worden (mit logProb).
      return toAction(carrier, best)
    }
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

      // 2026-04-24: Nach Ecke in der Box → sofort schießen.
      // Corner-Cooldown deckt ~4 Turns nach dem Eckstoß ab, damit auch
      // der Pass-Empfänger und die 2. Welle den Bonus bekommen (lastSetPiece
      // wird schon beim ersten Corner-Pass genullt — zu kurz).
      const inCornerCooldown = state.cornerCooldownUntilMin !== undefined
        && state.gameTime < state.cornerCooldownUntilMin
      if (inCornerCooldown && distToGoal < 18) {
        opt.score += 25
      }
    }

    // Vorrücken belohnen wenn noch vor dem 16er und Raum nach vorne.
    // Ziel: KI läuft bis in den Strafraum, bevor sie schießt.
    if (opt.type === 'advance' && distToGoal > 14 && distToGoal < 40) {
      opt.score += 12
    }

    // Defensive Rollen sollen nicht in Gegner-Radius dribbeln/vorrücken.
    // Indikator: successChance < 0.80 heißt Gegner blockt den Pfad.
    // TW/IV/LV/RV/ZDM/ZM bekommen dann einen Malus, Offensive
    // (LM/RM/OM/ST) nicht — die dürfen auch riskante Dribblings wagen.
    // ZM (Box-to-Box) wird wie ZDM behandelt (zentraler Mid, soll
    // nicht riskant durchdribbeln, sondern Pässe spielen).
    if ((opt.type === 'advance' || opt.type === 'dribble')
      && opt.successChance < 0.80
      && ['TW', 'IV', 'LV', 'RV', 'ZDM', 'ZM'].includes(carrier.positionLabel)) {
      const penalty = (carrier.positionLabel === 'ZDM' || carrier.positionLabel === 'ZM') ? 25 : 35
      opt.score -= penalty
    }

    // Steilpass-Bonus: gefährlichste Option belohnen.
    // 2026-04-22: 8 → 15 — User: KI zu selten Risiko nach vorn.
    // Versuch mit Halbierung (+7) nach Lookahead-Aktivierung gescheitert —
    // Arena zeigte Tore 2.66 → 2.50. Lookahead-Simulator bewegt nur den
    // Empfänger, nicht die Unterstützer-Positionierung. Heuristik-Bonus
    // deckt daher einen Bereich ab, den Lookahead nicht sehen kann.
    if (opt.type === 'through_ball') opt.score += 15

    // Flanken-Bonus: User-Feedback, bisher kein sichtbares Flankentor.
    // Außerdem brechen wir damit die Steilpass-Monokultur auf.
    // Bonus nur wenn Flanke wirklich auf einen Empfänger in der Box geht.
    if (opt.type === 'cross') opt.score += 12

    // Notfall-Klärung: nur für bedrängte Defender im 16er verfügbar.
    // Bekommt einen großen Bonus, damit sie gegen Hold/riskanten-Pass
    // gewinnt — aber nur in der echten Notfall-Situation.
    // 2026-04-24: strukturell gegen zu wenige Ecken (nur 1.67/Match vs
    // Bundesliga ~9). Ein Klärungsschlag landet oft im Seitenaus/Toraus.
    if (opt.reason === 'Klärungsschlag') opt.score += 30

    // ── Stufe 4: Intent-Bonus (GOAP-light) ──
    // Pass-Optionen in Intent-Richtung bekommen +6, gegen die Richtung -4.
    // So bleibt ein Angriff über 3–5 Züge auf einer Seite kohärent,
    // statt pro Zug neu zu würfeln.
    if (opt.receiverId) {
      const intent = getIntent(team)
      opt.score += getIntentPassBonus(intent, opt.target.x)
    }

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

  // ── Stufe-1-Lookahead: 1-Zug-Minimax für Ballführer ──
  // Für jede Pass- und advance/dribble-Option simulieren wir den Folge-
  // State und bewerten die beste Aktion, die der neue Ballbesitzer dann
  // hätte. Der Folge-Score wird successChance-gewichtet dazuaddiert.
  //
  // Effekt: KI bevorzugt Pässe, die dem Empfänger echte Folgeoptionen
  // geben (Schuss, Flanke, eigener Vorstoß) — nicht nur "freier Mitspieler".
  //
  // Kosten (Arena): ~17× langsamer, von 16 s auf ~4.5 min für 306 Matches.
  // Live-Spiel: ~2.5 ms pro Entscheidung — unsichtbar neben 500 ms
  // Turn-Animation.
  if (AI_LOOKAHEAD_ENABLED) {
    for (const opt of options) {
      const lookahead = lookaheadValue(opt, carrier, state, team, plan, fieldReading, memory)
      opt.score += lookahead * opt.successChance * AI_LOOKAHEAD_WEIGHT
    }
  }

  // ── Beste Option wählen ──
  options.sort((a, b) => b.score - a.score)
  const best = options[0]

  // LastDecision-Slot füllen — der Orchestrator (runAIMatch) liest ihn
  // nach dem Turn aus, fügt state_after + reward hinzu, und ruft dann
  // recordDecision. Damit hat das RL-Training kompletten Kontext.
  if (isTrainingExportActive()) {
    setLastDecision({
      state, team, carrier,
      options, chosenIndex: 0,  // nach sort() ist best an Position 0
    })
  }

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
  // Fallback bei Standards (Freistoß, Einwurf): wenn alle Mitspieler durch
  // Abseits-Filter rausfliegen, nimm den nächsten erreichbaren Mitspieler
  // OHNE Abseits-Check. Ohne diesen Notfall bleibt der Taker mit dem Ball
  // stehen, mustPass wird nach endTurn aufgehoben und der Taker läuft im
  // nächsten eigenen Zug einfach los — unrealistisch und war User-Befund.
  if (options.length === 0) {
    let nearest: PlayerData | null = null
    let nearestDist = Infinity
    for (const mate of teammates) {
      if (mate.positionLabel === 'TW') continue
      const d = Math.hypot(carrier.position.x - mate.position.x, carrier.position.y - mate.position.y)
      if (d >= 4 && d < nearestDist) {
        nearestDist = d
        nearest = mate
      }
    }
    if (!nearest) return null
    const label = `${nearest.positionLabel} ${nearest.lastName}`
    options.push({
      type: 'short_pass',
      target: { ...nearest.position },
      receiverId: nearest.id,
      successChance: 0.85,
      reward: 0.20,
      score: 0,
      reason: `Notfall-Pass auf ${label}`,
    })
  }

  // Bewerten (mit Strategie-Kontext)
  const riskAppetite = plan?.riskAppetite ?? 0.5
  const isCornerTaker = state.lastSetPiece === 'corner' || state.phase === 'corner'
  for (const opt of options) {
    opt.score = (opt.reward * riskAppetite + opt.successChance * (1 - riskAppetite)) * 100
    if (plan) opt.score += getStrategyBonus(opt, plan)
    if (fieldReading) opt.score += getFieldBonus(opt, fieldReading, team)

    // 2026-04-24: Ecken-Taker bevorzugt Flanke in den 16er.
    // User-Feedback: 587 Ecken → nur 12 Tore. Der Taker spielte zu oft
    // einen Kurzpass statt eine Hereingabe. Jetzt: wenn Empfänger in der
    // Gefahrenzone (Strafraum des Gegners) steht, großer Score-Bonus für
    // die Flanke; Kurzpässe aus der Ecke werden weniger belohnt.
    if (isCornerTaker && opt.receiverId) {
      const receiver = state.players.find(p => p.id === opt.receiverId)
      if (receiver) {
        const receiverGoalDist = Math.hypot(
          receiver.position.x - 50,
          receiver.position.y - oppGoalY,
        )
        if (receiverGoalDist < 18) {
          // Empfänger in der Box → Flanke bevorzugen
          opt.score += 25
        } else if (receiverGoalDist > 25) {
          // Weit vom Tor → Kurzpass aus Ecke uninteressant
          opt.score -= 10
        }
      }
    }

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

export function generateOptions(
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

  // 6. Notfall-Klärung (nur für Defender im eigenen 16er unter Druck)
  const emergencyOpt = evaluateEmergencyClearance(carrier, team, opponents)
  if (emergencyOpt) options.push(emergencyOpt)

  return options
}
