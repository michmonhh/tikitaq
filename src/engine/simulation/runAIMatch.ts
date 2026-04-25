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
import { executeAITurn, initAIPlan, getAIReasoning } from '../ai'
import { computeStepReward } from '../ai/reward'
import { resetRewardState } from '../ai/rewardState'
import { consumeLastDecision } from '../ai/policy/lastDecision'
import { recordDecision, isTrainingExportActive } from '../ai/training'
import { PITCH } from '../constants'
import { resolvePenalty, aiChoosePenaltyDirection } from '../shooting'
import { handleGoalScored } from '../turn'
import type { GameEvent, GamePhase, GameState, PenaltyDirection, PlayerData, TeamSide } from '../types'
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
  /**
   * Pre-AI-Action-Hook: wird VOR jedem executeAITurn aufgerufen. Kann
   * asynchron sein (z.B. für ONNX-Inferenz einer BC-Policy). Der Hook
   * sollte bei Bedarf `setPolicyDecision()` aufrufen, damit der Ball-
   * führer die ML-Entscheidung statt der Heuristik nutzt.
   */
  onBeforeAITurn?: (
    state: import('../types').GameState,
    team: import('../types').TeamSide,
  ) => Promise<void> | void
}

/**
 * Spielt ein Match home vs. away mit beiden Teams als KI durch.
 * Async — erlaubt Policy-Hooks (ONNX-Inferenz) zwischen Zügen.
 */
