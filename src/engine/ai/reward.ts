/**
 * TIKITAQ RL — Reward-Funktion.
 *
 * Berechnet pro Turn-Übergang eine skalare Belohnung für das aktive Team.
 * Wird vom Arena-Orchestrator nach jedem `executeAITurn` aufgerufen, um
 * Trajectory-Einträge mit `reward`-Feld auszustatten.
 *
 * Vollständige Spec siehe `ml/REWARD.md`. Kurzfassung der Komponenten:
 *
 * 1. **Tore** (große Signale): ±15 für eigenes Tor / Gegentor
 * 2. **xG-Delta**: Veränderung der Tor-Wahrscheinlichkeit × 10
 * 3. **Ballbesitz-Dynamik** (zonen- und confidence-abhängig):
 *    - Ballgewinn eigene Hälfte: +2.0
 *    - Ballgewinn gegn. Hälfte: +1.0
 *    - Ballverlust eigene Hälfte: -2.0 × (1 + conf/200)
 *    - Ballverlust gegn. Hälfte: -0.5 × (1 - conf/200)
 * 4. **Zwischenziele**: Ecken (+2), Tackles (+1.5), Fouls gezogen (+0.5),
 *    Pass in Box (+1), Box-Präsenz (+0.5)
 * 5. **Defensive**: Tackle im 16er (+3), Elfmeter verursacht (-8),
 *    Karten (-2 / -10)
 * 6. **Führungs-Multiplikator**: dynamisch in den letzten 15 min
 */

import type { GameEvent, GameState, PlayerData, TeamSide } from '../types'
import { PITCH } from '../constants'
import { xgFromPosition } from '../xg'

const GOAL_REWARD = 15.0
const CONCEDE_REWARD = -15.0

const XG_WEIGHT = 10.0

const POSSESSION_GAIN_OWN_HALF = 2.0
const POSSESSION_GAIN_OPP_HALF = 1.0
const POSSESSION_LOSS_OWN_HALF_BASE = -2.0
const POSSESSION_LOSS_OPP_HALF_BASE = -0.5

const CORNER_WON = 2.0
const TACKLE_WON = 1.5
const TACKLE_WON_IN_OWN_BOX = 3.0
const FOUL_DRAWN = 0.5
const PASS_INTO_BOX = 1.0
const BOX_PRESENCE_PER_PLAYER = 0.5

const PENALTY_CAUSED = -8.0
const FOUL_COMMITTED = -0.5
const YELLOW_CARD = -2.0
const RED_CARD = -10.0

/**
 * Liefert die durchschnittliche Confidence des Teams als 0–100.
 */
function teamConfidence(state: GameState, team: TeamSide): number {
  const players = state.players.filter(p => p.team === team && p.positionLabel !== 'TW')
  if (players.length === 0) return 50
  return players.reduce((s, p) => s + p.confidence, 0) / players.length
}

/**
 * Welches Team hat den Ball? null bei losem Ball.
 */
function ballOwnerTeam(state: GameState): TeamSide | null {
  if (!state.ball.ownerId) return null
  const owner = state.players.find(p => p.id === state.ball.ownerId)
  return owner?.team ?? null
}

/**
 * Ist die Position in der eigenen Hälfte des Teams?
 * Team 1 verteidigt y=100, gegnerisches Tor bei y=0.
 * Eigene Hälfte für Team 1: y > 50.
 */
function inOwnHalf(pos: { x: number; y: number }, team: TeamSide): boolean {
  return team === 1 ? pos.y > 50 : pos.y < 50
}

/**
 * Wie viele Spieler des Teams stehen im gegnerischen Strafraum?
 */
