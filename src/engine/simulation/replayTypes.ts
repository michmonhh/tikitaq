/**
 * Replay- und Arena-Stats-Typen.
 *
 * ReplaySnapshot: ein Zustands-Schnappschuss vor jedem KI-Zug.
 * ArenaStats: aggregierte Match-Statistiken (erweitert state.matchStats um
 *   abgeleitete Werte wie Box-Präsenz in % und Ballbesitz in %).
 * ArenaMatchResult: Ergebnis eines einzelnen Arena-Matches.
 */

import type { GameState, TeamSide } from '../types'

// ══════════════════════════════════════════
//  Replay
// ══════════════════════════════════════════

/**
 * Vollständiger Snapshot eines Turns. Enthält den kompletten `GameState`
 * zum Zeitpunkt des Turn-Starts, damit der Replay-Viewer dieselben Renderer
 * nutzen kann wie der Live-Match-Screen. Änderungen an der Match-Darstellung
 * ziehen automatisch ins Replay mit.
 */
export interface ReplaySnapshot {
  /** Turn-Nummer (monoton steigend, beginnt bei 0). */
  turn: number
  /** Der komplette Spielzustand. Tief-Kopie vom Live-State, immutable. */
  state: GameState
  /** KI-Reasoning pro Spieler (optional, für Overlays). */
  reasoning?: Record<string, string>
}

/** Kompletter Replay einer Partie. */
export interface ReplayFile {
  /** Schema-Version, falls wir das Format später erweitern. */
  version: 1
  /** ISO-Zeitstempel der Aufzeichnung. */
  recordedAt: string
  /** Heim- und Auswärts-Team-ID. */
  homeId: number
  awayId: number
  /** Endergebnis. */
  finalScore: { team1: number; team2: number }
  /** Eindeutige Replay-ID (z.B. `${homeId}-${awayId}-${timestamp}`). */
  id: string
  /** Die Snapshots. */
  snapshots: ReplaySnapshot[]
}

// ══════════════════════════════════════════
//  Arena-Stats
// ══════════════════════════════════════════

/** Per-Team-Statistiken eines Matches. */
export interface ArenaTeamStats {
  goals: number
  xG: number
  shotsOnTarget: number
  shotsOff: number
  passesTotal: number
  passesCompleted: number
  /** Pass-Genauigkeit in % (0–100). */
  passAccuracy: number
  tacklesWon: number
  tacklesLost: number
  fouls: number
  yellowCards: number
  redCards: number
  corners: number
  /** Anzahl Turns dieses Teams. */
  turns: number
  /** Turns mit Ballbesitz. */
  possessionTurns: number
  /** Ballbesitz in % (0–100). */
  possessionPercent: number
  /** Turns mit ≥1 eigenem Spieler im gegnerischen Strafraum (16m). */
  boxPresenceTurns: number
  /** Box-Präsenz in % eigener Turns (0–100). */
  boxPresencePercent: number
  /** Zurückgelegte Gesamtdistanz aller Feldspieler. */
  distanceCovered: number
}

/** Ergebnis eines Arena-Matches. */
export interface ArenaMatchResult {
  homeId: number
  awayId: number
  /** Finale Score. team1 = home, team2 = away. */
  score: { team1: number; team2: number }
  /** Gewinner oder null bei Unentschieden. */
  winner: TeamSide | null
  /** Statistiken. */
  stats: { team1: ArenaTeamStats; team2: ArenaTeamStats }
  /** Torschützen mit Minute. */
  scorers: Array<{
    team: TeamSide
    playerId: string
    playerName: string
    minute: number
    kind: 'open_play' | 'penalty' | 'own_goal'
    /** Art des letzten Passes VOR dem Tor (null wenn Alleingang / Elfmeter). */
    assistKind?: 'short_pass' | 'long_ball' | 'through_ball' | 'cross' | null
  }>
  /** Echtzeit-Dauer der Simulation in ms. */
  simDurationMs: number
  /** Optionaler Replay (nur wenn beim Start angefordert). */
  replay?: ReplayFile
}

/** Aggregat über viele Arena-Matches. */
export interface ArenaAggregate {
  matches: number
  wins: { team1: number; team2: number; draws: number }
  goalsPerMatch: { team1: number; team2: number }
  xGPerMatch: { team1: number; team2: number }
  possessionPercent: { team1: number; team2: number }
  passAccuracy: { team1: number; team2: number }
  boxPresencePercent: { team1: number; team2: number }
  shotsPerMatch: { team1: number; team2: number }
}
