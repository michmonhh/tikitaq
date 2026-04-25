/**
 * React-Hook: KI-Policy-Loader im Browser.
 *
 * AKTUELL HARDCODED auf RL. Lädt rl_policy.onnx beim Mount und registriert
 * sie im globalen Policy-Manager. Sobald geladen, wird IMMER die RL-Policy
 * für die KI-Entscheidungen genutzt.
 *
 * Status-Felder für die UI:
 *   - mode: aktuell aktiver Modus ('rl' wenn geladen, sonst 'heuristic'
 *           als Fallback)
 *   - isLoading: true während Modell lädt
 *   - error: Fehlermeldung wenn Laden fehlschlug
 *
 * setMode bleibt im Interface erhalten für später, wenn wir wieder Toggle
 * wollen — derzeit ist die Funktion ein No-op.
 */

import { useEffect, useState } from 'react'
import { loadOnnxPolicyWeb } from '../engine/ai/policy/onnxPolicyWeb'
import { setActivePolicy } from '../engine/ai/policy/manager'

export type AIMode = 'heuristic' | 'bc' | 'rl'

const FORCED_MODEL_URL = '/rl_policy.onnx'

// Singleton-Promise: das Modell wird nur einmal pro Tab geladen
let loadingPromise: Promise<void> | null = null
let loadedSuccessfully = false
let loadError: string | null = null

async function ensurePolicyLoaded(): Promise<void> {
  if (loadingPromise) return loadingPromise
  loadingPromise = (async () => {
    try {
      const policy = await loadOnnxPolicyWeb(FORCED_MODEL_URL)
      setActivePolicy({ policy, teams: 'all', mode: 'argmax' })
      loadedSuccessfully = true
      console.log('[useAIMode] RL-Policy geladen und aktiv für beide Teams')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      loadError = `Modell-Ladefehler: ${msg}`
      console.error('[useAIMode] Laden fehlgeschlagen:', e)
    }
  })()
  return loadingPromise
}

export function useAIMode(): {
  mode: AIMode
  setMode: (m: AIMode) => Promise<void>
  isLoading: boolean
  error: string | null
} {
  const [, force] = useState(0)

  useEffect(() => {
    let cancelled = false
    ensurePolicyLoaded().then(() => {
      if (!cancelled) force(x => x + 1)
    })
    return () => { cancelled = true }
  }, [])

  return {
    mode: loadedSuccessfully ? 'rl' : 'heuristic',
    setMode: async () => { /* no-op solange hardcoded */ },
    isLoading: loadingPromise !== null && !loadedSuccessfully && loadError === null,
    error: loadError,
  }
}
