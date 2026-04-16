import type { GameState, PlayerData, TeamSide } from '../../types'

/**
 * Berechnet die Antizipationsfähigkeit eines Spielers (0–1).
 *
 * Abgeleitet aus vorhandenen Stats:
 * - defensiveRadius: Raumgespür, Spielverständnis defensiv
 * - quality: allgemeine Spielintelligenz
 * - tackling: Timing, Zweikampf-Antizipation
 *
 * Ergebnis: 0.25 (schwacher Spieler, reagiert kaum) bis 0.95 (Weltklasse, liest das Spiel)
 */
export function getAnticipation(player: PlayerData): number {
  const raw = player.stats.defensiveRadius * 0.35
    + player.stats.quality * 0.35
    + player.stats.tackling * 0.30
  // Skalierung: raw 50 → 0.25, raw 70 → 0.55, raw 85 → 0.80, raw 95 → 0.95
  return Math.max(0.15, Math.min(0.95, (raw - 40) / 65))
}

/**
 * Berechnet die durchschnittliche Mannschafts-Antizipation (0–1).
 *
 * Bessere Mannschaften verschieben als Block intelligenter,
 * schließen Räume kollektiv schneller.
 */
export function getTeamAnticipation(state: GameState, team: TeamSide): number {
  const teamPlayers = state.players.filter(p => p.team === team && p.positionLabel !== 'TW')
  if (teamPlayers.length === 0) return 0.5
  const avgQuality = teamPlayers.reduce((s, p) => s + p.stats.quality, 0) / teamPlayers.length
  // avgQuality 70 → 0.40, 80 → 0.60, 88 → 0.76
  return Math.max(0.25, Math.min(0.90, (avgQuality - 50) / 50))
}
