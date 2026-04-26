import type { PlayerData, TeamSide, PlayerStats, PlayerGameStats, FormationType } from './types'
import { PLAYER_DEFAULTS } from './constants'
import type { PlayerTemplate } from '../data/players'
import { getEffectiveRoster } from '../data/teamOverrides'

// ══════════════════════════════════════════════════════════════════
//  Formations-System
// ══════════════════════════════════════════════════════════════════
//
// Jede Formation definiert 11 Slots. Slots haben positionLabel + Basis-
// Koordinate (in Underdog-Stellung) + Push (vertikaler Vorwärtsschub bei
// hohem Selbstvertrauen) + xSpread (laterale Ausbreitung bei Selbstvertrauen).
//
// Y-Konvention: y=0 ist gegnerisches Tor, y=100 ist eigenes Tor.
// Confidence-Faktor `cf` ∈ [0.15, 0.95] aus startConfidence/100:
//   y_final = max(yFloor, slot.y - slot.push * cf)
//   x_final = slot.x + (slot.x < 50 ? -xSpread : +xSpread) * cf

export interface FormationSlot {
  positionLabel: string
  x: number
  y: number
  push: number
  xSpread: number
}

// FormationType wird in src/engine/types.ts definiert (Domain-Typ)

// ─── 4-3-3 (Klassisch, ausgeglichen) ─────────────────────────
export const FORMATION_433: FormationSlot[] = [
  { positionLabel: 'TW',  x: 50, y: 93, push: 20, xSpread: 0 },
  { positionLabel: 'LV',  x: 22, y: 82, push: 40, xSpread: 12 },
  { positionLabel: 'IV',  x: 42, y: 84, push: 40, xSpread: 4 },
  { positionLabel: 'IV',  x: 58, y: 84, push: 40, xSpread: 4 },
  { positionLabel: 'RV',  x: 78, y: 82, push: 40, xSpread: 12 },
  { positionLabel: 'ZDM', x: 50, y: 72, push: 18, xSpread: 0 },
  { positionLabel: 'LM',  x: 25, y: 66, push: 20, xSpread: 12 },
  { positionLabel: 'RM',  x: 75, y: 66, push: 20, xSpread: 12 },
  { positionLabel: 'OM',  x: 50, y: 62, push: 10, xSpread: 0 },
  { positionLabel: 'ST',  x: 40, y: 56, push: 8,  xSpread: 8 },
  { positionLabel: 'ST',  x: 60, y: 56, push: 8,  xSpread: 8 },
]

// ─── 4-2-3-1 (Modernes Pressing-System) ──────────────────────
// 2 ZDMs als Doppel-Sechs, 3 Offensive Mids hinter 1 ST.
export const FORMATION_4231: FormationSlot[] = [
  { positionLabel: 'TW',  x: 50, y: 93, push: 20, xSpread: 0 },
  { positionLabel: 'LV',  x: 22, y: 82, push: 38, xSpread: 12 },
  { positionLabel: 'IV',  x: 42, y: 84, push: 40, xSpread: 4 },
  { positionLabel: 'IV',  x: 58, y: 84, push: 40, xSpread: 4 },
  { positionLabel: 'RV',  x: 78, y: 82, push: 38, xSpread: 12 },
  { positionLabel: 'ZDM', x: 42, y: 72, push: 14, xSpread: 4 },
  { positionLabel: 'ZDM', x: 58, y: 72, push: 14, xSpread: 4 },
  { positionLabel: 'LM',  x: 25, y: 62, push: 20, xSpread: 12 },
  { positionLabel: 'OM',  x: 50, y: 60, push: 12, xSpread: 0 },
  { positionLabel: 'RM',  x: 75, y: 62, push: 20, xSpread: 12 },
  { positionLabel: 'ST',  x: 50, y: 54, push: 8,  xSpread: 0 },
]

