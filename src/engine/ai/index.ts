/**
 * TIKITAQ AI v2 — Orchestrator
 *
 * Drei-Schichten-Modell:
 * 1. Mannschaftsplan (TeamPlan) — Grundstrategie + Viertel-Überprüfung
 * 2. Spielerentscheidung (playerDecision.ts) — Ballführer-Optionen bewerten
 * 3. Positionierung — Pressing → Taktische Position (vorerst einfach)
 *
 * Plus: Memory-Service + Feldanalyse
 */

import type { GameState, TeamSide, PlayerAction, PlayerData, Position } from '../types'
import type { TeamPlan, MatchMemory, FieldReading } from './types'
import { PATTERNS } from './types'
import {
  getMovementRadius, distance, clampToRadius, clampToPitch,
} from '../geometry'
import { getTeamPlayers, getBallCarrier } from '../formation'
import { getOffsideLine } from '../passing'
import {
  selectPressers, decidePositioning, updateGegenpress,
  resetPositioning, computeMarkingAssignments,
} from './positioning'
import { createInitialPlan, reviewStrategy, REVIEW_MINUTES } from './teamPlan'
import { readField } from './fieldReading'
import { createMatchMemory, recordEvent } from './memory'
import { updateConfidence } from './identity'
import { decideBallAction } from './playerDecision'
import { refreshIntent, getIntent, resetIntents } from './matchIntent'

// ══════════════════════════════════════════
//  Modul-State
// ══════════════════════════════════════════

let teamPlans = new Map<TeamSide, TeamPlan>()
let matchMemories = new Map<TeamSide, MatchMemory>()
let lastFieldReading: FieldReading | null = null
let pendingTickerMessages: string[] = []
let lastReasoning = new Map<string, string>()
let reviewedMinutes = new Set<number>()
let lastKnownScore = { team1: 0, team2: 0 }
let hadBallLastTurn = false

// ── Öffentliche Getter ──

export function getAIReasoning(): Map<string, string> { return lastReasoning }
export function getAIPlan(team: TeamSide): TeamPlan | null { return teamPlans.get(team) ?? null }
export function getLastFieldReading(): FieldReading | null { return lastFieldReading }

/** Gibt ausstehende Ticker-Nachrichten zurück und leert die Warteschlange */
export function getAITickerMessages(): string[] {
  const msgs = [...pendingTickerMessages]
  pendingTickerMessages = []
  return msgs
}

// ── Initialisierung ──

/** Initialisiert den AI-Plan für ein Team. Aufrufen nach createFormation(). */
export function initAIPlan(allPlayers: PlayerData[], aiTeam: TeamSide): void {
  const ownPlayers = allPlayers.filter(p => p.team === aiTeam)
  const oppPlayers = allPlayers.filter(p => p.team !== aiTeam)

  const plan = createInitialPlan(ownPlayers, oppPlayers)
  teamPlans.set(aiTeam, plan)
  matchMemories.set(aiTeam, createMatchMemory())
  reviewedMinutes = new Set()
  lastKnownScore = { team1: 0, team2: 0 }
  pendingTickerMessages = []

  // Initiale Strategie als Ticker-Nachricht
  pendingTickerMessages.push(plan.strategy.reason)
}

/** Reset für neues Spiel */
export function resetOpponentModel(): void {
  teamPlans = new Map()
  matchMemories = new Map()
  lastFieldReading = null
  pendingTickerMessages = []
  lastReasoning = new Map()
  reviewedMinutes = new Set()
  lastKnownScore = { team1: 0, team2: 0 }
  hadBallLastTurn = false
  resetPositioning()
  resetIntents()
}

// ══════════════════════════════════════════
//  Event-Hooks (aus dem Store aufgerufen)
// ══════════════════════════════════════════

/**
 * Registriert ein Pass-Ergebnis im Gedächtnis + Identität des passenden
 * Teams. No-op wenn das Team menschlich gespielt wird (kein Plan/Memory).
 *
 * Muster-Klassifizierung:
 * - Richtung: target.x < 40 → LEFT, > 60 → RIGHT, sonst CENTER
 *   (spiegelt scoring.getMemoryBonus-Schwellen)
 * - Distanz: > 25 → LONG, sonst SHORT (spiegelt evaluator/pass classifyPass)
 */