function boxPresenceCount(state: GameState, team: TeamSide): number {
  const oppGoalY = team === 1 ? 0 : 100
  let count = 0
  for (const p of state.players) {
    if (p.team !== team) continue
    if (p.positionLabel === 'TW') continue
    const inXBox = p.position.x >= PITCH.PENALTY_AREA_LEFT && p.position.x <= PITCH.PENALTY_AREA_RIGHT
    const inYBox = Math.abs(p.position.y - oppGoalY) < PITCH.PENALTY_AREA_DEPTH
    if (inXBox && inYBox) count++
  }
  return count
}

/**
 * Tor-Differenz aus Sicht des Teams.
 */
function goalDifference(state: GameState, team: TeamSide): number {
  return team === 1
    ? state.score.team1 - state.score.team2
    : state.score.team2 - state.score.team1
}

/**
 * Multiplikator für End-Game-Verhalten (greift nur in den letzten 15 min).
 *
 * Bei Führung + hohe Confidence → weiter angreifen (Mult 1.0)
 * Bei Führung + niedrige Confidence → verwalten (xG-Mult 0.5, Verlust-Mult 1.5)
 * Bei Rückstand + hohe Confidence → all-in (xG-Mult 1.5, Verlust-Mult 0.5)
 * Bei Rückstand + niedrige Confidence → versuchen (xG-Mult 1.2, Verlust-Mult 1.0)
 */
function endGameMultipliers(state: GameState, team: TeamSide): { xg: number; loss: number } {
  if (state.gameTime < 75) return { xg: 1.0, loss: 1.0 }

  const goalDiff = goalDifference(state, team)
  const confNorm = teamConfidence(state, team) / 100  // 0..1

  if (goalDiff > 0) {
    return { xg: 0.5 + confNorm * 0.5, loss: 1.5 - confNorm * 0.5 }
  } else if (goalDiff < 0) {
    return { xg: 1.0 + confNorm * 0.5, loss: 1.0 - confNorm * 0.5 }
  } else {
    return { xg: 1.0, loss: 1.0 }
  }
}

/**
 * Hauptfunktion: berechnet die Reward für `team` aus dem Übergang.
 *
 * @param before          GameState VOR dem Turn (vom Team `team` ausgeführt)
 * @param after           GameState NACH dem Turn
 * @param team            Welches Team hat gerade gespielt
 * @param turnEvent       Das vom Turn ausgelöste GameEvent (für Tackles, Fouls etc.)
 */
