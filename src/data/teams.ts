import type { Team } from '../engine/types'

export const TEAMS: Team[] = [
  { id: 0,  name: 'München',     shortName: 'MUC', color: '#dc052d', levels: { att: 88, mid: 86, def: 85, tw: 88 } },
  { id: 1,  name: 'Dortmund',    shortName: 'DOR', color: '#fde100', levels: { att: 84, mid: 82, def: 78, tw: 80 } },
  { id: 2,  name: 'Leipzig',     shortName: 'LEI', color: '#dd0741', levels: { att: 82, mid: 83, def: 80, tw: 78 } },
  { id: 3,  name: 'Leverkusen',  shortName: 'LEV', color: '#e32221', levels: { att: 86, mid: 85, def: 82, tw: 82 } },
  { id: 4,  name: 'Frankfurt',   shortName: 'FFM', color: '#e1000f', levels: { att: 80, mid: 80, def: 78, tw: 78 } },
  { id: 5,  name: 'Stuttgart',   shortName: 'STU', color: '#e32219', levels: { att: 80, mid: 79, def: 77, tw: 79 } },
  { id: 6,  name: 'Hoffenheim',  shortName: 'HOF', color: '#1961b5', levels: { att: 76, mid: 77, def: 75, tw: 76 } },
  { id: 7,  name: 'Mainz',       shortName: 'MAI', color: '#c3141e', levels: { att: 74, mid: 76, def: 75, tw: 75 } },
  { id: 8,  name: 'Kiel',        shortName: 'KIE', color: '#003c8f', levels: { att: 72, mid: 73, def: 72, tw: 73 } },
  { id: 9,  name: 'Gladbach',    shortName: 'GLA', color: '#000000', levels: { att: 78, mid: 78, def: 76, tw: 77 } },
  { id: 10, name: 'Berlin',      shortName: 'BER', color: '#004d9e', levels: { att: 75, mid: 76, def: 74, tw: 75 } },
  { id: 11, name: 'Heidenheim',  shortName: 'HEI', color: '#e30613', levels: { att: 72, mid: 73, def: 74, tw: 73 } },
  { id: 12, name: 'Augsburg',    shortName: 'AUG', color: '#ba2c30', levels: { att: 73, mid: 74, def: 74, tw: 74 } },
  { id: 13, name: 'Bochum',      shortName: 'BOC', color: '#005ba1', levels: { att: 70, mid: 71, def: 72, tw: 72 } },
  { id: 14, name: 'Freiburg',    shortName: 'FRE', color: '#000000', levels: { att: 77, mid: 78, def: 78, tw: 77 } },
  { id: 15, name: 'Wolfsburg',   shortName: 'WOB', color: '#65b32e', levels: { att: 76, mid: 77, def: 76, tw: 76 } },
  { id: 16, name: 'Bremen',      shortName: 'BRE', color: '#1d9053', levels: { att: 76, mid: 76, def: 74, tw: 75 } },
  { id: 17, name: 'St. Pauli',   shortName: 'PAU', color: '#6e4023', levels: { att: 72, mid: 73, def: 73, tw: 73 } },
]

export function getTeamById(id: number): Team | undefined {
  return TEAMS.find(t => t.id === id)
}
