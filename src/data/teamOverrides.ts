/**
 * Custom team overrides from localStorage (for the Team Editor).
 * Separated from TeamEditor.tsx to avoid CSS import in headless contexts.
 */
import { TEAM_ROSTERS, type PlayerTemplate } from './players'
import { TEAMS } from './teams'

const STORAGE_KEY = 'tikitaq_custom_teams'

export interface CustomTeamData {
  color: string
  roster: PlayerTemplate[]
}

function loadCustomTeams(): Record<number, CustomTeamData> {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) return JSON.parse(raw)
    }
  } catch { /* ignore */ }
  return {}
}

export function getEffectiveRoster(teamId: number): PlayerTemplate[] {
  const custom = loadCustomTeams()
  return custom[teamId]?.roster ?? TEAM_ROSTERS[teamId] ?? []
}

export function getEffectiveColor(teamId: number): string {
  const custom = loadCustomTeams()
  const team = TEAMS.find(t => t.id === teamId)
  return custom[teamId]?.color ?? team?.color ?? '#888888'
}
