/**
 * TIKITAQ AI — Gedächtnis-Service
 *
 * Zwei Ebenen:
 * 1. MatchMemory — pro Spiel, lernt aus Aktionen (Trend pro Muster)
 * 2. Knowledge — persistent, wird durch AI-vs-AI Training befüllt (zunächst leer)
 *
 * Jede Schicht der AI kann das Gedächtnis abfragen:
 * - Was funktioniert? (trend > 0.4)
 * - Was vermeiden? (trend < -0.4)
 */

import type { MatchMemory, Knowledge, PatternRecord } from './types'

// ══════════════════════════════════════════
//  Match-Gedächtnis (pro Spiel)
// ══════════════════════════════════════════

/** Erzeugt ein leeres Spielgedächtnis */
export function createMatchMemory(): MatchMemory {
  return { patterns: new Map() }
}

/**
 * Registriert ein Ereignis im Gedächtnis.
 * pattern: z.B. 'pass_left', 'press_high', 'counter'
 * success: true = hat funktioniert, false = gescheitert
 */
export function recordEvent(memory: MatchMemory, pattern: string, success: boolean): void {
  let record = memory.patterns.get(pattern)

  if (!record) {
    record = { success: 0, failure: 0, trend: 0 }
    memory.patterns.set(pattern, record)
  }

  if (success) {
    record.success++
  } else {
    record.failure++
  }

  // Trend als rollender Durchschnitt: alte Werte zählen weniger
  record.trend = record.trend * 0.7 + (success ? 0.3 : -0.3)
}

/** Gibt den Trend für ein Muster zurück (-1 bis +1), oder 0 wenn unbekannt */
export function getTrend(memory: MatchMemory, pattern: string): number {
  const record = memory.patterns.get(pattern)
  return record ? record.trend : 0
}

/** Gibt den vollen Eintrag zurück, oder null */
export function getRecord(memory: MatchMemory, pattern: string): PatternRecord | null {
  return memory.patterns.get(pattern) ?? null
}

// ══════════════════════════════════════════
//  Abgeleitete Erkenntnisse
// ══════════════════════════════════════════

/** Alle Muster die vermieden werden sollten (trend < -0.4, mindestens 3 Versuche) */
export function getAvoiding(memory: MatchMemory): string[] {
  const result: string[] = []
  for (const [pattern, record] of memory.patterns) {
    const attempts = record.success + record.failure
    if (record.trend < -0.4 && attempts >= 3) {
      result.push(pattern)
    }
  }
  return result
}

/** Alle Muster die gut funktionieren (trend > 0.4, mindestens 2 Versuche) */
export function getWorking(memory: MatchMemory): string[] {
  const result: string[] = []
  for (const [pattern, record] of memory.patterns) {
    const attempts = record.success + record.failure
    if (record.trend > 0.4 && attempts >= 2) {
      result.push(pattern)
    }
  }
  return result
}

// ══════════════════════════════════════════
//  Persistentes Wissen (AI-vs-AI Training)
// ══════════════════════════════════════════

/** Lädt persistentes Wissen. Zunächst leer — wird durch Training befüllt. */
export function loadKnowledge(): Knowledge {
  // Später: JSON-Datei laden mit trainierten Strategie-Empfehlungen
  // Vorerst: leeres Wissen
  return {
    strategyHints: new Map(),
  }
}
