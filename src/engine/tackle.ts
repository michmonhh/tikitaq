import type { PlayerData, GameEvent, TeamSide } from './types'
import type { TackleEncounter } from './movement'
import { name } from './playerName'
import { getConfidenceModifier } from './confidence'
import { PITCH } from './constants'
import * as T from '../data/tickerTexts'

export interface TackleResult {
  outcome: 'won' | 'lost' | 'foul'
  inPenaltyArea: boolean   // Foul im Strafraum → Elfmeter
  winner: PlayerData
  loser: PlayerData
  card?: 'yellow' | 'red' | null
  event: GameEvent
  /** Wenn true: Verteidiger hat den Ball nahe der eigenen Grundlinie ins
   *  Toraus geklärt — Ecke für das angreifende Team. Nur bei outcome='won'
   *  möglich. */
  deflectedToCorner?: boolean
}

/**
 * Prüft ob eine Position im Strafraum eines Teams liegt.
 * Der Strafraum des verteidigenden Teams ist relevant für Elfmeter.
 */
function isInDefenderPenaltyArea(attackerPos: { x: number; y: number }, defenderTeam: TeamSide): boolean {
  if (attackerPos.x < PITCH.PENALTY_AREA_LEFT || attackerPos.x > PITCH.PENALTY_AREA_RIGHT) return false
  // Team 1 verteidigt unten (y=100), Team 2 verteidigt oben (y=0)
  if (defenderTeam === 1) return attackerPos.y >= (100 - PITCH.PENALTY_AREA_DEPTH)
  return attackerPos.y <= PITCH.PENALTY_AREA_DEPTH
}

/**
 * Resolve a tackle encounter with three possible outcomes:
 * - Won: defender cleanly takes the ball
 * - Lost: attacker shields and keeps possession
 * - Foul: defender commits a foul (determined by aggression/quality/confidence)
 *
 * Foul probability factors:
 * - High tackling + high quality → clean tackles, fewer fouls
 * - Low tackling + high aggression → more fouls
 * - Low confidence → panicky, reckless tackles
 * - Low fitness → sloppy challenges
 * - Im Strafraum: +50% höhere Foulwahrscheinlichkeit (hektische Situation)
 */
