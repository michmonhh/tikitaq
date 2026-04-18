import type { PlayerAction, Position, TickerEntry, TeamSide } from '../../engine/types'
import { executeAITurn, getAIReasoning, getAITickerMessages } from '../../engine/ai'
import { animator } from '../../canvas/Animator'
import { isSetPiecePhase } from './helpers'
import type { GameStore, StoreSet, StoreGet } from './types'

// Fall B: Nach einem Standard (Freistoß/Ecke/Einwurf) darf die KI in direkter
// Folge einen weiteren Pass oder Schuss ausführen. Limit pro Zug.
const MAX_CHAIN_REPLANS = 2

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
    const aiTeam: TeamSide = state.currentTurn
    // Fall B: Chaining ist nur für Züge aktiv, die aus einem Standard
    // hervorgegangen sind. Wenn der Nutzer "Bereit" klickt, setzt
    // confirmKickoff phase='playing' und lastSetPiece=<Standardphase> —
    // nach dem ersten Pass räumt passBall lastSetPiece wieder auf, deshalb
    // merken wir uns den Zustand hier einmal am Zug-Anfang.
    // state.phase==='free_kick' etc. gilt zusätzlich für direkte AI-Ecken/-Einwürfe,
    // die ohne Button-Confirm starten.
    const setPieceMarkers = ['free_kick', 'corner', 'throw_in']
    const startedAsSetPiece = setPieceMarkers.includes(state.phase)
      || (state.lastSetPiece != null && setPieceMarkers.includes(state.lastSetPiece))

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

    // Ball-Animation-Queue: jede Pass/Shoot-Aktion hängt einen Eintrag an.
    // Wird in finishTurn sequentiell abgespielt. Ein einziges holdBallAt beim
    // ersten Eintrag hält den Ball sichtbar am Ausgangspunkt, bis die Queue
    // startet — weitere holdBallAt-Calls würden den Ball teleportieren.
    const ballAnimQueue: { from: Position; to: Position }[] = []
    let replansLeft = MAX_CHAIN_REPLANS

    /**
     * Fall B: Nach einem erfolgreichen Pass auf einem Standard-Zug prüft, ob
     * die KI noch den Ball hat, und plant ggf. eine Folgeaktion (weiteren Pass
     * oder Schuss) ein. Die neue Ballaktion wird direkt nach dem aktuellen
     * Index eingefügt, damit sie als Nächstes abgespielt wird.
     */
    function tryReplanAfterPass(insertAfter: number) {
      if (!startedAsSetPiece) return
      if (replansLeft <= 0) return
      const s = get().state
      if (!s || s.phase !== 'playing') return
      const carrier = s.ball.ownerId
        ? s.players.find(p => p.id === s.ball.ownerId)
        : null
      if (!carrier || carrier.team !== aiTeam) return
      if (carrier.hasActed) return
      replansLeft--
      try {
        const newActions = executeAITurn(s)
        // Re-plan darf keine Ticker-Nachrichten (Taktikwechsel) erzeugen —
        // die wurden schon beim ersten Plan verarbeitet. Warteschlange leeren.
        getAITickerMessages()
        const first = newActions[0]
        const isBallAction = first
          && (first.type === 'pass' || first.type === 'shoot')
          && first.playerId === carrier.id
        if (isBallAction) {
          actions.splice(insertAfter + 1, 0, first)
          if (first.type === 'pass') {
            const receiverMove = newActions.find(a =>
              a.type === 'move' && a.playerId === first.receiverId,
            )
            if (receiverMove) actions.splice(insertAfter + 2, 0, receiverMove)
          }
        }
      } catch (e) {
        console.error('[AI] tryReplanAfterPass crashed:', e)
      }
    }

    function playNextBallAnim(onComplete: () => void) {
      const entry = ballAnimQueue.shift()
      if (!entry) { onComplete(); return }
      const { from, to } = entry
      animator.animateBall(from, to)
      // ballDuration-Schätzung: siehe canvas/Animator.ts BALL_MIN/MAX_DURATION
      const dx = to.x - from.x, dy = to.y - from.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const estimatedDuration = 200 + Math.min(1, dist / 80) * 1300
      setTimeout(() => playNextBallAnim(onComplete), estimatedDuration + 50)
    }

    function finishTurn() {
      clearTimeout(safetyTimer)

      const runEnd = () => {
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

      if (ballAnimQueue.length > 0) {
        playNextBallAnim(runEnd)
      } else {
        runEnd()
      }
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
          // Ball visuell festhalten (nur beim ersten Eintrag — sonst Teleport)
          const ballFrom = { ...currentState.ball.position }
          if (ballAnimQueue.length === 0) animator.holdBallAt(ballFrom)

          try { get().passBall(action.playerId, action.target, action.receiverId) } catch (e) { console.error('[AI] passBall crashed:', e) }

          // Tatsächliche Endposition des Balls (bei Fehlpass/Interception ≠ action.target)
          const actualBallPos = get().state?.ball.position ?? action.target
          ballAnimQueue.push({ from: ballFrom, to: { ...actualBallPos } })

          // Fall B: nach Standard-Pass eventuell Folgeaktion einplanen
          tryReplanAfterPass(index)

          setTimeout(() => executeAction(index + 1), DELAY_BETWEEN)
        } else if (action.type === 'shoot') {
          // Ball visuell festhalten (nur beim ersten Eintrag — sonst Teleport)
          const ballFrom = { ...currentState.ball.position }
          if (ballAnimQueue.length === 0) animator.holdBallAt(ballFrom)

          try { get().shootBall(action.playerId, action.target) } catch (e) { console.error('[AI] shootBall crashed:', e) }

          // Tatsächliche Endposition (bei Fehlschuss/Parade ≠ action.target)
          const actualBallPos = get().state?.ball.position ?? action.target
          ballAnimQueue.push({ from: ballFrom, to: { ...actualBallPos } })

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
