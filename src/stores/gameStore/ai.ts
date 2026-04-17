import type { PlayerAction, Position, TickerEntry } from '../../engine/types'
import { executeAITurn, getAIReasoning, getAITickerMessages } from '../../engine/ai'
import { animator } from '../../canvas/Animator'
import { isSetPiecePhase } from './helpers'
import type { GameStore, StoreSet, StoreGet } from './types'

export function makeExecuteAI(set: StoreSet, get: StoreGet): GameStore['executeAI'] {
  return () => {
    const { state } = get()
    if (!state) return
    set({ selectedPlayerId: null })

    try {
      const actions = executeAITurn(state)
      set({ aiReasoning: getAIReasoning() })

      // AI-Ticker-Nachrichten verarbeiten (Taktikwechsel etc.)
      const tickerMsgs = getAITickerMessages()
      if (tickerMsgs.length > 0) {
        let s = get().state!
        for (const msg of tickerMsgs) {
          const entry: TickerEntry = { minute: s.gameTime, message: msg, type: 'tactic_change', team: state.currentTurn }
          s = { ...s, ticker: [...s.ticker, entry] }
        }
        set({ state: s })
      }

      for (const action of actions) {
        const currentState = get().state
        if (!currentState || currentState.phase !== 'playing') break
        try {
          if (action.type === 'move') get().movePlayer(action.playerId, action.target)
          else if (action.type === 'pass') get().passBall(action.playerId, action.target, action.receiverId)
          else if (action.type === 'shoot') get().shootBall(action.playerId, action.target)
        } catch (e) { console.error('[AI] Action crashed:', action.type, e) }
      }
    } catch (err) {
      console.error('[AI] executeAI crashed:', err)
    }

    get().endCurrentTurn()
  }
}

/**
 * Execute AI turn with animated player movements.
 * Uses setTimeout chain — no async/await, no React dependency.
 * Wrapped in try-catch to prevent permanent "AI Thinking" hang.
 */
