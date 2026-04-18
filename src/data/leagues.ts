export type LeagueId = 'de1' | 'de2' | 'de3' | 'hero' | 'continental'

export type ZoneKind =
  | 'champions'
  | 'europe-a'
  | 'europe-b'
  | 'europe-c'
  | 'promotion'
  | 'promotion-playoff'
  | 'relegation-playoff'
  | 'relegation'
  | 'neutral'

export interface LeagueZone {
  from: number
  to: number
  kind: ZoneKind
  label: string
  color: string
}

export interface LeagueDef {
  id: LeagueId
  name: string
  shortName: string
  tier: number
  teamCount: number
  available: boolean
  zones: LeagueZone[]
}

// 1. Liga: 18 Teams, Europapokal-Plätze + Relegation + Abstieg
const DE1_ZONES: LeagueZone[] = [
  { from: 1,  to: 4,  kind: 'champions',          label: 'Champions League', color: '#0B3D91' },
  { from: 5,  to: 5,  kind: 'europe-a',           label: 'Europa League',    color: '#F39200' },
  { from: 6,  to: 6,  kind: 'europe-b',           label: 'Conference League',color: '#00B050' },
  { from: 16, to: 16, kind: 'relegation-playoff', label: 'Relegation',       color: '#D46A1E' },
  { from: 17, to: 18, kind: 'relegation',         label: 'Abstieg',          color: '#C0392B' },
]

// 2. Liga (Platzhalter, ab Phase B aktiv)
const DE2_ZONES: LeagueZone[] = [
  { from: 1,  to: 2,  kind: 'promotion',          label: 'Aufstieg',         color: '#1E8449' },
  { from: 3,  to: 3,  kind: 'promotion-playoff',  label: 'Relegation',       color: '#2ECC71' },
  { from: 16, to: 16, kind: 'relegation-playoff', label: 'Relegation',       color: '#D46A1E' },
  { from: 17, to: 18, kind: 'relegation',         label: 'Abstieg',          color: '#C0392B' },
]

// 3. Liga (Platzhalter, ab Phase C aktiv) — 20 Teams
const DE3_ZONES: LeagueZone[] = [
  { from: 1,  to: 2,  kind: 'promotion',          label: 'Aufstieg',         color: '#1E8449' },
  { from: 3,  to: 3,  kind: 'promotion-playoff',  label: 'Relegation',       color: '#2ECC71' },
  { from: 18, to: 20, kind: 'relegation',         label: 'Abstieg',          color: '#C0392B' },
]

export const LEAGUES: Record<LeagueId, LeagueDef> = {
  de1: {
    id: 'de1',
    name: '1. Liga',
    shortName: '1L',
    tier: 1,
    teamCount: 18,
    available: true,
    zones: DE1_ZONES,
  },
  de2: {
    id: 'de2',
    name: '2. Liga',
    shortName: '2L',
    tier: 2,
    teamCount: 18,
    available: false,
    zones: DE2_ZONES,
  },
  de3: {
    id: 'de3',
    name: '3. Liga',
    shortName: '3L',
    tier: 3,
    teamCount: 20,
    available: false,
    zones: DE3_ZONES,
  },
  hero: {
    id: 'hero',
    name: 'Hero League',
    shortName: 'HERO',
    tier: 1,
    teamCount: 18,
    available: false,
    zones: [],
  },
  continental: {
    id: 'continental',
    name: 'Continental League',
    shortName: 'CONT',
    tier: 2,
    teamCount: 18,
    available: false,
    zones: [],
  },
}

export function getLeague(id: LeagueId): LeagueDef {
  return LEAGUES[id]
}

export function getZoneForRank(league: LeagueDef, rank: number): LeagueZone | null {
  for (const zone of league.zones) {
    if (rank >= zone.from && rank <= zone.to) return zone
  }
  return null
}