// ─── 4-4-2 (Klassische Doppel-Achterreihe) ───────────────────
// Flache Vier im Mittelfeld, 2 Stürmer.
export const FORMATION_442: FormationSlot[] = [
  { positionLabel: 'TW',  x: 50, y: 93, push: 20, xSpread: 0 },
  { positionLabel: 'LV',  x: 22, y: 82, push: 38, xSpread: 12 },
  { positionLabel: 'IV',  x: 42, y: 84, push: 40, xSpread: 4 },
  { positionLabel: 'IV',  x: 58, y: 84, push: 40, xSpread: 4 },
  { positionLabel: 'RV',  x: 78, y: 82, push: 38, xSpread: 12 },
  { positionLabel: 'LM',  x: 22, y: 68, push: 18, xSpread: 12 },
  { positionLabel: 'ZDM', x: 42, y: 70, push: 16, xSpread: 4 },
  { positionLabel: 'ZDM', x: 58, y: 70, push: 16, xSpread: 4 },
  { positionLabel: 'RM',  x: 78, y: 68, push: 18, xSpread: 12 },
  { positionLabel: 'ST',  x: 40, y: 56, push: 8,  xSpread: 8 },
  { positionLabel: 'ST',  x: 60, y: 56, push: 8,  xSpread: 8 },
]

// ─── 3-5-2 (Wing-Backs, dichte Mitte) ────────────────────────
// 3 Innenverteidiger, LM/RM als hochstehende Wing-Backs, 2 ZDMs +
// 1 OM in der Mitte, 2 Stürmer.
export const FORMATION_352: FormationSlot[] = [
  { positionLabel: 'TW',  x: 50, y: 93, push: 20, xSpread: 0 },
  { positionLabel: 'IV',  x: 32, y: 86, push: 38, xSpread: 6 },
  { positionLabel: 'IV',  x: 50, y: 86, push: 38, xSpread: 0 },
  { positionLabel: 'IV',  x: 68, y: 86, push: 38, xSpread: 6 },
  { positionLabel: 'LM',  x: 18, y: 70, push: 22, xSpread: 12 },
  { positionLabel: 'ZDM', x: 42, y: 72, push: 16, xSpread: 4 },
  { positionLabel: 'OM',  x: 50, y: 64, push: 12, xSpread: 0 },
  { positionLabel: 'ZDM', x: 58, y: 72, push: 16, xSpread: 4 },
  { positionLabel: 'RM',  x: 82, y: 70, push: 22, xSpread: 12 },
  { positionLabel: 'ST',  x: 42, y: 56, push: 8,  xSpread: 6 },
  { positionLabel: 'ST',  x: 58, y: 56, push: 8,  xSpread: 6 },
]

// ─── 4-1-4-1 (Defensiver Block mit 6er-Anker) ────────────────
// 1 ZDM als Sechs, dahinter 4 Mids in flacher Linie, 1 Stürmer.
export const FORMATION_4141: FormationSlot[] = [
  { positionLabel: 'TW',  x: 50, y: 93, push: 20, xSpread: 0 },
  { positionLabel: 'LV',  x: 22, y: 82, push: 36, xSpread: 12 },
  { positionLabel: 'IV',  x: 42, y: 84, push: 38, xSpread: 4 },
  { positionLabel: 'IV',  x: 58, y: 84, push: 38, xSpread: 4 },
  { positionLabel: 'RV',  x: 78, y: 82, push: 36, xSpread: 12 },
  { positionLabel: 'ZDM', x: 50, y: 74, push: 14, xSpread: 0 },
  { positionLabel: 'LM',  x: 22, y: 66, push: 18, xSpread: 12 },
  { positionLabel: 'ZM',  x: 42, y: 66, push: 16, xSpread: 4 },
  { positionLabel: 'ZM',  x: 58, y: 66, push: 16, xSpread: 4 },
  { positionLabel: 'RM',  x: 78, y: 66, push: 18, xSpread: 12 },
  { positionLabel: 'ST',  x: 50, y: 56, push: 8,  xSpread: 0 },
]