export function makeExecuteAIAnimated(set: StoreSet, get: StoreGet): GameStore['executeAIAnimated'] {
  return () => {
    const { state } = get()
    if (!state || get().aiRunning) return

    set({ aiRunning: true })

    // Safety timeout: if the chain hasn't finished in 15s, force-reset
    const safetyTimer = setTimeout(() => {
      if (get().aiRunning) {
        console.warn('[AI] Safety timeout — forcing aiRunning=false')
        get().endCurrentTurn()
        set({ aiRunning: false })
        get().flushAIOverlay()
      }
    }, 15000)

    let actions: PlayerAction[]
    try {
      actions = executeAITurn(state)
    } catch (err) {
      console.error('[AI] executeAITurn crashed:', err)
      clearTimeout(safetyTimer)
      get().endCurrentTurn()
      set({ aiRunning: false })
      get().flushAIOverlay()
      return
    }

    set({ aiReasoning: getAIReasoning() })

    // AI-Ticker-Nachrichten verarbeiten (Taktikwechsel etc.)
    const tickerMsgs = getAITickerMessages()
    if (tickerMsgs.length > 0) {
      let s = get().state!
      for (const msg of tickerMsgs) {
        const entry: TickerEntry = { minute: s.gameTime, message: msg, type: 'tactic_change', team: state.currentTurn }
        s = { ...s, ticker: [...s.ticker, entry] }
      }
      set({ state: s })
    }

    const MOVE_DURATION = 300  // ms per move animation
    const DELAY_BETWEEN = 100  // ms between actions

    // Aufgeschobene Ball-Animation — wird nach allen Spielerbewegungen abgespielt
    let deferredBallAnim: { from: Position; to: Position } | null = null

    function finishTurn() {
      clearTimeout(safetyTimer)

      // Aufgeschobene Ball-Animation abspielen bevor der Zug endet
      if (deferredBallAnim) {
        const { from, to } = deferredBallAnim
        deferredBallAnim = null
        animator.animateBall(from, to)

        // Warten bis Ball-Animation fertig, dann Zug beenden
        // ballDuration ist intern im Animator, daher grobe Schätzung
        const dx = to.x - from.x, dy = to.y - from.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const estimatedDuration = 200 + Math.min(1, dist / 80) * 1300
        setTimeout(() => {
          const currentState = get().state
          if (currentState && isSetPiecePhase(currentState.phase)) {
            set({ aiRunning: false })
            get().flushAIOverlay()
            return
          }
          try { get().endCurrentTurn() } catch (e) { console.error('[AI] endCurrentTurn crashed:', e) }
          set({ aiRunning: false })
          get().flushAIOverlay()
        }, estimatedDuration + 50)
        return
      }

      const currentState = get().state
      // Don't end turn if a set piece phase was triggered (foul, out of bounds)
      // The set piece phase must persist for repositioning
      if (currentState && isSetPiecePhase(currentState.phase)) {
        set({ aiRunning: false })
        get().flushAIOverlay()
        return
      }
      try { get().endCurrentTurn() } catch (e) { console.error('[AI] endCurrentTurn crashed:', e) }
      set({ aiRunning: false })
      get().flushAIOverlay()
    }

    function executeAction(index: number) {
      try {
        if (index >= actions.length) {
          finishTurn()
          return
        }

        const action = actions[index]
        const currentState = get().state
        if (!currentState) { finishTurn(); return }

        // Skip actions for phases that changed mid-chain (goal scored → kickoff, foul → free_kick)
        if (currentState.phase !== 'playing') {
          finishTurn()
          return
        }

        const player = currentState.players.find(p => p.id === action.playerId)
        if (!player) { executeAction(index + 1); return }

        if (action.type === 'move') {
          const fromPos = { ...player.position }
          animator.animate(player.id, fromPos, action.target, MOVE_DURATION)

          setTimeout(() => {
            try {
              get().movePlayer(action.playerId, action.target)
            } catch (e) { console.error('[AI] movePlayer crashed:', e) }

            // If a foul occurred, phase changes to free_kick — stop chain
            const s = get().state
            if (s && s.phase !== 'playing') {
              finishTurn()
              return
            }

            setTimeout(() => executeAction(index + 1), DELAY_BETWEEN)
          }, MOVE_DURATION + 20)
        } else if (action.type === 'pass') {
          // Ball visuell festhalten + Animation aufsparen
          const ballFrom = { ...currentState.ball.position }
          animator.holdBallAt(ballFrom)

          try { get().passBall(action.playerId, action.target, action.receiverId) } catch (e) { console.error('[AI] passBall crashed:', e) }

          // Tatsächliche Endposition des Balls (bei Fehlpass/Interception ≠ action.target)
          const actualBallPos = get().state?.ball.position ?? action.target
          deferredBallAnim = { from: ballFrom, to: { ...actualBallPos } }

          setTimeout(() => executeAction(index + 1), DELAY_BETWEEN)
        } else if (action.type === 'shoot') {
          // Ball visuell festhalten + Animation aufsparen
          const ballFrom = { ...currentState.ball.position }
          animator.holdBallAt(ballFrom)

          try { get().shootBall(action.playerId, action.target) } catch (e) { console.error('[AI] shootBall crashed:', e) }

          // Tatsächliche Endposition (bei Fehlschuss/Parade ≠ action.target)
          const actualBallPos = get().state?.ball.position ?? action.target
          deferredBallAnim = { from: ballFrom, to: { ...actualBallPos } }

          // Goal changes phase to kickoff — stop remaining moves
          const s = get().state
          if (s && s.phase !== 'playing') {
            finishTurn()
            return
          }

          setTimeout(() => executeAction(index + 1), DELAY_BETWEEN)
        } else {
          executeAction(index + 1)
        }
      } catch (err) {
        console.error('[AI] executeAction crashed at index', index, ':', err)
        finishTurn()
      }
    }

    // Start the chain
    executeAction(0)
  }
}
