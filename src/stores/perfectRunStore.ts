import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { TEAMS } from '../data/teams'
import type { TeamSide } from '../engine/types'

export type CampaignStatus = 'active' | 'completed' | 'failed'

export interface Campaign {
  id: string
  userId: string
  teamId: number
  status: CampaignStatus
  opponentsBeaten: number
  goalsFor: number
  goalsAgainst: number
  eliminatedByTeamId: number | null
  opponentOrder: number[]
  startedAt: string
  endedAt: string | null
}

interface PerfectRunStore {
  xp: number
  campaigns: Campaign[]
  loading: boolean
  error: string | null

  load: (userId: string) => Promise<void>
  startCampaign: (userId: string, teamId: number) => Promise<Campaign | null>
  deleteActiveCampaign: (userId: string) => Promise<void>
  finalizeMatch: (
    userId: string,
    campaignId: string,
    goalsFor: number,
    goalsAgainst: number,
    opponentTeamId: number,
    shootoutWinner?: TeamSide | null,  // Wenn gesetzt, wird der Sieger hierüber bestimmt (Score bleibt unentschieden)
  ) => Promise<void>
}

/**
 * Sort all opponent team IDs ascending by (att+mid+def+tw), excluding the user's team.
 * This is the Perfect-Run opponent order — weakest first, strongest last.
 */
export function buildOpponentOrder(userTeamId: number): number[] {
  return TEAMS
    .filter(t => t.id !== userTeamId)
    .map(t => ({ id: t.id, sum: t.levels.att + t.levels.mid + t.levels.def + t.levels.tw }))
    .sort((a, b) => a.sum - b.sum)
    .map(t => t.id)
}

interface CampaignRow {
  id: string
  user_id: string
  team_id: number
  status: CampaignStatus
  opponents_beaten: number
  goals_for: number
  goals_against: number
  eliminated_by_team_id: number | null
  opponent_order: number[]
  started_at: string
  ended_at: string | null
}

function rowToCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    userId: row.user_id,
    teamId: row.team_id,
    status: row.status,
    opponentsBeaten: row.opponents_beaten,
    goalsFor: row.goals_for,
    goalsAgainst: row.goals_against,
    eliminatedByTeamId: row.eliminated_by_team_id,
    opponentOrder: row.opponent_order,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  }
}

export const usePerfectRunStore = create<PerfectRunStore>((set, get) => ({
  xp: 0,
  campaigns: [],
  loading: false,
  error: null,

  load: async (userId) => {
    set({ loading: true, error: null })

    const [profileRes, campaignsRes] = await Promise.all([
      supabase.from('profiles').select('perfect_run_xp').eq('id', userId).single(),
      supabase
        .from('perfect_run_campaigns')
        .select('*')
        .eq('user_id', userId)
        .order('started_at', { ascending: false }),
    ])

    if (profileRes.error) {
      set({ loading: false, error: profileRes.error.message })
      return
    }

    const xp = (profileRes.data?.perfect_run_xp as number | undefined) ?? 0
    const campaigns = (campaignsRes.data ?? []).map(rowToCampaign)

    set({ xp, campaigns, loading: false })
  },

  startCampaign: async (userId, teamId) => {
    const opponentOrder = buildOpponentOrder(teamId)

    const { data, error } = await supabase
      .from('perfect_run_campaigns')
      .insert({
        user_id: userId,
        team_id: teamId,
        status: 'active',
        opponents_beaten: 0,
        goals_for: 0,
        goals_against: 0,
        opponent_order: opponentOrder,
      })
      .select()
      .single()

    if (error || !data) {
      set({ error: error?.message ?? 'Failed to start campaign' })
      return null
    }

    const campaign = rowToCampaign(data as CampaignRow)
    set({ campaigns: [campaign, ...get().campaigns] })
    return campaign
  },

  deleteActiveCampaign: async (userId) => {
    const active = get().campaigns.find(c => c.status === 'active')
    if (!active) return

    const { error } = await supabase
      .from('perfect_run_campaigns')
      .delete()
      .eq('id', active.id)
      .eq('user_id', userId)

    if (error) {
      set({ error: error.message })
      return
    }

    set({ campaigns: get().campaigns.filter(c => c.id !== active.id) })
  },

  finalizeMatch: async (userId, campaignId, goalsFor, goalsAgainst, opponentTeamId, shootoutWinner) => {
    const campaign = get().campaigns.find(c => c.id === campaignId)
    if (!campaign || campaign.status !== 'active') return

    // Sieger: bei Elfmeterschießen entschieden, sonst per Torverhältnis
    const userWon = shootoutWinner != null
      ? shootoutWinner === 1
      : goalsFor > goalsAgainst
    const newGoalsFor = campaign.goalsFor + goalsFor
    const newGoalsAgainst = campaign.goalsAgainst + goalsAgainst
    const newOpponentsBeaten = userWon ? campaign.opponentsBeaten + 1 : campaign.opponentsBeaten
    const allOpponentsBeaten = newOpponentsBeaten >= campaign.opponentOrder.length

    const newStatus: CampaignStatus = userWon
      ? (allOpponentsBeaten ? 'completed' : 'active')
      : 'failed'
    const endedAt = newStatus === 'active' ? null : new Date().toISOString()

    const update: Partial<CampaignRow> = {
      status: newStatus,
      opponents_beaten: newOpponentsBeaten,
      goals_for: newGoalsFor,
      goals_against: newGoalsAgainst,
      ended_at: endedAt,
    }
    if (!userWon) update.eliminated_by_team_id = opponentTeamId

    const { data, error } = await supabase
      .from('perfect_run_campaigns')
      .update(update)
      .eq('id', campaignId)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      set({ error: error.message })
      return
    }

    const newXp = get().xp + 1
    await supabase.from('profiles').update({ perfect_run_xp: newXp }).eq('id', userId)

    const updatedCampaign = data ? rowToCampaign(data as CampaignRow) : { ...campaign, ...{
      status: newStatus,
      opponentsBeaten: newOpponentsBeaten,
      goalsFor: newGoalsFor,
      goalsAgainst: newGoalsAgainst,
      eliminatedByTeamId: userWon ? campaign.eliminatedByTeamId : opponentTeamId,
      endedAt,
    } }

    set({
      xp: newXp,
      campaigns: get().campaigns.map(c => c.id === campaignId ? updatedCampaign : c),
    })
  },
}))
