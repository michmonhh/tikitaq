/**
 * TIKITAQ AI — Räumliche Feldanalyse
 *
 * Liest die tatsächlichen Spielerpositionen und teilt das Feld in ein 5x5 Raster.
 * Daraus werden taktische Erkenntnisse abgeleitet:
 * - Schwache Seite (wenig Gegner)
 * - Zentrale Verdichtung
 * - Lücke zwischen Abwehr und Mittelfeld
 * - Gegner steht hoch / kompakt
 * - Empfohlene Angriffsrichtung
 */

import type { GameState, TeamSide, PlayerData } from '../types'
import type { FieldReading } from './types'

// ══════════════════════════════════════════
//  5×5 Raster-Konfiguration
// ══════════════════════════════════════════

/**
 * Zeilen (vertikal, immer aus Sicht des analysierenden Teams):
 *   0 = eigenes Tor-Drittel
 *   1 = eigene Hälfte
 *   2 = Mittelzone
 *   3 = gegnerische Hälfte
 *   4 = gegnerisches Tor-Drittel
 *
 * Spalten (horizontal):
 *   0 = ganz links  (0–20)
 *   1 = links        (20–40)
 *   2 = zentral      (40–60)
 *   3 = rechts       (60–80)
 *   4 = ganz rechts  (80–100)
 */

const COL_EDGES = [0, 20, 40, 60, 80, 100]

// Team 1 verteidigt unten (y=100), greift oben an (y=0)
// → eigenes Tor-Drittel = y 80-100, gegnerisches = y 0-20
const ROW_EDGES_TEAM1 = [100, 80, 60, 40, 20, 0]  // absteigend

// Team 2 verteidigt oben (y=0), greift unten an (y=100)
// → eigenes Tor-Drittel = y 0-20, gegnerisches = y 80-100
const ROW_EDGES_TEAM2 = [0, 20, 40, 60, 80, 100]  // aufsteigend

// ══════════════════════════════════════════
//  Hauptfunktion
// ══════════════════════════════════════════

/** Liest das Spielfeld und gibt taktische Erkenntnisse zurück */
export function readField(state: GameState, team: TeamSide): FieldReading {
  const ownPlayers = state.players.filter(p => p.team === team)
  const opponents = state.players.filter(p => p.team !== team)
  const rowEdges = team === 1 ? ROW_EDGES_TEAM1 : ROW_EDGES_TEAM2

  // Raster zählen
  const opponentGrid = createGrid()
  const ownGrid = createGrid()

  for (const opp of opponents) {
    const [row, col] = toGridCell(opp.position.x, opp.position.y, rowEdges)
    opponentGrid[row][col]++
  }
  for (const own of ownPlayers) {
    const [row, col] = toGridCell(own.position.x, own.position.y, rowEdges)
    ownGrid[row][col]++
  }

  // Taktische Erkenntnisse ableiten
  const weakSide = findWeakSide(opponentGrid)
  const centralCongestion = calcCentralCongestion(opponentGrid, opponents.length)
  const gapBetweenLines = calcGapBetweenLines(opponents, team)
  const opponentHighLine = checkHighLine(opponents, team)
  const opponentCompact = gapBetweenLines < 15
  const attackDirection = chooseAttackDirection(weakSide, centralCongestion)

  return {
    opponentGrid,
    ownGrid,
    weakSide,
    centralCongestion,
    gapBetweenLines,
    opponentHighLine,
    opponentCompact,
    attackDirection,
  }
}

// ══════════════════════════════════════════
//  Hilfsfunktionen
// ══════════════════════════════════════════

function createGrid(): number[][] {
  return Array.from({ length: 5 }, () => Array(5).fill(0))
}

/** Ordnet eine Position (x, y) einer Rasterzelle [row, col] zu */
function toGridCell(x: number, y: number, rowEdges: number[]): [number, number] {
  const col = clampIndex(Math.floor(x / 20), 0, 4)

  // Zeile bestimmen: rowEdges[i] → rowEdges[i+1]
  let row = 2  // default: Mittelzone
  for (let i = 0; i < 5; i++) {
    const lo = Math.min(rowEdges[i], rowEdges[i + 1])
    const hi = Math.max(rowEdges[i], rowEdges[i + 1])
    if (y >= lo && y < hi) {
      row = i
      break
    }
  }
  // Randfall: y === 100 (oder 0) → letzte/erste Zeile
  if (y >= 100) row = rowEdges[0] === 100 ? 0 : 4
  if (y <= 0) row = rowEdges[0] === 0 ? 0 : 4

  return [row, col]
}