// ─── 5-3-2 (Tiefer Block, defensiv-orientiert) ───────────────
// 5 Verteidiger (LV-IV-IV-IV-RV), 3 Mids, 2 Stürmer als Konter-Anker.
export const FORMATION_532: FormationSlot[] = [
  { positionLabel: 'TW',  x: 50, y: 93, push: 18, xSpread: 0 },
  { positionLabel: 'LV',  x: 18, y: 82, push: 30, xSpread: 8 },
  { positionLabel: 'IV',  x: 36, y: 84, push: 32, xSpread: 4 },
  { positionLabel: 'IV',  x: 50, y: 84, push: 32, xSpread: 0 },
  { positionLabel: 'IV',  x: 64, y: 84, push: 32, xSpread: 4 },
  { positionLabel: 'RV',  x: 82, y: 82, push: 30, xSpread: 8 },
  { positionLabel: 'ZDM', x: 38, y: 72, push: 14, xSpread: 4 },
  { positionLabel: 'OM',  x: 50, y: 66, push: 12, xSpread: 0 },
  { positionLabel: 'ZDM', x: 62, y: 72, push: 14, xSpread: 4 },
  { positionLabel: 'ST',  x: 42, y: 56, push: 8,  xSpread: 6 },
  { positionLabel: 'ST',  x: 58, y: 56, push: 8,  xSpread: 6 },
]

// ─── 3-4-1-2 (Diamant mit 3er-Kette) ─────────────────────────
// 3 Innenverteidiger, 2 Wing-Backs (LM/RM), 2 ZDMs, 1 OM, 2 Stürmer.
export const FORMATION_3412: FormationSlot[] = [
  { positionLabel: 'TW',  x: 50, y: 93, push: 20, xSpread: 0 },
  { positionLabel: 'IV',  x: 32, y: 86, push: 36, xSpread: 6 },
  { positionLabel: 'IV',  x: 50, y: 86, push: 36, xSpread: 0 },
  { positionLabel: 'IV',  x: 68, y: 86, push: 36, xSpread: 6 },
  { positionLabel: 'LM',  x: 20, y: 70, push: 22, xSpread: 12 },
  { positionLabel: 'ZDM', x: 40, y: 72, push: 16, xSpread: 4 },
  { positionLabel: 'ZDM', x: 60, y: 72, push: 16, xSpread: 4 },
  { positionLabel: 'RM',  x: 80, y: 70, push: 22, xSpread: 12 },
  { positionLabel: 'OM',  x: 50, y: 62, push: 12, xSpread: 0 },
  { positionLabel: 'ST',  x: 42, y: 56, push: 8,  xSpread: 6 },
  { positionLabel: 'ST',  x: 58, y: 56, push: 8,  xSpread: 6 },
]

// ─── Lookup ─────────────────────────────────────────────────
export const FORMATIONS: Record<FormationType, FormationSlot[]> = {
  '4-3-3':   FORMATION_433,
  '4-2-3-1': FORMATION_4231,
  '4-4-2':   FORMATION_442,
  '3-5-2':   FORMATION_352,
  '4-1-4-1': FORMATION_4141,
  '5-3-2':   FORMATION_532,
  '3-4-1-2': FORMATION_3412,
}

export const ALL_FORMATIONS: FormationType[] = [
  '4-3-3', '4-2-3-1', '4-4-2', '3-5-2', '4-1-4-1', '5-3-2', '3-4-1-2',
]

/** Gibt die Slot-Definition einer Formation zurück. */
export function getFormationSlots(formation: FormationType): FormationSlot[] {
  return FORMATIONS[formation]
}

// ══════════════════════════════════════════════════════════════════
//  Roster-zu-Slot-Mapping
// ══════════════════════════════════════════════════════════════════
//
// Roster ist ein Pool von ~22 Spielern mit positionLabel-Tags. Eine
// Formation erfordert einen spezifischen Mix von Slots. Wir wählen pro
// Slot den "passendsten" verfügbaren Spieler aus dem Roster:
//
//   1. Exakter Match (positionLabel == slot.positionLabel) — höchste
//      Quality im Pool gewinnt.
//   2. Kompatibler Match falls keine exakten verfügbar:
//      ZDM ↔ ZM, OM → ZM, LM ↔ LV, RM ↔ RV (Notfall).
//   3. Fallback: höchste Quality übrig, label egal.
//
// Bereits zugewiesene Spieler werden aus dem Pool entfernt.

