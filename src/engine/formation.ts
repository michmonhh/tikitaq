import type { PlayerData, TeamLevels, TeamSide, PlayerStats, PlayerGameStats } from './types'
import { PLAYER_DEFAULTS } from './constants'

interface FormationSlot {
  positionLabel: string
  x: number
  y: number
}

// 4-3-3 kickoff formation — all players in own half (Team 1 defends y=100)
// Team 1's half is y=50..100, Team 2's half is y=0..50
const FORMATION_433: FormationSlot[] = [
  { positionLabel: 'TW', x: 50, y: 97 },
  { positionLabel: 'LV', x: 20, y: 82 },
  { positionLabel: 'IV', x: 40, y: 85 },
  { positionLabel: 'IV', x: 60, y: 85 },
  { positionLabel: 'RV', x: 80, y: 82 },
  { positionLabel: 'ZDM', x: 50, y: 70 },
  { positionLabel: 'LM', x: 25, y: 62 },
  { positionLabel: 'RM', x: 75, y: 62 },
  { positionLabel: 'OM', x: 50, y: 55 },
  { positionLabel: 'ST', x: 35, y: 52 },
  { positionLabel: 'ST', x: 65, y: 52 },
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

function mapTeamLevelsToStats(
  positionLabel: string,
  levels: TeamLevels
): PlayerStats {
  const base = defaultStats()

  // Attackers get offensive boosts from att level
  if (['ST', 'OM'].includes(positionLabel)) {
    base.pacing = levels.att
    base.finishing = levels.att
  }

  // Midfielders scale with mid level
  if (['ZDM', 'LM', 'RM', 'OM'].includes(positionLabel)) {
    base.shortPassing = levels.mid
    base.longPassing = levels.mid
  }

  // Defenders scale with def level
  if (['IV', 'LV', 'RV', 'ZDM'].includes(positionLabel)) {
    base.tackling = levels.def
    base.defensiveRadius = levels.def
    base.ballShielding = levels.def
  }

  // Goalkeeper scales with tw level
  if (positionLabel === 'TW') {
    base.quality = levels.tw
    base.ballShielding = levels.tw
  }

  return base
}

function createPlayer(
  team: TeamSide,
  index: number,
  slot: FormationSlot,
  levels?: TeamLevels
): PlayerData {
  const y = team === 1 ? slot.y : mirrorY(slot.y)
  const pos = { x: slot.x, y }
  const stats = levels
    ? mapTeamLevelsToStats(slot.positionLabel, levels)
    : defaultStats()

  return {
    id: `t${team}-${index}`,
    team,
    positionLabel: slot.positionLabel,
    position: { ...pos },
    origin: { ...pos },
    stats,
    gameStats: emptyGameStats(),
    hasActed: false,
    hasMoved: false,
    hasReceivedPass: false,
  }
}

export function createFormation(
  team1Levels?: TeamLevels,
  team2Levels?: TeamLevels
): PlayerData[] {
  const players: PlayerData[] = []

  for (let i = 0; i < FORMATION_433.length; i++) {
    players.push(createPlayer(1, i, FORMATION_433[i], team1Levels))
    players.push(createPlayer(2, i, FORMATION_433[i], team2Levels))
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