/** Findet die Seite mit weniger Gegnern in Mittelfeld + Abwehr (Zeilen 1-3) */
function findWeakSide(oppGrid: number[][]): 'left' | 'right' | 'none' {
  let leftCount = 0
  let rightCount = 0

  for (let row = 1; row <= 3; row++) {
    leftCount += oppGrid[row][0] + oppGrid[row][1]
    rightCount += oppGrid[row][3] + oppGrid[row][4]
  }

  const diff = rightCount - leftCount
  if (diff >= 2) return 'left'   // Rechts mehr Gegner → links ist schwach
  if (diff <= -2) return 'right'  // Links mehr Gegner → rechts ist schwach
  return 'none'
}

/** Berechnet die zentrale Verdichtung (0-1) */
function calcCentralCongestion(oppGrid: number[][], totalOpponents: number): number {
  if (totalOpponents === 0) return 0

  // Zählt Gegner in Spalten 1-3 (Mitte) der Zeilen 1-3 (Mittelfeld/Abwehr)
  let centralCount = 0
  for (let row = 1; row <= 3; row++) {
    centralCount += oppGrid[row][1] + oppGrid[row][2] + oppGrid[row][3]
  }

  return Math.min(1, centralCount / Math.max(1, totalOpponents))
}

/** Berechnet den Abstand zwischen Gegner-Abwehrlinie und Gegner-Mittelfeldlinie (in %) */
function calcGapBetweenLines(opponents: PlayerData[], team: TeamSide): number {
  // Gegner-Verteidiger und -Mittelfeldspieler identifizieren
  const defLabels = ['IV', 'LV', 'RV']
  const midLabels = ['ZDM', 'LM', 'RM', 'OM']

  const defenders = opponents.filter(p => defLabels.includes(p.positionLabel))
  const midfielders = opponents.filter(p => midLabels.includes(p.positionLabel))

  if (defenders.length === 0 || midfielders.length === 0) return 20  // Standardwert

  const defAvgY = defenders.reduce((s, p) => s + p.position.y, 0) / defenders.length
  const midAvgY = midfielders.reduce((s, p) => s + p.position.y, 0) / midfielders.length

  // Abstand ist immer positiv (Mittelfeld liegt zwischen Verteidigung und eigenem Tor)
  return Math.abs(defAvgY - midAvgY)
}

/** Prüft ob die Gegner-Abwehr hoch steht */
function checkHighLine(opponents: PlayerData[], team: TeamSide): boolean {
  const defenders = opponents.filter(p => ['IV', 'LV', 'RV'].includes(p.positionLabel))
  if (defenders.length === 0) return false

  const defAvgY = defenders.reduce((s, p) => s + p.position.y, 0) / defenders.length

  // Team 1 greift Richtung y=0 an → Gegner-Abwehr „hoch" = Gegner-Verteidiger weit von deren Tor (y=0) weg
  // → defAvgY > 40 heißt: Gegner steht hoch
  if (team === 1) return defAvgY > 40
  // Team 2 greift Richtung y=100 an → Gegner-Abwehr hoch = Gegner weit von y=100 weg
  // → defAvgY < 60 heißt: Gegner steht hoch
  return defAvgY < 60
}

/** Wählt die empfohlene Angriffsrichtung */
function chooseAttackDirection(
  weakSide: 'left' | 'right' | 'none',
  centralCongestion: number,
): 'left' | 'center' | 'right' {
  // Schwache Seite bevorzugen
  if (weakSide === 'left') return 'left'
  if (weakSide === 'right') return 'right'

  // Bei wenig zentraler Verdichtung: durchs Zentrum
  if (centralCongestion < 0.4) return 'center'

  // Sonst zufällig links oder rechts
  return Math.random() < 0.5 ? 'left' : 'right'
}

function clampIndex(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