const COMPATIBLE_LABELS: Record<string, string[]> = {
  TW:  [],
  LV:  ['LM', 'IV'],
  IV:  ['ZDM'],
  RV:  ['RM', 'IV'],
  ZDM: ['ZM', 'IV'],
  ZM:  ['ZDM', 'OM'],
  LM:  ['LV', 'OM'],
  RM:  ['RV', 'OM'],
  OM:  ['ZM', 'ST'],
  ST:  ['OM'],
}

interface RosterEntry {
  template: PlayerTemplate
  rosterIndex: number   // Index im ursprünglichen Roster (für Bench-Kennung)
  used: boolean
}

function pickForSlot(pool: RosterEntry[], slotLabel: string): RosterEntry | null {
  // 1. Exakter Match — höchste Quality
  const exact = pool
    .filter(e => !e.used && e.template.positionLabel === slotLabel)
    .sort((a, b) => b.template.stats.quality - a.template.stats.quality)
  if (exact.length > 0) return exact[0]

  // 2. Kompatibel
  const compatible = COMPATIBLE_LABELS[slotLabel] ?? []
  for (const altLabel of compatible) {
    const match = pool
      .filter(e => !e.used && e.template.positionLabel === altLabel)
      .sort((a, b) => b.template.stats.quality - a.template.stats.quality)
    if (match.length > 0) return match[0]
  }

  // 3. Fallback: höchste Quality übrig (kein TW als Notfall-Feldspieler)
  const fallback = pool
    .filter(e => !e.used && e.template.positionLabel !== 'TW')
    .sort((a, b) => b.template.stats.quality - a.template.stats.quality)
  return fallback[0] ?? null
}

// ══════════════════════════════════════════════════════════════════
//  Spieler-Erzeugung
// ══════════════════════════════════════════════════════════════════

function mirrorY(y: number): number {
  return 100 - y
}

function defaultStats(): PlayerStats {
  return { ...PLAYER_DEFAULTS } as unknown as PlayerStats
}

function emptyGameStats(): PlayerGameStats {
  return {
    passes: 0,
    tacklesWon: 0,
    tacklesLost: 0,
    goalsScored: 0,
    saves: 0,
    conceded: 0,
  }
}

function createPlayer(
  team: TeamSide,
  index: number,
  slot: FormationSlot,
  template: PlayerTemplate | undefined,
  confFactor: number,
  startConfidence: number,
): PlayerData {
  const xOffset = slot.x < 50 ? -slot.xSpread * confFactor
                : slot.x > 50 ?  slot.xSpread * confFactor : 0
  const baseX = Math.max(3, Math.min(97, slot.x + xOffset))
  const x = team === 1 ? baseX : 100 - baseX
  const baseY = Math.max(50, slot.y - slot.push * confFactor)
  const y = team === 1 ? baseY : mirrorY(baseY)
  const pos = { x, y }

  return {
    id: `t${team}-${index}`,
    team,
    positionLabel: slot.positionLabel,  // Slot-Label, nicht Roster-Label
    firstName: template?.firstName ?? '',
    lastName: template?.lastName ?? '',
    position: { ...pos },
    origin: { ...pos },
    formationSlot: {
      x: slot.x,
      y: slot.y,
      push: slot.push,
      xSpread: slot.xSpread,
    },
    stats: template?.stats ?? defaultStats(),
    gameStats: emptyGameStats(),
    fitness: 100,
    confidence: startConfidence,
    hasActed: false,
    hasMoved: false,
    hasPassed: false,
    hasReceivedPass: false,
    tackleLocked: false,
    cannotTackle: false,
  }
}

/** Durchschnittsqualität der TOP 11 Spieler (für Stärke-Vergleich). */
function avgQualityTop11(roster?: PlayerTemplate[]): number {
  if (!roster || roster.length === 0) return 70
  const sorted = [...roster].sort((a, b) => b.stats.quality - a.stats.quality)
  const top11 = sorted.slice(0, 11)
  return top11.reduce((s, p) => s + p.stats.quality, 0) / top11.length
}

function calcStartConfidence(ownAvg: number, oppAvg: number): number {
  const base = 60
  const diff = ownAvg - oppAvg
  const shift = Math.max(-15, Math.min(15, diff * 0.65))
  const ownBoost = (ownAvg - 70) * 0.4
  return Math.max(25, Math.min(80, base + shift + ownBoost))
}