export function recordPassEvent(
  passingTeam: TeamSide,
  passerPos: Position,
  target: Position,
  success: boolean,
): void {
  const memory = matchMemories.get(passingTeam)
  if (memory) {
    if (target.x < 40) recordEvent(memory, PATTERNS.PASS_LEFT, success)
    else if (target.x > 60) recordEvent(memory, PATTERNS.PASS_RIGHT, success)
    else recordEvent(memory, PATTERNS.PASS_CENTER, success)

    const dist = Math.hypot(target.x - passerPos.x, target.y - passerPos.y)
    recordEvent(memory, dist > 25 ? PATTERNS.PASS_LONG : PATTERNS.PASS_SHORT, success)
  }

  const plan = teamPlans.get(passingTeam)
  if (plan) {
    plan.identity = updateConfidence(plan.identity, success ? 'pass_complete' : 'pass_failed')
  }
}

/**
 * Registriert einen Zweikampf-Ausgang.
 * winnerTeam bekommt tackle_won, loserTeam tackle_lost — beide nur wenn das
 * Team einen Plan hat (AI-Team). Auch für Fouls: der "winner" ist der gefoulte
 * Spieler, der "loser" der Foulspieler — die Identität-Deltas passen.
 */
export function recordTackleEvent(winnerTeam: TeamSide, loserTeam: TeamSide): void {
  const winnerPlan = teamPlans.get(winnerTeam)
  if (winnerPlan) winnerPlan.identity = updateConfidence(winnerPlan.identity, 'tackle_won')
  const loserPlan = teamPlans.get(loserTeam)
  if (loserPlan) loserPlan.identity = updateConfidence(loserPlan.identity, 'tackle_lost')
}

/** Registriert eine Torwart-Parade für das verteidigende Team. */
export function recordSaveEvent(savingTeam: TeamSide): void {
  const plan = teamPlans.get(savingTeam)
  if (plan) plan.identity = updateConfidence(plan.identity, 'save')
}

// ══════════════════════════════════════════
//  Einstiegspunkt
// ══════════════════════════════════════════

