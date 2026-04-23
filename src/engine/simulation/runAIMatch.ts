/**
 * Headless KI-vs-KI-Match.
 *
 * Nutzt den gameStore (Zustand ist framework-agnostisch) als Engine-Fahrer
 * und spielt ein komplettes Match durch. Produziert aggregierte Stats und
 * optional einen Turn-by-Turn Replay.
 *
 * Abgrenzung zu simulateMatch.ts: diese Datei lässt die echte KI spielen
 * (executeAITurn). simulateMatch.ts ist ein stochastisches Modell aus
 * Team-Levels für den Saison-Modus.
 */

import { useGameStore } from '../../stores/gameStore'
import { executeAITurn, initAIPlan } from '../ai'
import { PITCH } from '../constants'
import type { GameEvent, GamePhase, GameState, PlayerData, TeamSide } from '../types'
import type {
  ArenaMatchResult, ArenaTeamStats, ReplayFile, ReplaySnapshot,
} from './replayTypes'

// Sicherheits-Obergrenze gegen Endlosschleifen. 90 Minuten bei ~0.5 min/turn
// sind ~180 Turns; wir geben uns 4× Luft für ET, Set-Pieces, Neu-Anstöße.
const MAX_TURNS = 800

export interface RunAIMatchOptions {
  /** true = Turn-by-Turn Snapshots sammeln (Replay). Default false. */
  record?: boolean
  /** true = mit Verlängerung und Elfmeterschießen. Default false (Liga-Match). */
  mustDecide?: boolean
}

/**
 * Spielt ein Match home vs. away mit beiden Teams als KI durch.
 * Synchron — kein React/DOM nötig.
 */
