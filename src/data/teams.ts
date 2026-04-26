import type { Team } from '../engine/types'

// Default-Formation pro Team — beim Coach-Layer als Ausgangspunkt.
// Top-Teams: offensiv (4-2-3-1, 4-3-3) — viel Pressing, breites Spiel.
// Mid-Tier:  klassisch (4-3-3, 4-4-2) — ausbalanciert.
// Underdog:  defensiv (5-3-2, 4-1-4-1) — Block + Konter.
//
// User kann das im MatchPlanningScreen für seine Mannschaft überschreiben.
export const TEAMS: Team[] = [
  { id: 0,  leagueId: 'de1', name: 'München',     shortName: 'MUC', color: '#dc052d', levels: { att: 88, mid: 86, def: 85, tw: 88 }, defaultFormation: '4-2-3-1' },
  { id: 1,  leagueId: 'de1', name: 'Dortmund',    shortName: 'DOR', color: '#fde100', levels: { att: 84, mid: 82, def: 78, tw: 80 }, defaultFormation: '4-3-3'   },
  { id: 2,  leagueId: 'de1', name: 'Leipzig',     shortName: 'LEI', color: '#dd0741', levels: { att: 82, mid: 83, def: 80, tw: 78 }, defaultFormation: '4-2-3-1' },
  { id: 3,  leagueId: 'de1', name: 'Leverkusen',  shortName: 'LEV', color: '#e32221', levels: { att: 86, mid: 85, def: 82, tw: 82 }, defaultFormation: '3-4-1-2' },
  { id: 4,  leagueId: 'de1', name: 'Frankfurt',   shortName: 'FFM', color: '#e1000f', levels: { att: 80, mid: 80, def: 78, tw: 78 }, defaultFormation: '3-4-1-2' },
  { id: 5,  leagueId: 'de1', name: 'Stuttgart',   shortName: 'STU', color: '#e32219', levels: { att: 80, mid: 79, def: 77, tw: 79 }, defaultFormation: '4-2-3-1' },
  { id: 6,  leagueId: 'de1', name: 'Hoffenheim',  shortName: 'HOF', color: '#1961b5', levels: { att: 76, mid: 77, def: 75, tw: 76 }, defaultFormation: '4-3-3'   },
  { id: 7,  leagueId: 'de1', name: 'Mainz',       shortName: 'MAI', color: '#c3141e', levels: { att: 74, mid: 76, def: 75, tw: 75 }, defaultFormation: '4-4-2'   },
  { id: 8,  leagueId: 'de1', name: 'Kiel',        shortName: 'KIE', color: '#003c8f', levels: { att: 72, mid: 73, def: 72, tw: 73 }, defaultFormation: '4-1-4-1' },
  { id: 9,  leagueId: 'de1', name: 'Gladbach',    shortName: 'GLA', color: '#000000', levels: { att: 78, mid: 78, def: 76, tw: 77 }, defaultFormation: '4-4-2'   },
  { id: 10, leagueId: 'de1', name: 'Berlin',      shortName: 'BER', color: '#004d9e', levels: { att: 75, mid: 76, def: 74, tw: 75 }, defaultFormation: '4-4-2'   },
  { id: 11, leagueId: 'de1', name: 'Heidenheim',  shortName: 'HEI', color: '#e30613', levels: { att: 72, mid: 73, def: 74, tw: 73 }, defaultFormation: '5-3-2'   },
  { id: 12, leagueId: 'de1', name: 'Augsburg',    shortName: 'AUG', color: '#ba2c30', levels: { att: 73, mid: 74, def: 74, tw: 74 }, defaultFormation: '4-1-4-1' },
  { id: 13, leagueId: 'de1', name: 'Bochum',      shortName: 'BOC', color: '#005ba1', levels: { att: 70, mid: 71, def: 72, tw: 72 }, defaultFormation: '5-3-2'   },
  { id: 14, leagueId: 'de1', name: 'Freiburg',    shortName: 'FRE', color: '#000000', levels: { att: 77, mid: 78, def: 78, tw: 77 }, defaultFormation: '4-4-2'   },
  { id: 15, leagueId: 'de1', name: 'Wolfsburg',   shortName: 'WOB', color: '#65b32e', levels: { att: 76, mid: 77, def: 76, tw: 76 }, defaultFormation: '4-2-3-1' },
  { id: 16, leagueId: 'de1', name: 'Bremen',      shortName: 'BRE', color: '#1d9053', levels: { att: 76, mid: 76, def: 74, tw: 75 }, defaultFormation: '3-5-2'   },
  { id: 17, leagueId: 'de1', name: 'St. Pauli',   shortName: 'PAU', color: '#6e4023', levels: { att: 72, mid: 73, def: 73, tw: 73 }, defaultFormation: '4-1-4-1' },
]

export function getTeamById(id: number): Team | undefined {
  return TEAMS.find(t => t.id === id)
}

export function getTeamsByLeague(leagueId: string): Team[] {
  return TEAMS.filter(t => t.leagueId === leagueId)
}

/**
 * Liefert die bevorzugte Formation eines Teams (Default '4-3-3' falls nicht
 * gesetzt). Wird in createFormation() als Default genutzt, kann pro Match
 * überschrieben werden (z.B. vom User im MatchPlanningScreen).
 */
export function getTeamDefaultFormation(id: number): import('../engine/types').FormationType {
  return getTeamById(id)?.defaultFormation ?? '4-3-3'
}