export function computeStepReward(
  before: GameState,
  after: GameState,
  team: TeamSide,
  turnEvent: GameEvent | null,
): number {
  let reward = 0

  // ── 1. Tore ──
  const beforeOwn = team === 1 ? before.score.team1 : before.score.team2
  const afterOwn = team === 1 ? after.score.team1 : after.score.team2
  const beforeOpp = team === 1 ? before.score.team2 : before.score.team1
  const afterOpp = team === 1 ? after.score.team2 : after.score.team1
  if (afterOwn > beforeOwn) reward += GOAL_REWARD
  if (afterOpp > beforeOpp) reward += CONCEDE_REWARD

  // ── 2. xG-Delta ──
  // Nur sinnvoll, wenn das Team in beiden States den Ball hat oder hatte.
  const xgMult = endGameMultipliers(after, team).xg
  const opponents = after.players.filter(p => p.team !== team)
  const ballerBefore = before.players.find(p => p.id === before.ball.ownerId)
  const ballerAfter = after.players.find(p => p.id === after.ball.ownerId)

  if (ballerBefore?.team === team && ballerAfter?.team === team) {
    const xgBefore = xgFromPosition(before.ball.position, team, opponents)
    const xgAfter = xgFromPosition(after.ball.position, team, opponents)
    reward += (xgAfter - xgBefore) * XG_WEIGHT * xgMult
  }

  // ── 3. Ballbesitz-Dynamik ──
  const ownerBefore = ballOwnerTeam(before)
  const ownerAfter = ballOwnerTeam(after)
  const lossMult = endGameMultipliers(after, team).loss
  const conf = teamConfidence(after, team)

  if (ownerBefore !== team && ownerAfter === team) {
    // Ballgewinn
    reward += inOwnHalf(after.ball.position, team)
      ? POSSESSION_GAIN_OWN_HALF
      : POSSESSION_GAIN_OPP_HALF
  } else if (ownerBefore === team && ownerAfter !== null && ownerAfter !== team) {
    // Ballverlust direkt an Gegner
    if (inOwnHalf(after.ball.position, team)) {
      reward += POSSESSION_LOSS_OWN_HALF_BASE * (1 + conf / 200) * lossMult
    } else {
      reward += POSSESSION_LOSS_OPP_HALF_BASE * (1 - conf / 200) * lossMult
    }
  }

  // ── 4. Zwischenziele aus Event ──
  if (turnEvent) {
    switch (turnEvent.type) {
      case 'corner': {
        // Wer bekommt die Ecke? Hier: das angreifende Team — ist team selbst, falls es Ecken-empfänger ist
        const cornerTeam = ballOwnerTeam(after)
        if (cornerTeam === team) reward += CORNER_WON
        break
      }
      case 'tackle_won': {
        const tackler = after.players.find(p => p.id === turnEvent.playerId)
        if (tackler?.team === team) {
          // In eigenem 16er = 3.0, sonst 1.5
          const ownGoalY = team === 1 ? 100 : 0
          const inOwnBox = Math.abs(tackler.position.y - ownGoalY) < PITCH.PENALTY_AREA_DEPTH
            && tackler.position.x >= PITCH.PENALTY_AREA_LEFT
            && tackler.position.x <= PITCH.PENALTY_AREA_RIGHT
          reward += inOwnBox ? TACKLE_WON_IN_OWN_BOX : TACKLE_WON
        }
        break
      }
      case 'foul': {
        const fouler = after.players.find(p => p.id === turnEvent.playerId)
        if (fouler?.team === team) {
          reward += FOUL_COMMITTED
        } else {
          // Wir wurden gefoult → Foul gezogen (ist gut)
          reward += FOUL_DRAWN
        }
        break
      }
      case 'penalty': {
        // Foul im 16er — fast immer gegen das verteidigende Team
        const fouler = after.players.find(p => p.id === turnEvent.playerId)
        if (fouler?.team === team) reward += PENALTY_CAUSED
        break
      }
      case 'yellow_card': {
        const carded = after.players.find(p => p.id === turnEvent.playerId)
        if (carded?.team === team) reward += YELLOW_CARD
        break
      }
      case 'red_card': {
        const carded = after.players.find(p => p.id === turnEvent.playerId)
        if (carded?.team === team) reward += RED_CARD
        break
      }
      case 'pass_complete': {
        // Pass in den 16er?
        if (turnEvent.passKind === 'cross' || turnEvent.passKind === 'through_ball') {
          const passer = after.players.find(p => p.id === turnEvent.playerId)
          if (passer?.team === team) {
            const oppGoalY = team === 1 ? 0 : 100
            const target = turnEvent.position
            if (target) {
              const inBox = target.x >= PITCH.PENALTY_AREA_LEFT
                && target.x <= PITCH.PENALTY_AREA_RIGHT
                && Math.abs(target.y - oppGoalY) < PITCH.PENALTY_AREA_DEPTH
              if (inBox) reward += PASS_INTO_BOX
            }
          }
        }
        break
      }
    }
  }

  // ── 5. Box-Präsenz (nur wenn wir den Ball haben) ──
  if (ownerAfter === team) {
    const boxCount = boxPresenceCount(after, team)
    if (boxCount > 0) reward += boxCount * BOX_PRESENCE_PER_PLAYER
  }

  return reward
}

/**
 * Terminal-Reward: am Match-Ende für jedes Team ein einmaliges Signal.
 */
export function computeTerminalReward(
  finalState: GameState,
  team: TeamSide,
): number {
  const goalDiff = goalDifference(finalState, team)
  if (goalDiff > 0) return 20.0
  if (goalDiff < 0) return -10.0
  return 5.0
}
