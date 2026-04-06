import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validateAndApplyAction } from '../_shared/gameLogic.ts'
import type { MatchState, PlayerAction } from '../_shared/types.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Validate auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const { matchId, actions } = await req.json() as {
      matchId: string
      actions: PlayerAction[]
    }

    if (!matchId || !actions?.length) {
      return new Response(
        JSON.stringify({ error: 'Missing matchId or actions' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Load match
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('*')
      .eq('id', matchId)
      .single()

    if (matchError || !match) {
      return new Response(
        JSON.stringify({ error: 'Match not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify it's the user's turn
    if (match.current_turn_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Not your turn' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Load or initialize game state
    let gameState: MatchState = match.game_state as MatchState
    if (!gameState?.players) {
      return new Response(
        JSON.stringify({ error: 'Invalid game state' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Apply all actions
    for (const action of actions) {
      gameState = validateAndApplyAction(gameState, action)
    }

    // Swap turn
    const nextTurn = gameState.currentTurn === 1 ? 2 : 1
    gameState.currentTurn = nextTurn
    gameState.passUsedThisTurn = false
    gameState.gameTime += 1

    // Reset player flags
    gameState.players = gameState.players.map(p => ({
      ...p,
      hasActed: false,
      hasMoved: false,
      hasReceivedPass: false,
      origin: { ...p.position },
    }))

    // Determine next turn user ID
    const nextTurnId = match.current_turn_id === match.player1_id
      ? match.player2_id
      : match.player1_id

    // Save to database
    const { error: updateError } = await supabase
      .from('matches')
      .update({
        game_state: gameState,
        current_turn_id: nextTurnId,
        last_move_at: new Date().toISOString(),
      })
      .eq('id', matchId)

    if (updateError) {
      return new Response(
        JSON.stringify({ error: 'Failed to save game state' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, state: gameState }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
