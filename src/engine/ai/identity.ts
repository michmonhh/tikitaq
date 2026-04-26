/**
 * TIKITAQ AI — Mannschaftsidentität
 *
 * Berechnet Selbstverständnis, Selbstvertrauen und Stärkenvergleich.
 * Wird einmal vor dem Spiel berechnet; Confidence wird im Spiel aktualisiert.
 */

import type { PlayerData } from '../types'
import type { TeamIdentity, StrengthComparison, ConfidenceEvent } from './types'

// Liga-Referenzwerte (aus den 18 Bundesliga-Teams berechnet)
const LEAGUE_MIN_QUALITY = 71   // Bochum
const LEAGUE_MAX_QUALITY = 87   // München
const LEAGUE_SPREAD = LEAGUE_MAX_QUALITY - LEAGUE_MIN_QUALITY  // 16

// ── Selbstverständnis berechnen ──

/** Berechnet die Mannschaftsidentität vor dem Spiel */
export function calculateIdentity(ownPlayers: PlayerData[]): TeamIdentity {
  const avgQuality = averageStat(ownPlayers, 'quality')

  // selfImage: 25 (Bochum) bis 90 (München), linear skaliert
  const raw = 25 + ((avgQuality - LEAGUE_MIN_QUALITY) / LEAGUE_SPREAD) * 65
  const selfImage = clamp(raw, 20, 95)

  return {
    selfImage,
    confidence: selfImage,
    confidenceMax: selfImage + 25,
    confidenceMin: selfImage - 25,
  }
}

// ── Stärkenvergleich ──

/** Vergleicht die eigenen Stärken mit dem Gegner */
export function compareStrength(
  ownPlayers: PlayerData[],
  opponentPlayers: PlayerData[],
): StrengthComparison {
  // Positionsgruppen aufteilen
  const ownAttackers = ownPlayers.filter(p => ['ST', 'OM', 'LM', 'RM'].includes(p.positionLabel))
  const ownDefenders = ownPlayers.filter(p => ['IV', 'LV', 'RV'].includes(p.positionLabel))
  const ownMidfield = ownPlayers.filter(p => ['ZDM', 'ZM', 'LM', 'RM', 'OM'].includes(p.positionLabel))
  const ownWings = ownPlayers.filter(p => ['LM', 'RM'].includes(p.positionLabel))

  const oppAttackers = opponentPlayers.filter(p => ['ST', 'OM', 'LM', 'RM'].includes(p.positionLabel))
  const oppDefenders = opponentPlayers.filter(p => ['IV', 'LV', 'RV'].includes(p.positionLabel))
  const oppMidfield = opponentPlayers.filter(p => ['ZDM', 'ZM', 'LM', 'RM', 'OM'].includes(p.positionLabel))

  // Vergleiche berechnen (jeweils -1 bis +1)
  const pace = normalizedDiff(
    averageStat(ownAttackers, 'pacing'),
    averageStat(oppDefenders, 'pacing'),
  )
  const passing = normalizedDiff(
    averageStat(ownMidfield, 'shortPassing'),
    averageStat(oppMidfield, 'shortPassing'),
  )
  const defense = normalizedDiff(
    averageStat(ownDefenders, 'tackling'),
    averageStat(oppAttackers, 'finishing'),
  )
  const attack = normalizedDiff(
    averageStat(ownAttackers, 'finishing'),
    averageStat(oppDefenders, 'tackling'),
  )
  const overall = (pace + passing + defense + attack) / 4

  // Abgeleitete Erkenntnisse
  const oppAttackerPace = averageStat(oppAttackers, 'pacing')
  const ownDefPace = averageStat(ownDefenders, 'pacing')
  const ownMidPassing = averageStat(ownMidfield, 'shortPassing')
  const oppAvgQuality = averageStat(opponentPlayers, 'quality')

  const ownWingScore = ownWings.length > 0
    ? ownWings.reduce((sum, p) => sum + (p.stats.pacing + p.stats.dribbling) / 2, 0) / ownWings.length
    : 0

  const opponentHasStarPlayer = opponentPlayers.some(
    p => p.positionLabel !== 'TW' && p.stats.quality > oppAvgQuality + 12,
  )

  return {
    pace,
    passing,
    defense,
    attack,
    overall,
    opponentHasFastAttack: oppAttackerPace > 82,
    ownDefenseIsFast: ownDefPace > 72,
    ownPassingStrong: ownMidPassing > 78,
    ownWingsStrong: ownWingScore > 75,
    opponentHasStarPlayer,
  }
}

// ── Confidence im Spiel aktualisieren ──

/** Basis-Veränderung pro Event */
const CONFIDENCE_DELTAS: Record<ConfidenceEvent, number> = {
  goal_scored: 12,
  goal_conceded: -12,
  pass_complete: 0.3,
  pass_failed: -0.8,
  tackle_won: 1.5,
  tackle_lost: -1.5,
  save: 2,
  possession_turn: 0.2,
}

/**
 * Aktualisiert das Selbstvertrauen nach einem Event.
 * riskLevel (0-1): wie riskant war die Aktion?
 * Erfolgreiche Risiken boosten überproportional.
 */
export function updateConfidence(
  identity: TeamIdentity,
  event: ConfidenceEvent,
  riskLevel: number = 0,
): TeamIdentity {
  const base = CONFIDENCE_DELTAS[event]
  const multiplier = 1 + riskLevel  // riskLevel 0.5 → ×1.5
  const change = base * multiplier

  const newConfidence = clamp(
    identity.confidence + change,
    identity.confidenceMin,
    identity.confidenceMax,
  )

  return { ...identity, confidence: newConfidence }
}

/**
 * Weitet den Confidence-Rahmen bei anhaltender Dominanz/Zusammenbruch.
 * Aufgerufen bei der Viertel-Überprüfung.
 */
export function widenConfidenceRange(
  identity: TeamIdentity,
  leading: boolean,
  trailing: boolean,
): TeamIdentity {
  let { confidenceMax, confidenceMin } = identity
  if (leading) confidenceMax = Math.min(100, confidenceMax + 2)
  if (trailing) confidenceMin = Math.max(0, confidenceMin - 2)
  return { ...identity, confidenceMax, confidenceMin }
}

// ── Hilfsfunktionen ──

function averageStat(players: PlayerData[], stat: keyof PlayerData['stats']): number {
  if (players.length === 0) return 50
  return players.reduce((sum, p) => sum + p.stats[stat], 0) / players.length
}

function normalizedDiff(own: number, opponent: number): number {
  // Differenz normalisiert auf -1 bis +1 (bei max ±30 Punkte Unterschied)
  return clamp((own - opponent) / 30, -1, 1)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
