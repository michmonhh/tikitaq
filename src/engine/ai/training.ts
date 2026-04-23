/**
 * TIKITAQ AI — Training-Data-Export (ML-Readiness)
 *
 * Zweck: Jede Ballführer-Entscheidung wird als State-Action-Paar im
 * JSONL-Format aufgezeichnet, sodass ein späteres Python-ML-Training
 * auf dieser Datenbasis ein Behavior-Cloning-Modell lernen kann.
 *
 * Format pro Zeile (JSONL):
 * {
 *   "match_id": "BVB-MUC-2026-04-22T...",
 *   "turn": 42,
 *   "team": 1,
 *   "game_time_min": 21.0,
 *   "score": { "team1": 0, "team2": 1 },
 *   "carrier": { "id": "t1-6", "position_label": "ZDM",
 *                "position": [50.2, 62.1], "stats": {...} },
 *   "teammates": [{ "id": "...", "position": [...], ... }, ...],
 *   "opponents": [{ "id": "...", ... }, ...],
 *   "ball": { "position": [50.2, 62.1] },
 *   "intent": { "attack_side": "right", "turns_valid": 3 },
 *   "options": [
 *     { "type": "shoot", "score": 12.3, "success_chance": 0.1,
 *       "reward": 0.9, "target": [50, 0], "receiver_id": null },
 *     { "type": "short_pass", "score": 45.7, "success_chance": 0.85,
 *       "reward": 0.45, "target": [65, 45], "receiver_id": "t1-8" },
 *     ...
 *   ],
 *   "chosen_option_index": 1,
 *   "ai_version": "stage4"
 * }
 *
 * Ein Python-Trainer kann diese Datei einlesen, Features extrahieren
 * (Positionen als Dichte-Map, Optionen als Kandidaten-Pool), und ein
 * Netz lernen lassen, das direkt "wähle Option Nr. k" ausgibt. Die
 * Features sind absichtlich RAW gehalten — der Python-Code macht das
 * Feature-Engineering.
 *
 * Feature-Flag: Export ist per Default AUS. Arena-Script schaltet ihn
 * ein über `initTrainingExport(filename)`. Im Live-Spiel bleibt er aus,
 * um nicht ins Dateisystem zu schreiben.
 */

import type { GameState, TeamSide, PlayerData } from '../types'
import type { BallOption } from './playerDecision/types'
import { getIntent } from './matchIntent'

// ── Feature-Flag + Output-Target ──
//
// Das Engine-Modul kennt keine Dateien — es puffert nur Strings. Der
// Node-seitige Arena-Runner holt sie via drainTrainingBuffer() ab und
// schreibt sie selbst auf die Platte. So bleibt dieses Modul
// browser-kompatibel (kein `fs` in Bundle-Abhängigkeit).

let exportActive = false
let bufferedLines: string[] = []
let currentMatchId: string | null = null

/**
 * Aktiviert Training-Export. Buffer wird beim nächsten Match gefüllt.
 */
export function initTrainingExport(filename: string | null): void {
  exportActive = filename !== null
  bufferedLines = []
  currentMatchId = null
}

/**
 * Setzt die aktuelle Match-ID (wird von runAIMatch gesetzt).
 * Alle folgenden recordDecision-Aufrufe tragen diese ID.
 */
export function setTrainingMatchId(id: string): void {
  currentMatchId = id
}

/**
 * Prüft, ob Training-Export aktiv ist.
 */
export function isTrainingExportActive(): boolean {
  return exportActive
}

/**
 * Gibt gepufferte Zeilen zurück und leert den Puffer. Wird vom
 * Node-seitigen Arena-Runner periodisch aufgerufen, um die Zeilen in
 * die Datei zu schreiben.
 */
export function drainTrainingBuffer(): string[] {
  const out = bufferedLines
  bufferedLines = []
  return out
}

// ── Aufzeichnung ──

export function recordDecision(
  state: GameState,
  team: TeamSide,
  carrier: PlayerData,
  options: BallOption[],
  chosenIndex: number,
): void {
  if (!exportActive) return
  if (!currentMatchId) return

  const intent = getIntent(team)
  const turnIdx = Math.floor(state.gameTime * 2)

  const teammates = state.players.filter(p => p.team === team && p.id !== carrier.id)
  const opponents = state.players.filter(p => p.team !== team)

  const record = {
    match_id: currentMatchId,
    turn: turnIdx,
    team,
    game_time_min: state.gameTime,
    score: { ...state.score },
    carrier: serializePlayer(carrier),
    teammates: teammates.map(serializePlayer),
    opponents: opponents.map(serializePlayer),
    ball: { position: [state.ball.position.x, state.ball.position.y] },
    intent: intent ? {
      attack_side: intent.attackSide,
      turns_valid: Math.max(0, intent.validUntilTurn - turnIdx),
    } : null,
    options: options.map(serializeOption),
    chosen_option_index: chosenIndex,
    ai_version: 'stage4',
  }

  bufferedLines.push(JSON.stringify(record))
}

function serializePlayer(p: PlayerData) {
  return {
    id: p.id,
    position_label: p.positionLabel,
    position: [p.position.x, p.position.y],
    origin: [p.origin.x, p.origin.y],
    stats: {
      pacing: p.stats.pacing,
      dribbling: p.stats.dribbling,
      shortPassing: p.stats.shortPassing,
      highPassing: p.stats.highPassing,
      tackling: p.stats.tackling,
      shooting: p.stats.shooting,
      defensiveRadius: p.stats.defensiveRadius,
      ballShielding: p.stats.ballShielding,
      quality: p.stats.quality,
    },
    fitness: p.fitness,
    confidence: p.confidence,
  }
}

function serializeOption(o: BallOption) {
  return {
    type: o.type,
    score: +o.score.toFixed(3),
    success_chance: +o.successChance.toFixed(3),
    reward: +o.reward.toFixed(3),
    target: [+o.target.x.toFixed(2), +o.target.y.toFixed(2)],
    receiver_id: o.receiverId ?? null,
  }
}

/**
 * Ende eines Matches signalisieren. Der Node-Runner ruft danach
 * drainTrainingBuffer() auf, um die Zeilen in die Datei zu schreiben.
 */
export function endTrainingMatch(): void {
  currentMatchId = null
}
