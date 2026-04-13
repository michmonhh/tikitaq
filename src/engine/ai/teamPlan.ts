/**
 * TIKITAQ AI — Mannschaftsplan
 *
 * Wählt die Grundstrategie (Defensiv + Offensiv + Transition).
 * Überprüft jedes Spielviertel, ob die Strategie noch funktioniert.
 */

import type { GameState, TeamSide, PlayerData } from '../types'
import type {
  TeamPlan, TeamIdentity, StrengthComparison, StrategyCombo,
  DefenseStrategy, AttackStrategy, TransitionBehavior, MatchMemory,
} from './types'
import { calculateIdentity, compareStrength, widenConfidenceRange } from './identity'
import { getWorking, getAvoiding } from './memory'

// ══════════════════════════════════════════
//  Gültige Strategie-Kombinationen
// ══════════════════════════════════════════

interface ComboTemplate {
  defense: DefenseStrategy
  attack: AttackStrategy
  transition: TransitionBehavior
}

const VALID_COMBOS: ComboTemplate[] = [
  // High Press: aggressiv, braucht Qualität
  { defense: 'high_press', attack: 'possession',  transition: 'gegenpress' },
  { defense: 'high_press', attack: 'wing_play',   transition: 'gegenpress' },
  { defense: 'high_press', attack: 'switch_play', transition: 'gegenpress' },
  { defense: 'high_press', attack: 'direct',      transition: 'gegenpress' },
  // Mid Press: solide Mitte, flexibel
  { defense: 'mid_press',  attack: 'possession',  transition: 'gegenpress' },
  { defense: 'mid_press',  attack: 'counter',     transition: 'fall_back' },
  { defense: 'mid_press',  attack: 'wing_play',   transition: 'gegenpress' },
  { defense: 'mid_press',  attack: 'switch_play', transition: 'gegenpress' },
  { defense: 'mid_press',  attack: 'direct',      transition: 'fall_back' },
  // Deep Block: defensiv, kontert
  { defense: 'deep_block', attack: 'counter',     transition: 'fall_back' },
  { defense: 'deep_block', attack: 'wing_play',   transition: 'fall_back' },
  { defense: 'deep_block', attack: 'direct',      transition: 'fall_back' },
  // Man Marking: Chaos, gegen Ballbesitz-Teams
  { defense: 'man_marking', attack: 'counter',    transition: 'fall_back' },
  { defense: 'man_marking', attack: 'direct',     transition: 'fall_back' },
]

// ══════════════════════════════════════════
//  Initialen Plan erstellen
// ══════════════════════════════════════════

/** Erstellt den kompletten Mannschaftsplan vor dem Spiel */
export function createInitialPlan(
  ownPlayers: PlayerData[],
  opponentPlayers: PlayerData[],
): TeamPlan {
  const identity = calculateIdentity(ownPlayers)
  const strength = compareStrength(ownPlayers, opponentPlayers)
  const strategy = chooseStrategy(identity, strength)

  return {
    identity,
    strength,
    strategy,
    riskAppetite: identity.confidence / 100,
  }
}

// ══════════════════════════════════════════
//  Strategiewahl
// ══════════════════════════════════════════

/** Bewertet alle gültigen Kombinationen und wählt die beste */
export function chooseStrategy(
  identity: TeamIdentity,
  strength: StrengthComparison,
): StrategyCombo {
  const scored = VALID_COMBOS.map(combo => {
    const defScore = scoreDefense(combo.defense, identity, strength)
    const atkScore = scoreAttack(combo.attack, identity, strength)
    const synergy = synergyBonus(combo.defense, combo.attack)
    const noise = (Math.random() - 0.5) * 10  // ±5 Rauschen für Varianz
    const total = defScore + atkScore + synergy + noise

    return { ...combo, score: total, reason: '' }
  })

  // Beste Kombi wählen
  scored.sort((a, b) => b.score - a.score)
  const best = scored[0]
  best.reason = buildReason(best.defense, best.attack, identity, strength)

  return best
}

/** Defensiv-Score: wie gut passt diese Defensivstrategie? */
function scoreDefense(
  def: DefenseStrategy,
  id: TeamIdentity,
  str: StrengthComparison,
): number {
  switch (def) {
    case 'high_press':
      return id.selfImage * 0.3 + id.confidence * 0.3
        + (str.ownDefenseIsFast ? 15 : 0)
        - (str.opponentHasFastAttack ? 20 : 0)

    case 'mid_press':
      return 45 + id.confidence * 0.15 + str.defense * 10

    case 'deep_block':
      return (100 - id.selfImage) * 0.3
        + (str.opponentHasFastAttack ? 15 : 0)
        + (100 - id.confidence) * 0.2
        - (str.ownDefenseIsFast ? 10 : 0)

    case 'man_marking':
      return (str.opponentHasStarPlayer ? 30 : 0)
        + str.defense * 10
        - (str.opponentHasFastAttack ? 15 : 0)
  }
}

/** Offensiv-Score: wie gut passt diese Offensivstrategie? */
function scoreAttack(
  atk: AttackStrategy,
  id: TeamIdentity,
  str: StrengthComparison,
): number {
  switch (atk) {
    case 'possession':
      return (str.ownPassingStrong ? 25 : 0) + id.selfImage * 0.2 + str.passing * 20

    case 'counter':
      return str.pace * 20 + (100 - id.selfImage) * 0.15

    case 'wing_play':
      return (str.ownWingsStrong ? 25 : 0) + str.pace * 10

    case 'switch_play':
      return str.passing * 15 + (str.ownWingsStrong ? 10 : 0)

    case 'direct':
      return str.attack * 15 + Math.max(0, (50 - str.passing * 50)) * 0.1
  }
}