export function runAIMatch(
  homeId: number,
  awayId: number,
  options: RunAIMatchOptions = {},
): ArenaMatchResult {
  const store = useGameStore
  const t0 = Date.now()

  // ── Init: beide Teams als KI ──
  store.getState().initGame(homeId, awayId, true, options.mustDecide ?? false)
  const initialState = store.getState().state
  if (!initialState) throw new Error('initGame produced no state')

  // initGame setzt nur Team 2 als KI. Team 1 auch:
  initAIPlan(initialState.players, 1)

  const snapshots: ReplaySnapshot[] = []
  let turn = 0
  let guard = 0

  // Box-Präsenz: pro Turn des jeweiligen Teams zählen, wie oft mindestens ein
  // eigener Feldspieler im gegnerischen 16er steht. Akkumuliert während der
  // Simulation, weil state.matchStats das nicht trackt.
  const boxPresenceTurns = { team1: 0, team2: 0 }

  // Events des letzten Zugs für den nächsten Snapshot einfangen — state.lastEvent
  // wird von endCurrentTurn() genullt, daher zwischenspeichern.
  let pendingEvent: GameEvent | null = null

  while (guard++ < MAX_TURNS) {
    const s = store.getState().state
    if (!s || s.phase === 'full_time') break

    // Set-Piece / Kickoff → auto-confirm (KI-vs-KI, kein User)
    if (isSetPieceOrKickoff(s.phase)) {
      store.getState().confirmKickoff()
      continue
    }

    // Penalty während Spielflusses → auto-resolve (zufällige Richtung)
    if (s.phase === 'penalty') {
      autoResolvePenalty(store)
      continue
    }

    // Shootout → auto-resolve bis Entscheidung
    if (s.phase === 'shootout' || s.phase === 'shootout_kick') {
      autoResolveShootoutKick(store)
      continue
    }

    // Halbzeit-Pause wird in endCurrentTurn durch handleHalfTime intern
    // direkt auf 'playing' (nächste Halbzeit) geschaltet — kein Extra-Handling.
    // Falls doch noch 'half_time' anliegt, weiterdrehen.
    if (s.phase === 'half_time' || s.phase === 'goal_scored') {
      // endCurrentTurn treibt diese Phasen normalerweise voran; falls wir hier
      // festhängen, explizit weiter.
      store.getState().endCurrentTurn()
      continue
    }

    if (s.phase !== 'playing') {
      // Unbekannte Phase — sicherheitshalber weitertreiben
      store.getState().endCurrentTurn()
      continue
    }

    // ── Box-Präsenz: vor dem Zug messen, wer im gegnerischen 16er steht ──
    if (teamHasPlayerInOpponentBox(s.players, s.currentTurn)) {
      if (s.currentTurn === 1) boxPresenceTurns.team1++
      else boxPresenceTurns.team2++
    }

    // ── Snapshot vor dem Zug (wenn Replay angefordert) ──
    // Das pendingEvent aus dem vorigen Turn wird hier in state.lastEvent
    // eingeklinkt, damit der Viewer "was ist gerade passiert" anzeigen kann.
    // Danach wird es verworfen — jedes Event gehört nur zu einem Snapshot.
    if (options.record) {
      const snap = makeSnapshot(s, turn)
      snap.state.lastEvent = pendingEvent
      snapshots.push(snap)
    }
    pendingEvent = null

    // ── KI-Zug ausführen in drei Phasen, damit wir das resultierende Event
    //    einfangen können, bevor endCurrentTurn() state.lastEvent nullt:
    //    1. executeAITurn() liefert die Actions
    //    2. Actions über die Store-Actions anwenden (wie makeExecuteAI)
    //    3. Event einfangen, dann endCurrentTurn ──
    try {
      const actions = executeAITurn(s)
      for (const action of actions) {
        const currentState = store.getState().state
        if (!currentState || currentState.phase !== 'playing') break
        if (action.type === 'move') store.getState().movePlayer(action.playerId, action.target)
        else if (action.type === 'pass') store.getState().passBall(action.playerId, action.target, action.receiverId)
        else if (action.type === 'shoot') store.getState().shootBall(action.playerId, action.target)
      }
    } catch (err) {
      console.error('[arena] AI turn crashed:', err)
    }
    pendingEvent = store.getState().state?.lastEvent ?? null
    store.getState().endCurrentTurn()
    turn++
  }

  const finalState = store.getState().state
  if (!finalState) throw new Error('match ended without state')

  const stats = buildStats(finalState, boxPresenceTurns)

  // Torschützen aus dem goal-log des States
  const scorers = (finalState.goalLog ?? []).map(g => ({
    team: g.team as TeamSide,
    playerId: g.playerId,
    playerName: g.playerName,
    minute: g.minute,
    kind: g.kind,
  }))

  const finalScore = finalState.score
  const winner: TeamSide | null =
    finalScore.team1 > finalScore.team2 ? 1 :
    finalScore.team2 > finalScore.team1 ? 2 :
    null

  const result: ArenaMatchResult = {
    homeId,
    awayId,
    score: finalScore,
    winner,
    stats,
    scorers,
    simDurationMs: Date.now() - t0,
  }

  if (options.record) {
    const replay: ReplayFile = {
      version: 1,
      recordedAt: new Date().toISOString(),
      homeId,
      awayId,
      finalScore,
      id: `${homeId}v${awayId}-${t0}`,
      snapshots,
    }
    result.replay = replay
  }

  return result
}

// ══════════════════════════════════════════
//  Helper
// ══════════════════════════════════════════

function isSetPieceOrKickoff(phase: GamePhase): boolean {
  return phase === 'kickoff' || phase === 'free_kick' ||
         phase === 'corner'  || phase === 'throw_in'
}

function makeSnapshot(s: GameState, turnIdx: number): ReplaySnapshot {
  // structuredClone ist in Browser + Node (>=17) verfügbar und macht eine
  // tiefe Kopie. Damit ist der Snapshot immutable gegenüber zukünftigen
  // State-Mutationen und enthält alle Felder, die Match-Renderer brauchen.
  return {
    turn: turnIdx,
    state: structuredClone(s),
  }
}

