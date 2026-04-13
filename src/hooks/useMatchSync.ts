import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { GameState, SerializedMatchState } from '../engine/types'
import { createFormation } from '../engine/formation'
import { createInitialGameState, emptyMatchStats } from '../engine/turn'

interface MatchDetails {
  id: string
  player1_id: string
  player2_id: string
  current_turn_id: string
  team1_abbr: string
  team2_abbr: string
  status: string
}

interface UseMatchSyncResult {
  state: GameState | null
  matchDetails: MatchDetails | null
  loading: boolean
  error: string | null
  submitMove: (newState: GameState) => Promise<void>
  isSubmitting: boolean
}

/**
 * Hook for synchronizing Duel match state with Supabase.
 * Handles initial load, real-time updates, and move submission.
 */
export function useMatchSync(matchId: string | undefined, userId: string | undefined): UseMatchSyncResult {
  const [state, setState] = useState<GameState | null>(null)
  const [matchDetails, setMatchDetails] = useState<MatchDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // Load initial match state
  useEffect(() => {
    if (!matchId) return

    const loadMatch = async () => {
      const { data, error: fetchError } = await supabase
        .from('matches')
        .select('*')
        .eq('id', matchId)
        .single()

      if (fetchError || !data) {
        setError(fetchError?.message ?? 'Match not found')
        setLoading(false)
        return
      }

      setMatchDetails({
        id: data.id,
        player1_id: data.player1_id,
        player2_id: data.player2_id,
        current_turn_id: data.current_turn_id,
        team1_abbr: data.team1_abbr,
        team2_abbr: data.team2_abbr,
        status: data.status,
      })

      // Parse game state or create initial
      if (data.game_state) {
        const gs = data.game_state as SerializedMatchState
        setState(deserializeState(gs))
      } else {
        const players = createFormation()
        const initial = createInitialGameState(players)
        setState(initial)
      }

      setLoading(false)
    }

    loadMatch()
  }, [matchId])

  // Real-time subscription
  useEffect(() => {
    if (!matchId) return

    const channel = supabase
      .channel(`match-${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matches',
          filter: `id=eq.${matchId}`,
        },
        (payload) => {
          const updated = payload.new as Record<string, unknown>

          setMatchDetails(prev => prev ? {
            ...prev,
            current_turn_id: updated.current_turn_id as string,
            status: updated.status as string,
          } : null)

          if (updated.game_state) {
            const gs = updated.game_state as SerializedMatchState
            setState(deserializeState(gs))
          }
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      channel.unsubscribe()
    }
  }, [matchId])

  // Submit move — update DB with new state and swap turn
  const submitMove = useCallback(async (newState: GameState) => {
    if (!matchId || !userId || !matchDetails) return

    setIsSubmitting(true)

    const nextTurnId = matchDetails.current_turn_id === matchDetails.player1_id
      ? matchDetails.player2_id
      : matchDetails.player1_id

    // Serialize game state (strip non-serializable fields, reset turn-specific flags)
    const serialized: SerializedMatchState = {
      players: newState.players.map(p => ({
        ...p,
        origin: { ...p.position },
        hasActed: false,
        hasMoved: false,
        hasPassed: false,
        hasReceivedPass: false,
        tackleLocked: p.tackleLocked,
      })),
      ball: newState.ball,
      score: newState.score,
      currentTurn: newState.currentTurn,
      gameTime: newState.gameTime,
      half: newState.half,
      phase: newState.phase,
      passesThisTurn: 0,
      ballOwnerChangedThisTurn: false,
      mustPass: false,
      lastSetPiece: null,
      tackleAttemptedThisTurn: false,
      matchStats: newState.matchStats,
      ticker: newState.ticker,
      totalTurns: newState.totalTurns,
    }

    const { error: updateError } = await supabase
      .from('matches')
      .update({
        game_state: serialized,
        current_turn_id: nextTurnId,
        last_move_at: new Date().toISOString(),
      })
      .eq('id', matchId)

    if (updateError) {
      setError(updateError.message)
    }

    setIsSubmitting(false)
  }, [matchId, userId, matchDetails])

  return { state, matchDetails, loading, error, submitMove, isSubmitting }
}

/** Convert SerializedMatchState → full GameState with defaults for missing fields. */
function deserializeState(gs: SerializedMatchState): GameState {
  return {
    ...gs,
    lastEvent: null,
    // Backwards compat: fill in fields that older serialized states may lack
    tackleAttemptedThisTurn: gs.tackleAttemptedThisTurn ?? false,
    matchStats: gs.matchStats ?? { team1: emptyMatchStats(), team2: emptyMatchStats() },
    ticker: gs.ticker ?? [],
    totalTurns: gs.totalTurns ?? { team1: 0, team2: 0 },
    // Ensure player fields exist
    players: gs.players.map(p => ({
      ...p,
      tackleLocked: p.tackleLocked ?? false,
      hasPassed: p.hasPassed ?? false,
    })),
  }
}
