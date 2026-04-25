/**
 * React-Hook: KI-Modus-Auswahl im Browser.
 *
 * Lädt eine ONNX-Policy aus public/ und registriert sie im globalen
 * Policy-Manager. Gibt Status-Informationen für die UI zurück.
 *
 * Nutzung:
 *   const { mode, setMode, isLoading, error } = useAIMode()
 *   <select value={mode} onChange={e => setMode(e.target.value)}>
 *     <option value="heuristic">Heuristik</option>
 *     <option value="bc">BC</option>
 *     <option value="rl">RL</option>
 *   </select>
 */

import { useCallback, useEffect, useState } from 'react'
import { loadOnnxPolicyWeb } from '../engine/ai/policy/onnxPolicyWeb'
import { setActivePolicy, clearActivePolicy } from '../engine/ai/policy/manager'
import type { OnnxPolicy } from '../engine/ai/policy/types'

export type AIMode = 'heuristic' | 'bc' | 'rl'

const MODEL_URLS: Record<Exclude<AIMode, 'heuristic'>, string> = {
  bc: '/bc_policy.onnx',
  rl: '/rl_policy.onnx',
}

const STORAGE_KEY = 'tikitaq.aiMode'

function getStoredMode(): AIMode {
  if (typeof window === 'undefined') return 'heuristic'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'bc' || stored === 'rl' || stored === 'heuristic') return stored
  return 'heuristic'
}

// Cache für geladene Policies — Reload teuer, daher nur einmal pro Mode laden
const policyCache = new Map<AIMode, OnnxPolicy>()

export function useAIMode(): {
  mode: AIMode
  setMode: (m: AIMode) => Promise<void>
  isLoading: boolean
  error: string | null
} {
  const [mode, setModeState] = useState<AIMode>(() => getStoredMode())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setMode = useCallback(async (newMode: AIMode) => {
    setError(null)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, newMode)
    }

    if (newMode === 'heuristic') {
      clearActivePolicy()
      setModeState('heuristic')
      return
    }

    setIsLoading(true)
    try {
      let policy = policyCache.get(newMode)
      if (!policy) {
        policy = await loadOnnxPolicyWeb(MODEL_URLS[newMode])
        policyCache.set(newMode, policy)
      }
      setActivePolicy({
        policy,
        teams: 'all',
        mode: 'argmax',  // im Live-Spiel deterministisch
      })
      setModeState(newMode)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(`Modell-Ladefehler: ${msg}`)
      // Fallback zur Heuristik
      clearActivePolicy()
      setModeState('heuristic')
      console.error('[useAIMode]', e)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Beim Mount: persisted mode wieder aktivieren
  useEffect(() => {
    const stored = getStoredMode()
    if (stored !== 'heuristic') {
      setMode(stored)
    }
  }, [setMode])

  return { mode, setMode, isLoading, error }
}