function buildStats(
  s: GameState,
  boxPresenceTurns: { team1: number; team2: number },
): ArenaMatchResult['stats'] {
  const mk = (side: TeamSide): ArenaTeamStats => {
    const key = side === 1 ? 'team1' : 'team2'
    const ms = s.matchStats[key]
    const turns = s.totalTurns[key]
    const boxTurns = boxPresenceTurns[key]

    return {
      goals: side === 1 ? s.score.team1 : s.score.team2,
      xG: ms.xG,
      shotsOnTarget: ms.shotsOnTarget,
      shotsOff: ms.shotsOff,
      passesTotal: ms.passesTotal,
      passesCompleted: ms.passesCompleted,
      passAccuracy: ms.passesTotal > 0 ? (ms.passesCompleted / ms.passesTotal) * 100 : 0,
      tacklesWon: ms.tacklesWon,
      tacklesLost: ms.tacklesLost,
      fouls: ms.fouls,
      yellowCards: ms.yellowCards,
      redCards: ms.redCards,
      corners: ms.corners,
      turns,
      possessionTurns: ms.possession,
      possessionPercent: turns > 0 ? (ms.possession / turns) * 100 : 0,
      boxPresenceTurns: boxTurns,
      boxPresencePercent: turns > 0 ? (boxTurns / turns) * 100 : 0,
      distanceCovered: ms.distanceCovered,
    }
  }

  return { team1: mk(1), team2: mk(2) }
}

/** True wenn mindestens ein nicht-TW-Spieler des angreifenden Teams im gegnerischen 16er steht. */
function teamHasPlayerInOpponentBox(players: PlayerData[], attackingTeam: TeamSide): boolean {
  for (const p of players) {
    if (p.team !== attackingTeam) continue
    if (p.positionLabel === 'TW') continue
    if (p.position.x < PITCH.PENALTY_AREA_LEFT || p.position.x > PITCH.PENALTY_AREA_RIGHT) continue
    // Team 1 greift oben (y=0) an → gegnerischer 16er ist y ≤ PENALTY_AREA_DEPTH
    // Team 2 greift unten (y=100) an → gegnerischer 16er ist y ≥ 100 - PENALTY_AREA_DEPTH
    if (attackingTeam === 1 && p.position.y <= PITCH.PENALTY_AREA_DEPTH) return true
    if (attackingTeam === 2 && p.position.y >= 100 - PITCH.PENALTY_AREA_DEPTH) return true
  }
  return false
}

/** Elfmeter (während des Spielflusses) auto-resolven mit Zufalls-Richtung. */
function autoResolvePenalty(store: typeof useGameStore): void {
  const s = store.getState().state
  const ps = store.getState().penaltyState
  if (!s || !ps) {
    store.getState().endCurrentTurn()
    return
  }
  // Richtung simulieren: Ziel-x für shootBall (directionFromX nutzt x < 45 = left, > 55 = right, sonst center)
  const roll = Math.random()
  const targetX = roll < 0.33 ? 40 : roll < 0.66 ? 50 : 60
  const shooter = s.players.find((p: PlayerData) => p.id === ps.shooterId)
  if (!shooter) {
    store.getState().endCurrentTurn()
    return
  }
  const goalY = shooter.team === 1 ? PITCH.GOAL_TOP_Y : PITCH.GOAL_BOTTOM_Y
  store.getState().shootBall(shooter.id, { x: targetX, y: goalY })
}

/** Einzel-Kick im Elfmeterschießen auto-resolven. */
function autoResolveShootoutKick(store: typeof useGameStore): void {
  const s = store.getState().state
  const ps = store.getState().penaltyState
  if (!s) return
  if (!ps) {
    // Noch kein penaltyState → Shootout-Initialisierung läuft über
    // startShootout in turn.ts — einfach einen endTurn-Puls geben.
    store.getState().endCurrentTurn()
    return
  }
  const roll = Math.random()
  const targetX = roll < 0.33 ? 40 : roll < 0.66 ? 50 : 60
  const shooter = s.players.find((p: PlayerData) => p.id === ps.shooterId)
  if (!shooter) {
    store.getState().endCurrentTurn()
    return
  }
  const goalY = shooter.team === 1 ? PITCH.GOAL_TOP_Y : PITCH.GOAL_BOTTOM_Y
  store.getState().shootBall(shooter.id, { x: targetX, y: goalY })
}