function confidenceFactor(startConf: number): number {
  return Math.max(0.15, Math.min(0.95, startConf / 100))
}

// ══════════════════════════════════════════════════════════════════
//  Match-Aufstellung erzeugen
// ══════════════════════════════════════════════════════════════════
//
// `formation1` und `formation2` bestimmen die Aufstellung pro Team. Wenn
// undefined, wird '4-3-3' als Default verwendet (Backwards-Compat).

export interface BenchEntry {
  template: PlayerTemplate
  rosterIndex: number
  team: TeamSide
}

export interface FormationResult {
  starters: PlayerData[]   // 22 Spieler (11 pro Team)
  bench: BenchEntry[]      // alle nicht-eingesetzten Spieler beider Teams
}

export function createFormation(
  team1Id?: number,
  team2Id?: number,
  formation1: FormationType = '4-3-3',
  formation2: FormationType = '4-3-3',
): PlayerData[] {
  const result = createFormationDetailed(team1Id, team2Id, formation1, formation2)
  return result.starters
}

export function createFormationDetailed(
  team1Id?: number,
  team2Id?: number,
  formation1: FormationType = '4-3-3',
  formation2: FormationType = '4-3-3',
): FormationResult {
  const roster1 = team1Id !== undefined ? getEffectiveRoster(team1Id) : undefined
  const roster2 = team2Id !== undefined ? getEffectiveRoster(team2Id) : undefined

  const avg1 = avgQualityTop11(roster1)
  const avg2 = avgQualityTop11(roster2)
  const startConf1 = calcStartConfidence(avg1, avg2)
  const startConf2 = calcStartConfidence(avg2, avg1)
  const cf1 = confidenceFactor(startConf1)
  const cf2 = confidenceFactor(startConf2)

  const slots1 = getFormationSlots(formation1)
  const slots2 = getFormationSlots(formation2)

  const starters: PlayerData[] = []
  const bench: BenchEntry[] = []

  // Pool jeweils aus Roster bauen, pro Slot besten Spieler picken
  const pool1: RosterEntry[] = (roster1 ?? []).map((t, i) => ({
    template: t, rosterIndex: i, used: false,
  }))
  const pool2: RosterEntry[] = (roster2 ?? []).map((t, i) => ({
    template: t, rosterIndex: i, used: false,
  }))

  // Wechselseitig befüllen — Indizes 0,1 → Team 1 Slot 0, Team 2 Slot 0, etc.
  // Damit bleibt die Reihenfolge der `starters`-Liste konsistent mit dem
  // existierenden Pattern (parallel iterieren über Slots).
  const maxLen = Math.max(slots1.length, slots2.length)
  for (let i = 0; i < maxLen; i++) {
    if (i < slots1.length) {
      const pick = pickForSlot(pool1, slots1[i].positionLabel)
      if (pick) pick.used = true
      starters.push(createPlayer(1, i, slots1[i], pick?.template, cf1, startConf1))
    }
    if (i < slots2.length) {
      const pick = pickForSlot(pool2, slots2[i].positionLabel)
      if (pick) pick.used = true
      starters.push(createPlayer(2, i, slots2[i], pick?.template, cf2, startConf2))
    }
  }

  // Bench-Listen erzeugen (alle nicht-genutzten Roster-Einträge)
  for (const e of pool1) {
    if (!e.used) bench.push({ template: e.template, rosterIndex: e.rosterIndex, team: 1 })
  }
  for (const e of pool2) {
    if (!e.used) bench.push({ template: e.template, rosterIndex: e.rosterIndex, team: 2 })
  }

  return { starters, bench }
}

export function getTeamPlayers(players: PlayerData[], team: TeamSide): PlayerData[] {
  return players.filter(p => p.team === team)
}

export function getGoalkeeper(players: PlayerData[], team: TeamSide): PlayerData | undefined {
  return players.find(p => p.team === team && p.positionLabel === 'TW')
}

export function getBallCarrier(players: PlayerData[], ballOwnerId: string | null): PlayerData | undefined {
  if (!ballOwnerId) return undefined
  return players.find(p => p.id === ballOwnerId)
}
