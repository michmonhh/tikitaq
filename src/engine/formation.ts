import type { PlayerData, TeamSide, PlayerStats, PlayerGameStats } from './types'
import { PLAYER_DEFAULTS } from './constants'
import type { PlayerTemplate } from '../data/players'
import { getEffectiveRoster } from '../data/teamOverrides'

interface FormationSlot {
  positionLabel: string
  x: number
  y: number
  push: number     // Vorwärtsschub (Y) bei hohem Selbstvertrauen
  xSpread: number  // Breitenstreuung bei hohem Selbstvertrauen
}

// 4-3-3 Anstoß — Basis (defensiv/Underdog) + Push/Spread (Spitzenteam)
//   Y-Position = base.y - push * cf  (clamp ≥ 50, eigene Hälfte)
//   X-Position = base.x ± xSpread * cf  (weg von Mitte)
//   confidenceFactor = confidence/100 (0.25 Bochum ... 0.74 Bayern)
export const FORMATION_433: FormationSlot[] = [
  { positionLabel: 'TW', x: 50, y: 93,  push: 20, xSpread: 0 },
  { positionLabel: 'LV', x: 22, y: 82,  push: 40, xSpread: 12 },
  { positionLabel: 'IV', x: 42, y: 84,  push: 40, xSpread: 4 },
  { positionLabel: 'IV', x: 58, y: 84,  push: 40, xSpread: 4 },
  { positionLabel: 'RV', x: 78, y: 82,  push: 40, xSpread: 12 },
  { positionLabel: 'ZDM', x: 50, y: 72, push: 18, xSpread: 0 },
  { positionLabel: 'LM', x: 25, y: 66,  push: 20, xSpread: 12 },
  { positionLabel: 'RM', x: 75, y: 66,  push: 20, xSpread: 12 },
  { positionLabel: 'OM', x: 50, y: 62,  push: 10, xSpread: 0 },
  { positionLabel: 'ST', x: 40, y: 56,  push: 8,  xSpread: 8 },
  { positionLabel: 'ST', x: 60, y: 56,  push: 8,  xSpread: 8 },
]

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
  template?: PlayerTemplate,
  confFactor: number = 0.5,
  startConfidence: number = 50,
): PlayerData {
  // X: Breitenstreuung — starke Teams nutzen die Flügel
  const xOffset = slot.x < 50 ? -slot.xSpread * confFactor
                : slot.x > 50 ?  slot.xSpread * confFactor : 0
  const baseX = Math.max(3, Math.min(97, slot.x + xOffset))
  const x = team === 1 ? baseX : 100 - baseX
  // Y: Selbstvertrauen schiebt Spieler nach vorne (Richtung Mittellinie)
  // Clamp: Spieler bleiben immer in eigener Hälfte (baseY >= 50)
  const baseY = Math.max(50, slot.y - slot.push * confFactor)
  const y = team === 1 ? baseY : mirrorY(baseY)
  const pos = { x, y }

  return {
    id: `t${team}-${index}`,
    team,
    positionLabel: slot.positionLabel,
    firstName: template?.firstName ?? '',
    lastName: template?.lastName ?? '',
    position: { ...pos },
    origin: { ...pos },
    stats: template?.stats ?? defaultStats(),
    gameStats: emptyGameStats(),
    fitness: 100,
    confidence: startConfidence,
    hasActed: false,
    hasMoved: false,
    hasPassed: false,
    hasReceivedPass: false,
    tackleLocked: false,
  }
}

/** Durchschnittsqualität eines Rosters */
function avgQuality(roster?: PlayerTemplate[]): number {
  if (!roster || roster.length === 0) return 70
  return roster.reduce((s, p) => s + p.stats.quality, 0) / roster.length
}

/**
 * Spieler-Confidence aus dem Gefälle beider Teams berechnen.
 * Stärkeres Team bekommt höhere Confidence, schwächeres niedrigere.
 *   Bochum(62) vs Bayern(85): Bochum ~40, Bayern ~72
 *   Bayern(85) vs Bayern(85): beide ~57
 */
function calcStartConfidence(ownAvg: number, oppAvg: number): number {
  const base = 60
  const diff = ownAvg - oppAvg  // positiv = stärker
  // Halber Qualitätspunkt Vorsprung → ~1 Punkt Confidence, max ±15
  const shift = Math.max(-15, Math.min(15, diff * 0.65))
  // Eigene Stärke hebt Grundniveau: quality 85 → +6, quality 60 → -4
  const ownBoost = (ownAvg - 70) * 0.4
  return Math.max(25, Math.min(80, base + shift + ownBoost))
}

/** Confidence-Faktor für Formation-Push (0–1) */
function confidenceFactor(startConf: number): number {
  return Math.max(0.15, Math.min(0.95, startConf / 100))
}

export function createFormation(
  team1Id?: number,
  team2Id?: number
): PlayerData[] {
  const roster1 = team1Id !== undefined ? getEffectiveRoster(team1Id) : undefined
  const roster2 = team2Id !== undefined ? getEffectiveRoster(team2Id) : undefined

  const avg1 = avgQuality(roster1)
  const avg2 = avgQuality(roster2)
  const startConf1 = calcStartConfidence(avg1, avg2)
  const startConf2 = calcStartConfidence(avg2, avg1)
  const cf1 = confidenceFactor(startConf1)
  const cf2 = confidenceFactor(startConf2)

  const players: PlayerData[] = []

  for (let i = 0; i < FORMATION_433.length; i++) {
    players.push(createPlayer(1, i, FORMATION_433[i], roster1?.[i], cf1, startConf1))
    players.push(createPlayer(2, i, FORMATION_433[i], roster2?.[i], cf2, startConf2))
  }

  return players
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