export function resolveTackle(encounter: TackleEncounter): TackleResult {
  const { defender, attacker, winProbability } = encounter

  // Prüfe ob der Zweikampf im Strafraum des Verteidigers stattfindet
  const inPenaltyArea = isInDefenderPenaltyArea(attacker.position, defender.team)

  // Calculate foul probability.
  // 2026-04-23: Im Strafraum sind Verteidiger REALISTISCH vorsichtiger
  // (Elfmeter-Gefahr), nicht aggressiver. Vorher 1.5x + cap 0.45. Das
  // führte nach dem Set-Piece-Phase-Fix (91e7921) zu 54 % Elfmeter-Toren
  // im Round-Robin. Jetzt 0.5x + cap 0.15 — Foul im 16er bleibt möglich,
  // ist aber nicht mehr die wahrscheinlichste Auflösung eines Zweikampfs.
  let foulChance = calculateFoulChance(defender, attacker)
  if (inPenaltyArea) {
    // 2026-04-22: weiter gedämpft nach Through-Ball-Defense-Fix. Mit weniger
    // Open-Play-Toren stieg der Elfmeter-Anteil relativ zurück auf 32 %.
    // Ziel Bundesliga ~10 %. 0.5x → 0.35x, cap 0.15 → 0.10.
    foulChance *= 0.35
    foulChance = Math.min(0.10, foulChance)
  }

  const roll = Math.random()

  if (roll < foulChance) {
    // FOUL committed by the defender
    const card = determineCard(defender, foulChance)
    const cardSuffix = card === 'red' ? ' RED CARD!' : card === 'yellow' ? ' Yellow card.' : ''
    const penaltySuffix = inPenaltyArea ? ' Elfmeter!' : ''

    return {
      outcome: 'foul',
      inPenaltyArea,
      winner: attacker,  // Fouled player "wins" (gets free kick / penalty)
      loser: defender,   // Fouler
      card,
      event: {
        type: inPenaltyArea ? 'penalty' : (card === 'red' ? 'red_card' : card === 'yellow' ? 'yellow_card' : 'foul'),
        playerId: defender.id,
        targetId: attacker.id,
        position: attacker.position,
        message: `Foul by ${name(defender)} on ${name(attacker)}!${cardSuffix}${penaltySuffix}`,
      },
    }
  }

  // No foul — resolve normally
  const tackleRoll = Math.random()
  const won = tackleRoll < winProbability

  if (won) {
    // #2: Tackle nahe der eigenen Grundlinie → Ball ins Toraus geklärt.
    // Wenn der Zweikampf nahe der Grundlinie stattfindet UND der Angreifer
    // Druck aus Richtung Tor machte, X % Chance dass der Defender den
    // Ball ins Aus schießt statt sauber zu klären.
    const defenderGoalY = defender.team === 1 ? 100 : 0
    const distFromGoalLine = Math.abs(defender.position.y - defenderGoalY)
    const nearGoalLine = distFromGoalLine < 10
    const wideEnough = defender.position.x < 35 || defender.position.x > 65
    if (nearGoalLine && wideEnough && Math.random() < 0.35) {
      return {
        outcome: 'won',
        inPenaltyArea: false,
        winner: defender,
        loser: attacker,
        card: null,
        deflectedToCorner: true,
        event: {
          type: 'corner',
          playerId: defender.id,
          targetId: attacker.id,
          position: defender.position,
          message: `${name(defender)} klärt zur Ecke!`,
        },
      }
    }
    return {
      outcome: 'won',
      inPenaltyArea: false,
      winner: defender,
      loser: attacker,
      card: null,
      event: {
        type: 'tackle_won',
        playerId: defender.id,
        targetId: attacker.id,
        position: defender.position,
        message: T.tickerTackleWon(name(defender), name(attacker)),
      },
    }
  }

  return {
    outcome: 'lost',
    inPenaltyArea: false,
    winner: attacker,
    loser: defender,
    card: null,
    event: {
      type: 'tackle_lost',
      playerId: defender.id,
      targetId: attacker.id,
      position: attacker.position,
      message: T.tickerTackleLost(name(attacker), name(defender)),
    },
  }
}

/**
 * Calculate the probability that a tackle results in a foul.
 * Range: ~5% (clean, skilled defender) to ~30% (reckless, unskilled).
 */
function calculateFoulChance(defender: PlayerData, attacker: PlayerData): number {
  // Base foul rate
  let foulRate = 0.12

  // Low tackling skill → more fouls
  foulRate += (100 - defender.stats.tackling) * 0.001

  // Low quality → more clumsy
  foulRate += (100 - defender.stats.quality) * 0.0005

  // Low confidence → panicky, reckless
  const confMod = getConfidenceModifier(defender)
  if (confMod < 1.0) foulRate += (1.0 - confMod) * 0.1

  // Low fitness → sloppy
  if (defender.fitness < 50) {
    foulRate += (50 - defender.fitness) * 0.002
  }

  // High dribbling of attacker makes it harder to tackle cleanly
  foulRate += (attacker.stats.dribbling / 100) * 0.05

  // Clamp
  return Math.max(0.03, Math.min(0.35, foulRate))
}

/**
 * Determine if a foul results in a card.
 * Higher foul chance (reckless) → more likely to get carded.
 */
function determineCard(_defender: PlayerData, foulChance: number): 'yellow' | 'red' | null {
  const cardRoll = Math.random()

  // 2026-04-23 kalibriert nach der Turn-Rate-Verdopplung (MINUTES_PER_TURN
  // 1 → 0.5): mit doppelt so vielen Zweikämpfen waren die alten Quoten
  // verdoppelt. Rot: Schwellwert 0.25 → 0.30 + Roll 0.05 → 0.02.
  // Gelb: Faktor 1.5 → 0.6.
  // Bundesliga-Target: ~15 % Karten pro Foul (davon ~3 % rot).
  if (foulChance > 0.30 && cardRoll < 0.02) return 'red'

  const yellowChance = foulChance * 0.6
  if (cardRoll < yellowChance) return 'yellow'

  return null
}