export async function runAIMatch(
  homeId: number,
  awayId: number,
  options: RunAIMatchOptions = {},
): Promise<ArenaMatchResult> {
  const store = useGameStore
  const t0 = Date.now()

  // ── Init: beide Teams als KI ──
  store.getState().initGame(homeId, awayId, true, options.mustDecide ?? false)
  const initialState = store.getState().state
  if (!initialState) throw new Error('initGame produced no state')

  // initGame setzt nur Team 2 als KI. Team 1 auch:
  initAIPlan(initialState.players, 1)

  // Anti-Hacking-Counter pro Match zurücksetzen
  resetRewardState()

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

  // Assist-Tracker pro Team: welcher Pass-Typ war zuletzt erfolgreich?
  // Wird bei einem Tor dem scorer zugeordnet; bei Ballverlust gelöscht.
  type PassKind = 'short_pass' | 'long_ball' | 'through_ball' | 'cross'
  const assistKindByTeam = new Map<TeamSide, PassKind>()
  // Tor → assistKind, korreliert mit goalLog-Index am Ende.
  const goalAssists: Array<{ minute: number; playerId: string; assistKind: PassKind | null }> = []

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
      const scored = autoResolvePenalty(store)
      if (scored) {
        const post = store.getState().state
        if (post) {
          goalAssists.push({
            minute: post.gameTime,
            playerId: scored.shooterId,
            assistKind: null,  // Elfmeter: kein Assist
          })
        }
      }
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
    // Pre-AI-Hook: erlaubt async Policy-Inferenz VOR executeAITurn.
    // Der Hook kann setPolicyDecision() aufrufen, was decideBallAction
    // dann am Anfang verbraucht statt die Heuristik zu laufen.
    if (options.onBeforeAITurn) {
      await options.onBeforeAITurn(s, s.currentTurn)
    }

    // Letzte Decision konsumieren (gefüllt von decideBallAction oder
    // dem Policy-Hook). Wird nach dem Turn mit reward + done aufgefüllt.
    const lastDecision = isTrainingExportActive() ? consumeLastDecision() : null
    const stateBefore = lastDecision ? lastDecision.state : null

    try {
      const actions = executeAITurn(s)

      // reasoning in den zuletzt geschriebenen Snapshot eintragen
      // (executeAITurn setzt es während des Zugs, wir holen es jetzt ab).
      // Enthält __intent_team1/2, __strategy und per-Spieler-Begründungen.
      if (options.record && snapshots.length > 0) {
        const reasoningMap = getAIReasoning()
        const reasoningObj: Record<string, string> = {}
        for (const [k, v] of reasoningMap) reasoningObj[k] = v
        snapshots[snapshots.length - 1].reasoning = reasoningObj
      }

      for (const action of actions) {
        const currentState = store.getState().state
        if (!currentState || currentState.phase !== 'playing') break
        const actingTeam = currentState.currentTurn
        if (action.type === 'move') store.getState().movePlayer(action.playerId, action.target)
        else if (action.type === 'pass') store.getState().passBall(action.playerId, action.target, action.receiverId)
        else if (action.type === 'shoot') store.getState().shootBall(action.playerId, action.target)

        // Assist-Tracking: was war's Event der gerade gelaufenen Action?
        const ev = store.getState().state?.lastEvent
        if (!ev) continue
        if (ev.type === 'pass_complete' && ev.passKind) {
          assistKindByTeam.set(actingTeam, ev.passKind)
        } else if (ev.type === 'pass_intercepted' || ev.type === 'pass_lost') {
          assistKindByTeam.delete(actingTeam)
        } else if (ev.type === 'shot_scored') {
          const postState = store.getState().state
          if (postState) {
            // Event-eigenes passKind (z.B. von Corner-Header) hat Priorität
            // vor dem vorangegangenen Pass-Track — ein Kopfball nach Ecke
            // bekommt so korrekt 'cross' als assistKind statt 'null'.
            const assistFromEvent = ev.passKind
            const assistFromTrack = assistKindByTeam.get(actingTeam) ?? null
            goalAssists.push({
              minute: postState.gameTime,
              playerId: ev.playerId,
              assistKind: assistFromEvent ?? assistFromTrack,
            })
          }
          assistKindByTeam.delete(actingTeam)
        }
      }
    } catch (err) {
      console.error('[arena] AI turn crashed:', err)
    }
    pendingEvent = store.getState().state?.lastEvent ?? null

    // Trajectory-Eintrag mit Reward schreiben (RL-Felder).
    // Funktioniert nur wenn decideBallAction eine LastDecision gesetzt hat
    // (passiert nur bei aktivem Training-Export und mit Ballbesitz).
    if (lastDecision && stateBefore && isTrainingExportActive()) {
      const stateAfter = store.getState().state
      if (stateAfter) {
        const turnEvent = pendingEvent
        const reward = computeStepReward(stateBefore, stateAfter, lastDecision.team, turnEvent)
        // done wird erst beim letzten Turn auf true gesetzt — wir wissen
        // hier noch nicht ob das der letzte ist; wir setzen done=false
        // und korrigieren den finalen Eintrag im Match-Cleanup.
        recordDecision(
          stateBefore, lastDecision.team, lastDecision.carrier,
          lastDecision.options, lastDecision.chosenIndex,
          {
            reward,
            done: false,
            logProb: lastDecision.logProb,
            probs: lastDecision.probs,
          },
        )
      }
    }
    // Wenn sich die Phase während des Turns in eine Set-Piece-Phase
    // geändert hat (Pass ins Aus → corner / throw_in, Foul → free_kick,
    // Foul im 16er → penalty), DARF endCurrentTurn nicht gerufen werden.
    // endTurn würde phase='playing' und lastSetPiece=null setzen, wodurch
    // das Set-Piece komplett verpufft — der Taker hätte den Ball ohne
    // mustPass und würde einfach drauflosdribbeln. Selbe Guard-Logik wie
    // makeExecuteAIAnimated im gameStore.
    const postPhase = store.getState().state?.phase
    const isSetPiecePhase = postPhase === 'corner' || postPhase === 'free_kick'
      || postPhase === 'throw_in' || postPhase === 'kickoff'
      || postPhase === 'penalty'
    if (!isSetPiecePhase) {
      store.getState().endCurrentTurn()
    }
    turn++
  }

  const finalState = store.getState().state
  if (!finalState) throw new Error('match ended without state')

  const stats = buildStats(finalState, boxPresenceTurns)

  // Torschützen aus dem goal-log des States — assistKind aus goalAssists
  // per (minute, playerId) zuordnen (eindeutig bei realistischen Datensätzen).
  const scorers = (finalState.goalLog ?? []).map(g => {
    const assist = goalAssists.find(a => a.minute === g.minute && a.playerId === g.playerId)
    return {
      team: g.team as TeamSide,
      playerId: g.playerId,
      playerName: g.playerName,
      minute: g.minute,
      kind: g.kind,
      assistKind: g.kind === 'penalty' ? null : (assist?.assistKind ?? null),
    }
  })

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

