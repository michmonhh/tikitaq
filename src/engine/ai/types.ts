/**
 * TIKITAQ AI — Typdefinitionen
 *
 * Alle Typen für das Drei-Schichten-Modell:
 * 1. Mannschaftsplan (TeamPlan)
 * 2. Spielerentscheidung (kommt später)
 * 3. Positionierung (kommt später)
 * Plus: Memory-Service
 */

// ══════════════════════════════════════════
//  Strategien
// ══════════════════════════════════════════

/** Defensivstrategie: wie verteidigt die Mannschaft? */
export type DefenseStrategy =
  | 'high_press'    // Angriffspressing ab Torwart
  | 'mid_press'     // Mittelfeldpressing
  | 'deep_block'    // Tiefer Abwehrblock
  | 'man_marking'   // Manndeckung über das ganze Feld

/** Offensivstrategie: wie greift die Mannschaft an? */
export type AttackStrategy =
  | 'possession'    // Kurze Pässe, Gegner einschnüren
  | 'counter'       // Locken und Konter
  | 'wing_play'     // Über die Flügel, 1v1
  | 'switch_play'   // Spielverlagerung, Breite nutzen
  | 'direct'        // Lange Bälle, zweite Bälle

/** Übergangsverhalten direkt nach Ballverlust */
export type TransitionBehavior =
  | 'gegenpress'    // Sofort nachrücken, Ball zurückerobern
  | 'fall_back'     // Zurück in Formation

// ══════════════════════════════════════════
//  Mannschaftsidentität
// ══════════════════════════════════════════

/** Selbstbild und Selbstvertrauen einer Mannschaft */
export interface TeamIdentity {
  selfImage: number       // 0-100: Underdog(25) → Spitze(90)
  confidence: number      // 0-100: dynamisch, startet bei selfImage
  confidenceMax: number   // Obergrenze (weitet sich bei Dominanz)
  confidenceMin: number   // Untergrenze (weitet sich bei Zusammenbruch)
}

/** Stärkenvergleich mit dem Gegner, alle Werte -1 bis +1 */
export interface StrengthComparison {
  pace: number            // Tempo-Vorteil (eigene Angreifer vs. Gegner-Verteidiger)
  passing: number         // Pass-Vorteil (eigenes Mittelfeld vs. Gegner)
  defense: number         // Defensiv-Vorteil (eigene Abwehr vs. Gegner-Angriff)
  attack: number          // Offensiv-Vorteil (eigener Angriff vs. Gegner-Abwehr)
  overall: number         // Gesamtvorteil

  // Abgeleitete Erkenntnisse
  opponentHasFastAttack: boolean  // Gegner hat schnelle Stürmer/Flügel
  ownDefenseIsFast: boolean       // Eigene Abwehr kann Tempo mitgehen
  ownPassingStrong: boolean       // Eigenes Mittelfeld passsicher
  ownWingsStrong: boolean         // Starke Flügelspieler (Pace + Dribbling)
  opponentHasStarPlayer: boolean  // Gegner hat 1-2 herausragende Spieler
}

/** Events die das Selbstvertrauen verändern */
export type ConfidenceEvent =
  | 'goal_scored'       // +12
  | 'goal_conceded'     // -12
  | 'pass_complete'     // +0.3
  | 'pass_failed'       // -0.8
  | 'tackle_won'        // +1.5
  | 'tackle_lost'       // -1.5
  | 'save'              // +2
  | 'possession_turn'   // +0.2

// ══════════════════════════════════════════
//  Mannschaftsplan
// ══════════════════════════════════════════

/** Eine bewertete Strategie-Kombination */
export interface StrategyCombo {
  defense: DefenseStrategy
  attack: AttackStrategy
  transition: TransitionBehavior
  score: number           // Bewertung (höher = besser)
  reason: string          // Klartext-Begründung für Ticker/UI
}

/** Der vollständige Mannschaftsplan */
export interface TeamPlan {
  identity: TeamIdentity
  strength: StrengthComparison
  strategy: StrategyCombo
  riskAppetite: number    // 0-1: confidence / 100
}

// ══════════════════════════════════════════
//  Räumliche Feldanalyse (5×5 Raster)
// ══════════════════════════════════════════

/**
 * 5×5 Raster des Spielfelds:
 *
 * Zeilen (vertikal, vom eigenen zum gegnerischen Tor):
 *   0 = eigenes Tor-Drittel
 *   1 = eigene Hälfte
 *   2 = Mittelzone
 *   3 = gegnerische Hälfte
 *   4 = gegnerisches Tor-Drittel
 *
 * Spalten (horizontal):
 *   0 = ganz links (0-20)
 *   1 = links (20-40)
 *   2 = zentral (40-60)
 *   3 = rechts (60-80)
 *   4 = ganz rechts (80-100)
 */
export interface FieldReading {
  opponentGrid: number[][]   // [5][5]: Gegner pro Zone
  ownGrid: number[][]        // [5][5]: eigene Spieler pro Zone

  // Abgeleitete taktische Erkenntnisse
  weakSide: 'left' | 'right' | 'none'
  centralCongestion: number  // 0-1: wie überfüllt ist das Zentrum
  gapBetweenLines: number    // Abstand Gegner-Abwehr ↔ Gegner-Mittelfeld (in %)
  opponentHighLine: boolean  // Gegner-Abwehr steht hoch
  opponentCompact: boolean   // Gegner-Linien eng zusammen
  attackDirection: 'left' | 'center' | 'right'  // Empfohlene Angriffsrichtung
}

// ══════════════════════════════════════════
//  Memory-Service
// ══════════════════════════════════════════

/** Ein einzelner Muster-Eintrag im Gedächtnis */
export interface PatternRecord {
  success: number     // Anzahl Erfolge
  failure: number     // Anzahl Misserfolge
  trend: number       // -1 bis +1, rollender Durchschnitt
}

/** Match-Gedächtnis (wird pro Spiel zurückgesetzt) */
export interface MatchMemory {
  patterns: Map<string, PatternRecord>
}

/** Persistentes Wissen aus AI-vs-AI Training (später befüllt) */
export interface Knowledge {
  strategyHints: Map<string, number>  // "deep_block_vs_fast" → winrate
}

// ══════════════════════════════════════════
//  Muster-Konstanten
// ══════════════════════════════════════════

/** Vordefinierte Muster-Namen für das Gedächtnis */
export const PATTERNS = {
  // Pass-Richtung
  PASS_LEFT: 'pass_left',
  PASS_CENTER: 'pass_center',
  PASS_RIGHT: 'pass_right',
  // Pass-Distanz
  PASS_SHORT: 'pass_short',
  PASS_LONG: 'pass_long',
  // Angriffsseite
  ATTACK_LEFT: 'attack_left',
  ATTACK_CENTER: 'attack_center',
  ATTACK_RIGHT: 'attack_right',
  // Pressing
  PRESS_HIGH: 'press_high',
  PRESS_MID: 'press_mid',
  // Spielzüge
  COUNTER: 'counter',
  THROUGH_BALL: 'through_ball',
  CROSS: 'cross',
} as const