/** Synergie-Bonus: manche Kombis verstärken sich */
function synergyBonus(def: DefenseStrategy, atk: AttackStrategy): number {
  // Klassiker-Bonusse
  if (def === 'high_press' && atk === 'possession') return 8    // Guardiola
  if (def === 'high_press' && atk === 'wing_play') return 6     // Klopp
  if (def === 'high_press' && atk === 'direct') return 5        // Rangnick
  if (def === 'deep_block' && atk === 'counter') return 8       // Mourinho
  if (def === 'mid_press' && atk === 'counter') return 5        // Simeone
  if (def === 'man_marking' && atk === 'counter') return 6      // Chaos + Konter
  return 0
}

/** Klartext-Begründung für den Ticker */
function buildReason(
  def: DefenseStrategy,
  atk: AttackStrategy,
  id: TeamIdentity,
  str: StrengthComparison,
): string {
  const defNames: Record<DefenseStrategy, string> = {
    high_press: 'Angriffspressing',
    mid_press: 'Mittelfeldpressing',
    deep_block: 'Tiefer Block',
    man_marking: 'Manndeckung',
  }
  const atkNames: Record<AttackStrategy, string> = {
    possession: 'Ballbesitz',
    counter: 'Konter',
    wing_play: 'Flügelspiel',
    switch_play: 'Spielverlagerung',
    direct: 'Direktes Spiel',
  }

  let why = ''
  if (id.selfImage > 70) why = 'Wir sind überlegen'
  else if (id.selfImage > 45) why = 'Auf Augenhöhe'
  else why = 'Wir sind Außenseiter'

  if (str.opponentHasFastAttack && def === 'deep_block') why += ', Gegner hat schnelle Stürmer'
  if (str.ownWingsStrong && atk === 'wing_play') why += ', unsere Flügel sind stark'
  if (str.ownPassingStrong && atk === 'possession') why += ', wir sind passsicher'

  return `${defNames[def]} + ${atkNames[atk]} — ${why}`
}

// ══════════════════════════════════════════
//  Viertel-Überprüfung
// ══════════════════════════════════════════

/** Minuten, zu denen die Strategie überprüft wird */
export const REVIEW_MINUTES = [23, 45, 68] as const

/**
 * Überprüft ob die aktuelle Strategie funktioniert.
 * Gibt eine neue StrategyCombo zurück wenn Wechsel nötig, sonst null.
 */
export function reviewStrategy(
  plan: TeamPlan,
  state: GameState,
  team: TeamSide,
  memory: MatchMemory,
): { newStrategy: StrategyCombo; tickerMessage: string } | null {
  const stats = team === 1 ? state.matchStats.team1 : state.matchStats.team2
  const oppStats = team === 1 ? state.matchStats.team2 : state.matchStats.team1
  const score = team === 1 ? state.score : { team1: state.score.team2, team2: state.score.team1 }

  // Confidence-Rahmen weiten bei Führung/Rückstand
  const leading = score.team1 > score.team2
  const trailing = score.team1 < score.team2
  plan.identity = widenConfidenceRange(plan.identity, leading, trailing)

  // Performance-Indikatoren
  const ownShots = stats.shotsOnTarget + stats.shotsOff
  const oppShots = oppStats.shotsOnTarget + oppStats.shotsOff
  const totalTurns = state.totalTurns.team1 + state.totalTurns.team2
  const possession = totalTurns > 0 ? stats.possession / Math.max(1, totalTurns) : 0.5
  const passAccuracy = stats.passesTotal > 0 ? stats.passesCompleted / stats.passesTotal : 0.5

  // Memory-Erkenntnisse
  const avoiding = getAvoiding(memory)
  const working = getWorking(memory)

  // Strategie-Probleme erkennen
  let needsChange = false
  let changeReason = ''

  const cur = plan.strategy

  // Possession ohne Torschüsse?
  if (cur.attack === 'possession' && ownShots === 0 && state.gameTime > 20) {
    needsChange = true
    changeReason = 'Ballbesitz bringt keine Chancen'
  }

  // Deep Block aber viele Gegentore?
  if (cur.defense === 'deep_block' && score.team2 >= 2 && state.gameTime > 20) {
    needsChange = true
    changeReason = 'Abwehrblock hält nicht'
  }

  // High Press wird ständig überspielt?
  if (cur.defense === 'high_press' && avoiding.includes('press_high')) {
    needsChange = true
    changeReason = 'Pressing wird überspielt'
  }

  // Rückstand in der zweiten Halbzeit → mutiger werden
  if (trailing && state.gameTime > 60 && cur.defense === 'deep_block') {
    needsChange = true
    changeReason = 'Rückstand — müssen aktiver werden'
  }

  // Großer Rückstand → alles nach vorn
  if (score.team2 - score.team1 >= 2 && state.gameTime > 55) {
    needsChange = true
    changeReason = 'Großer Rückstand — alles nach vorn'
  }

  if (!needsChange) {
    // Strategie funktioniert → Confidence-Boost
    plan.identity = {
      ...plan.identity,
      confidence: Math.min(plan.identity.confidenceMax, plan.identity.confidence + 2),
    }
    return null
  }

  // Neue Strategie wählen (mit aktualisierter Confidence)
  const newStrategy = chooseStrategy(plan.identity, plan.strength)
  const tickerMessage = `Taktikwechsel: ${newStrategy.reason} (${changeReason})`

  return { newStrategy, tickerMessage }
}
