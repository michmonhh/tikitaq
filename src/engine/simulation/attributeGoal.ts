import type { PlayerTemplate } from '../../data/players'

// Positionsgruppen-Anteile — wer schießt wie oft ein Tor?
// Bleibt dicht an echten Bundesliga-Verteilungen.
const POSITION_SHARE: Record<string, { group: Group; weight: number }> = {
  ST:  { group: 'ST',  weight: 1.0 },
  OM:  { group: 'OM',  weight: 1.0 },
  LM:  { group: 'WM',  weight: 1.0 },
  RM:  { group: 'WM',  weight: 1.0 },
  ZDM: { group: 'ZDM', weight: 1.0 },
  LV:  { group: 'DEF', weight: 1.0 },
  RV:  { group: 'DEF', weight: 1.0 },
  IV:  { group: 'DEF', weight: 1.0 },
  TW:  { group: 'TW',  weight: 0.0 }, // TW schießt im Spiel praktisch nie ein Tor
}

type Group = 'ST' | 'OM' | 'WM' | 'ZDM' | 'DEF' | 'TW'

const GROUP_SHARE: Record<Group, number> = {
  ST: 0.62,
  OM: 0.15,
  WM: 0.10,
  ZDM: 0.06,
  DEF: 0.05,
  TW: 0.0,
}

// Innerhalb der Gruppe: Skill-Gewichtung auf `finishing`.
const GROUP_FINISHING_WEIGHT: Record<Group, number> = {
  ST: 1.0,
  OM: 0.8,
  WM: 0.7,
  ZDM: 0.5,
  DEF: 0.4,
  TW: 0.0,
}

const OWN_GOAL_RATE = 0.02

export interface AttributedGoal {
  playerIndex: number     // Index in roster (0..10)
  playerName: string
  kind: 'open_play' | 'own_goal'
  ownGoalByOpponentIndex?: number  // nur gesetzt wenn kind === 'own_goal'
}

/**
 * Ordnet ein Tor einem Spieler des schießenden Teams zu.
 * Bei Eigentor: gibt den gegnerischen Verteidiger zurück, der es „gemacht" hat.
 *
 * @param scoringRoster Roster des Teams, das das Tor erzielt
 * @param concedingRoster Roster des Gegners (für Eigentore)
 * @param rand RNG [0,1)
 */
export function attributeSimulatedGoal(
  scoringRoster: PlayerTemplate[],
  concedingRoster: PlayerTemplate[],
  rand: () => number,
): AttributedGoal {
  // Eigentor-Chance zuerst prüfen
  if (rand() < OWN_GOAL_RATE) {
    const defenders = indicesByGroup(concedingRoster, 'DEF')
    if (defenders.length > 0) {
      const idx = defenders[Math.floor(rand() * defenders.length)]
      const p = concedingRoster[idx]
      return {
        playerIndex: idx,
        playerName: `${p.firstName} ${p.lastName}`,
        kind: 'own_goal',
        ownGoalByOpponentIndex: idx,
      }
    }
  }

  // Gruppe per Gewichtung wählen
  const group = pickGroup(rand)
  let candidates = indicesByGroup(scoringRoster, group)
  // Fallback: falls die Formation diese Gruppe nicht hat → ST nehmen
  if (candidates.length === 0) candidates = indicesByGroup(scoringRoster, 'ST')
  if (candidates.length === 0) candidates = [0] // allerletzter Fallback

  const idx = weightedPick(
    candidates,
    i => Math.max(1, scoringRoster[i].stats.finishing * GROUP_FINISHING_WEIGHT[group]),
    rand,
  )
  const p = scoringRoster[idx]
  return {
    playerIndex: idx,
    playerName: `${p.firstName} ${p.lastName}`,
    kind: 'open_play',
  }
}

function indicesByGroup(roster: PlayerTemplate[], group: Group): number[] {
  const out: number[] = []
  for (let i = 0; i < roster.length; i++) {
    const mapping = POSITION_SHARE[roster[i].positionLabel]
    if (mapping && mapping.group === group) out.push(i)
  }
  return out
}

function pickGroup(rand: () => number): Group {
  const r = rand()
  let acc = 0
  const groups: Group[] = ['ST', 'OM', 'WM', 'ZDM', 'DEF']
  for (const g of groups) {
    acc += GROUP_SHARE[g]
    if (r < acc) return g
  }
  return 'ST'
}

function weightedPick(indices: number[], weightOf: (i: number) => number, rand: () => number): number {
  let total = 0
  for (const i of indices) total += weightOf(i)
  if (total <= 0) return indices[0]
  const r = rand() * total
  let acc = 0
  for (const i of indices) {
    acc += weightOf(i)
    if (r < acc) return i
  }
  return indices[indices.length - 1]
}
