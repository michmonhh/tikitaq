/**
 * Arena-Store: hält das Ergebnis des zuletzt simulierten Arena-Matches
 * + den Lauf-Status. Der Replay-Screen liest aus `lastResult.replay`.
 *
 * Bewusst in-memory: Replays bleiben nicht persistent zwischen Reloads.
 * Später (Training): optional IndexedDB-Persistenz.
 */

import { create } from 'zustand'
import type { ArenaMatchResult } from '../engine/simulation/replayTypes'

interface ArenaStore {
  /** Ergebnis des zuletzt gelaufenen Matches. */
  lastResult: ArenaMatchResult | null
  /** true während eine Simulation läuft. */
  running: boolean
  /** Letzter Fehler (z.B. Orchestrator-Abbruch), oder null. */
  error: string | null

  setRunning: (v: boolean) => void
  setResult: (r: ArenaMatchResult) => void
  setError: (msg: string | null) => void
  clear: () => void
}

export const useArenaStore = create<ArenaStore>((set) => ({
  lastResult: null,
  running: false,
  error: null,

  setRunning: (running) => set({ running }),
  setResult: (lastResult) => set({ lastResult, error: null }),
  setError: (error) => set({ error, running: false }),
  clear: () => set({ lastResult: null, error: null }),
}))