export function executeAITurn(state: GameState): PlayerAction[] {
  const team: TeamSide = state.currentTurn
  const players = getTeamPlayers(state.players, team)
  const opponents = state.players.filter(p => p.team !== team)
  const actions: PlayerAction[] = []
  const reasoning = new Map<string, string>()

  // ── Schicht 1: Mannschaftsplan aktualisieren ──
  const plan = teamPlans.get(team)
  const memory = matchMemories.get(team)

  if (plan && memory) {
    // Confidence basierend auf Tore aktualisieren
    const ownGoals = team === 1 ? state.score.team1 : state.score.team2
    const oppGoals = team === 1 ? state.score.team2 : state.score.team1
    const prevOwn = team === 1 ? lastKnownScore.team1 : lastKnownScore.team2
    const prevOpp = team === 1 ? lastKnownScore.team2 : lastKnownScore.team1

    for (let i = 0; i < ownGoals - prevOwn; i++) {
      plan.identity = updateConfidence(plan.identity, 'goal_scored')
    }
    for (let i = 0; i < oppGoals - prevOpp; i++) {
      plan.identity = updateConfidence(plan.identity, 'goal_conceded')
    }
    lastKnownScore = { team1: state.score.team1, team2: state.score.team2 }

    // riskAppetite aktualisieren
    plan.riskAppetite = plan.identity.confidence / 100

    // Feldanalyse
    lastFieldReading = readField(state, team)

    // Viertel-Überprüfung (nur einmal pro Review-Minute)
    for (const minute of REVIEW_MINUTES) {
      if (state.gameTime >= minute && !reviewedMinutes.has(minute)) {
        reviewedMinutes.add(minute)
        const result = reviewStrategy(plan, state, team, memory)
        if (result) {
          plan.strategy = result.newStrategy
          plan.riskAppetite = plan.identity.confidence / 100
          pendingTickerMessages.push(result.tickerMessage)
        }
      }
    }
  }

  // ── Schicht 2: Spielerentscheidung (Ballführer) ──

  const carrier = getBallCarrier(state.players, state.ball.ownerId)
  const hasBall = carrier != null && carrier.team === team
  const ballLoose = state.ball.ownerId === null

  // ── Stufe 4: Team-Intent aktualisieren ──
  // Angriffsachse über 3–5 Züge stabil halten. Intent wird bei eigenem
  // Ballbesitz aus FieldReading + Ballposition abgeleitet und erst
  // invalidiert, wenn Ball die Seite wechselt oder Zeit abläuft.
  const currentIntent = refreshIntent(team, state, lastFieldReading, hasBall, carrier ?? null)
  if (currentIntent && hasBall) {
    reasoning.set('__intent', `Angriff ${currentIntent.attackSide} (${currentIntent.trigger})`)
  }

  // Beide Team-Intents für den Replay-Viewer sichtbar machen. Der Intent
  // des jeweils nicht am Zug befindlichen Teams wurde im letzten Team-Turn
  // geschrieben und bleibt persistent; wir lesen ihn hier zur Anzeige.
  const intent1 = getIntent(1)
  const intent2 = getIntent(2)
  if (intent1) {
    reasoning.set('__intent_team1', `${intent1.attackSide} · ${intent1.trigger}`)
  }
  if (intent2) {
    reasoning.set('__intent_team2', `${intent2.attackSide} · ${intent2.trigger}`)
  }

  if (hasBall && carrier) {
    const action = decideBallAction(
      carrier, state, team,
      plan ?? null, lastFieldReading, memory ?? null,
      reasoning,
    )
    if (action) actions.push(action)
  }

  // ── Gegenpress-Zustand aktualisieren ──
  const justLostBall = hadBallLastTurn && !hasBall && !ballLoose
  updateGegenpress(state, team, plan ?? null, justLostBall)

  // Manndeckungs-Zuordnung (wenn aktiv)
  if (plan?.strategy.defense === 'man_marking') {
    computeMarkingAssignments(players, opponents)
  }

  // ── Schicht 3: Positionierung ──
  const acted = new Set(actions.map(a => a.playerId))

  // Steilpass-Empfänger: explizite Bewegung zum Ziel (er rennt los, egal ob Pass ankommt)
  for (const action of actions) {
    if (action.type === 'pass' && 'receiverId' in action && action.receiverId) {
      const receiver = players.find(p => p.id === action.receiverId)
      if (receiver) {
        const moveTarget = clampToRadius(action.target, receiver.origin, getMovementRadius(receiver))
        actions.push({ type: 'move', playerId: receiver.id, target: clampToPitch(moveTarget) })
        acted.add(receiver.id)
      }
    }
  }
  const pressers = selectPressers(players, state, team, plan ?? null, acted)

  // Alle Zielpositionen sammeln und danach Abstände erzwingen
  const targetEntries: {
    player: PlayerData
    target: Position
    secondaryTarget?: Position
    reason: string
  }[] = []

  for (const player of players) {
    if (acted.has(player.id)) continue

    const { target: rawTarget, secondaryTarget, reason } = decidePositioning(
      player, state, team, plan ?? null, lastFieldReading,
      hasBall, ballLoose, pressers,
    )

    // Bewegungsradius + Spielfeldgrenzen
    let target = clampToRadius(rawTarget, player.origin, getMovementRadius(player))
    target = clampToPitch(target)

    // Abseits vermeiden — NICHT für Spieler die zum losen Ball laufen
    // (Abseits gilt nur beim Zuspiel, nicht beim Aufnehmen eines losen Balls)
    //
    // 2026-04-22: Sicherheitsmarge 1 → 2.5 Einheiten. Stürmer sollen
    // "möglichst nie im Abseits stehen" (User). Bei nur 1 Einheit Puffer
    // reichte eine minimale Abwehr-Aufwärtsbewegung, um den Stürmer
    // wieder abseits zu setzen.
    const chasingLooseBall = reason === 'Läuft zum losen Ball' || reason === 'Sichert losen Ball ab'
    if (player.positionLabel !== 'TW' && !chasingLooseBall) {
      const defTeam: TeamSide = team === 1 ? 2 : 1
      const offsideLine = getOffsideLine(state.players, defTeam)
      const margin = 2.5
      if (team === 1 && target.y < offsideLine + margin) target = { x: target.x, y: offsideLine + margin }
      if (team === 2 && target.y > offsideLine - margin) target = { x: target.x, y: offsideLine - margin }
    }

    targetEntries.push({ player, target, secondaryTarget, reason })
  }

  // ── Abwehrkette ausrichten: Zentrale Verteidiger nicht höher als breiteste ──
  if (!hasBall && !ballLoose) {
    const isDefender = (p: PlayerData) => {
      const distFromGoal = p.team === 1 ? 100 - p.origin.y : p.origin.y
      return distFromGoal < 25
    }
    const isWideDefender = (p: PlayerData) => Math.abs(p.origin.x - 50) > 15

    const wideDefenders = targetEntries.filter(
      e => isDefender(e.player) && isWideDefender(e.player),
    )
    if (wideDefenders.length > 0) {
      const deepestY = team === 1
        ? Math.max(...wideDefenders.map(e => e.target.y))
        : Math.min(...wideDefenders.map(e => e.target.y))

      const centralDefenders = targetEntries.filter(
        e => isDefender(e.player) && !isWideDefender(e.player),
      )
      for (const entry of centralDefenders) {
        if (team === 1 && entry.target.y < deepestY) {
          entry.target = { x: entry.target.x, y: deepestY }
          entry.reason = 'Abwehrkette halten'
        }
        if (team === 2 && entry.target.y > deepestY) {
          entry.target = { x: entry.target.x, y: deepestY }
          entry.reason = 'Abwehrkette halten'
        }
      }
    }
  }

  // ── Teammate-Spacing: Mindestabstand erzwingen ──
  // Spieler der zum losen Ball läuft ist fixiert — andere weichen aus
  const ballChaserIdx = targetEntries.findIndex(e => e.reason === 'Läuft zum losen Ball')
  const MIN_SPACING = 12
  for (let i = 0; i < targetEntries.length; i++) {
    for (let j = i + 1; j < targetEntries.length; j++) {
      const a = targetEntries[i]
      const b = targetEntries[j]
      const dist = distance(a.target, b.target)
      if (dist < MIN_SPACING && dist > 0.1) {
        // Ball-Jäger bleibt fixiert — nur der Andere weicht aus
        const aIsChaser = i === ballChaserIdx
        const bIsChaser = j === ballChaserIdx
        const dx = b.target.x - a.target.x
        const dy = b.target.y - a.target.y
        const nx = dx / dist
        const ny = dy / dist

        if (aIsChaser) {
          // Nur b weicht aus (voller Push)
          const push = MIN_SPACING - dist
          b.target = clampToPitch({ x: b.target.x + nx * push, y: b.target.y + ny * push })
        } else if (bIsChaser) {
          // Nur a weicht aus (voller Push)
          const push = MIN_SPACING - dist
          a.target = clampToPitch({ x: a.target.x - nx * push, y: a.target.y - ny * push })
        } else {
          // Beide auseinander, jeweils zur Hälfte
          const push = (MIN_SPACING - dist) / 2
          a.target = clampToPitch({ x: a.target.x - nx * push, y: a.target.y - ny * push })
          b.target = clampToPitch({ x: b.target.x + nx * push, y: b.target.y + ny * push })
        }
      }
    }
  }

  for (const { player, target, secondaryTarget, reason } of targetEntries) {
    // Kleine Bewegungen überspringen — AUSSER der Ball ist frei und nah
    // (ohne Move-Action wird movePlayer nie aufgerufen → Ball wird nicht aufgenommen)
    if (distance(player.position, target) < 1) {
      if (ballLoose && distance(player.position, state.ball.position) < 5) {
        // Ball ist frei und nah → Move erzwingen damit Aufnahme ausgelöst wird
      } else {
        continue
      }
    }
    const move: PlayerAction = secondaryTarget
      ? { type: 'move', playerId: player.id, target, secondaryTarget }
      : { type: 'move', playerId: player.id, target }
    actions.push(move)
    reasoning.set(player.id, reason)
  }

  hadBallLastTurn = hasBall

  // Strategie-Info ins Reasoning
  if (plan) {
    reasoning.set('__strategy', plan.strategy.reason)
  }

  lastReasoning = reasoning
  return actions
}