/**
 * Elfmeter (während des Spielflusses) synchron auflösen.
 *
 * gameStore.shootBall() löst Elfmeter über setTimeout auf — in der
 * synchronen Arena-Simulation würde das Ergebnis nie ankommen (Tor
 * verpufft). Deshalb rufen wir hier direkt resolvePenalty() und
 * handleGoalScored() auf und bauen den State selbst.
 */
function autoResolvePenalty(store: typeof useGameStore): { shooterId: string } | null {
  const s = store.getState().state
  const ps = store.getState().penaltyState
  if (!s || !ps) {
    store.getState().endCurrentTurn()
    return null
  }
  const shooter = s.players.find((p: PlayerData) => p.id === ps.shooterId)
  const keeper = s.players.find((p: PlayerData) => p.id === ps.keeperId)
  if (!shooter || !keeper) {
    store.getState().endCurrentTurn()
    return null
  }

  const pickDir = (): PenaltyDirection => {
    const r = Math.random()
    return r < 0.33 ? 'left' : r < 0.66 ? 'center' : 'right'
  }
  const completePs = {
    ...ps,
    shooterChoice: ps.shooterChoice ?? pickDir(),
    keeperChoice: ps.keeperChoice ?? aiChoosePenaltyDirection(),
  }

  const result = resolvePenalty(completePs, shooter, keeper)

  let nextState: GameState = { ...s, lastEvent: result.event }

  if (result.outcome === 'scored') {
    // Torschütze-Stats + goal log, dann handleGoalScored für Kickoff-Setup
    const scoringPlayers = s.players.map((p: PlayerData) =>
      p.id === shooter.id
        ? { ...p, gameStats: { ...p.gameStats, goalsScored: p.gameStats.goalsScored + 1 } }
        : p,
    )
    nextState = { ...nextState, players: scoringPlayers }
    // goalLog-Eintrag hinzufügen (kind: 'penalty')
    const goalLog = [...(nextState.goalLog ?? []), {
      team: completePs.shooterTeam,
      playerId: shooter.id,
      playerName: `${shooter.firstName} ${shooter.lastName}`,
      minute: nextState.gameTime,
      kind: 'penalty' as const,
    }]
    nextState = { ...nextState, goalLog }
    nextState = handleGoalScored(nextState, completePs.shooterTeam)
    nextState = { ...nextState, lastEvent: result.event }
  } else if (result.outcome === 'saved') {
    // Ball prallt ab — Keeper behält ihn effektiv (simplifiziert)
    const keeperStats = s.players.map((p: PlayerData) =>
      p.id === keeper.id
        ? { ...p, gameStats: { ...p.gameStats, saves: p.gameStats.saves + 1 } }
        : p,
    )
    nextState = {
      ...nextState,
      players: keeperStats,
      ball: { position: { ...keeper.position }, ownerId: keeper.id },
      phase: 'playing',
    }
  } else {
    // Verfehlt — Abstoß für verteidigendes Team
    const defTeam: TeamSide = completePs.shooterTeam === 1 ? 2 : 1
    const goalKickY = defTeam === 1 ? 95 : 5
    const goalKickPos = { x: 50, y: goalKickY }
    const goalKickPlayers = s.players.map((p: PlayerData) =>
      p.id === keeper.id
        ? { ...p, position: { ...goalKickPos }, origin: { ...goalKickPos } }
        : p,
    )
    nextState = {
      ...nextState,
      players: goalKickPlayers,
      ball: { position: { ...goalKickPos }, ownerId: keeper.id },
      phase: 'playing',
      currentTurn: defTeam,
      mustPass: true,
      setPieceReady: true,
      lastSetPiece: null,
    }
  }

  store.setState({ state: nextState, penaltyState: null })
  // endCurrentTurn lassen wir NICHT laufen — handleGoalScored hat den
  // Kickoff bereits gesetzt; der nächste Loop-Schritt handled die
  // kickoff/playing-Phase selbst.
  return result.outcome === 'scored' ? { shooterId: shooter.id } : null
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
