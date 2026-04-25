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
 *    Pass in Box (+1), Box-Präsenz (+0.15/Spieler, max 3 gezählt)
 * 5. **Schüsse** (v3): on target (+3), off target (+1) — bei Tor
 *    zusätzlich +15 aus #1.
 * 6. **Defensive**: Tackle im 16er (+3), Elfmeter verursacht (-8),
 *    Karten (-2 / -10), Defensive-Tiefe-Malus (v3, bis -1.5/Turn)
 * 7. **Führungs-Multiplikator**: dynamisch in den letzten 15 min
 *
 * Iterations-Historie:
 *   v1 (2026-04-24): Initial-Design, BOX_PRESENCE = 0.5
 *   v2 (2026-04-25): Anti-Hacking-Counters (Ecken, Fouls, Rückpässe)
 *   v3 (2026-04-25): BOX_PRESENCE 0.5→0.15 + Cap 3, Schuss-Reward (+3/+1),
 *                    Defensive-Tiefe-Malus (Verteidiger zu nah am Stürmer)
 */

import type { GameEvent, GameState, TeamSide } from '../types'
import { PITCH } from '../constants'
import { xgFromPosition } from '../xg'
import {
  cornerRewardFactor, foulDrawnRewardFactor, backwardPassExtraMalus,
  noteCorner, noteShotByTeam, noteFoulDrawn,
  notePossessionChange, noteBackwardPass, noteForwardPass,
} from './rewardState'

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

// Box-Präsenz: dichtes Signal, das aber leicht zu Camping verleitet.
// v3 (2026-04-25): von 0.5 → 0.15 reduziert + max 3 zählende Spieler,
// damit der RL-Bot nicht 4-5 Stürmer im 16er parkiert nur fürs Reward.
const BOX_PRESENCE_PER_PLAYER = 0.15
const BOX_PRESENCE_MAX_PLAYERS = 3

// Schuss-Rewards: bisher nur Tore (+15) explizit belohnt — der Schuss
// selbst war "unsichtbar" außer über xG-Delta. Jetzt expliziter Bonus,
// damit der Bot lernt: in Strafraum-Nähe lohnt sich abdrücken.
const SHOT_ON_TARGET = 3.0   // gehalten = Torchance erzwungen
const SHOT_OFF_TARGET = 1.0  // verfehlt = wenigstens committed

const PENALTY_CAUSED = -8.0
const FOUL_COMMITTED = -0.5
const YELLOW_CARD = -2.0
const RED_CARD = -10.0

// Defensive-Tiefe-Malus (v3 Add-on, 2026-04-25):
// Ein Verteidiger sollte tiefer (näher am eigenen Tor) stehen als der
// Stürmer in seiner Lane. Wenn der Buffer zu klein ist oder der
// Verteidiger gar VOR dem Stürmer steht, ist die Lane "überlaufen".
// Greift nur wenn der Stürmer in unserer Hälfte ist — sonst irrelevant.
const DEF_LABELS = new Set(['LV', 'IV', 'RV', 'ZDM'])
const DEF_LANE_WIDTH = 14         // x-Abstand bis Defender als "in-lane" gilt
const DEF_DEPTH_TARGET = 8        // gewünschter y-Buffer hinter dem Stürmer
const DEF_DEPTH_MALUS_PER_Y = 0.04
const DEF_DEPTH_MAX_PER_PAIR = 0.5
const DEF_DEPTH_TOTAL_CAP = 1.5

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
 * Defensive-Tiefe-Malus: Verteidiger in derselben Lane wie ein
 * gegnerischer Stürmer sollten tiefer stehen (näher zum eigenen Tor).
 *
 * Buffer = (defender.y − striker.y) * sign(team), wobei sign(1)=+1
 *  (Team 1 verteidigt y=100, Verteidiger sollte y > Stürmer.y haben),
 *  sign(2)=−1.
 *
 * Greift nur, wenn der Stürmer in unserer Hälfte steht — sonst ist die
 * Position taktisch ohne Bedrohung.
 *
 * Pro Paar maximal `DEF_DEPTH_MAX_PER_PAIR` Malus, gesamt-Cap
 * `DEF_DEPTH_TOTAL_CAP`. Größenordnung bewusst klein gehalten, um
 * andere Reward-Signale nicht zu überschreiben.
 */
function defensiveDepthMalus(state: GameState, team: TeamSide): number {
  const sign = team === 1 ? 1 : -1
  const defenders = state.players.filter(p =>
    p.team === team && DEF_LABELS.has(p.positionLabel),
  )
  if (defenders.length === 0) return 0

  const oppStrikers = state.players.filter(p =>
    p.team !== team && p.positionLabel === 'ST',
  )
  if (oppStrikers.length === 0) return 0

  let malus = 0
  for (const striker of oppStrikers) {
    // Stürmer muss in unserer Hälfte sein, damit es bedrohlich ist
    const inOurHalf = team === 1 ? striker.position.y > 50 : striker.position.y < 50
    if (!inOurHalf) continue

    // Bester (= tiefster) in-lane Verteidiger für diesen Stürmer
    let bestBuffer = -Infinity
    for (const def of defenders) {
      const dx = Math.abs(def.position.x - striker.position.x)
      if (dx > DEF_LANE_WIDTH) continue
      const buffer = (def.position.y - striker.position.y) * sign
      if (buffer > bestBuffer) bestBuffer = buffer
    }
    // Kein in-lane Verteidiger gefunden → keine Bestrafung HIER (das wäre
    // ein anderes Problem: "Lane offen", schwer einzeln zu bewerten).
    if (bestBuffer === -Infinity) continue

    if (bestBuffer < DEF_DEPTH_TARGET) {
      const severity = DEF_DEPTH_TARGET - bestBuffer  // 0..>16
      const pairMalus = Math.min(severity * DEF_DEPTH_MALUS_PER_Y, DEF_DEPTH_MAX_PER_PAIR)
      malus -= pairMalus
    }
  }

  return Math.max(malus, -DEF_DEPTH_TOTAL_CAP)
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
    notePossessionChange(team)
  } else if (ownerBefore === team && ownerAfter !== null && ownerAfter !== team) {
    // Ballverlust direkt an Gegner
    if (inOwnHalf(after.ball.position, team)) {
      reward += POSSESSION_LOSS_OWN_HALF_BASE * (1 + conf / 200) * lossMult
    } else {
      reward += POSSESSION_LOSS_OPP_HALF_BASE * (1 - conf / 200) * lossMult
    }
    notePossessionChange(team)
  }

  // ── 4. Zwischenziele aus Event ──
  if (turnEvent) {
    switch (turnEvent.type) {
      case 'corner': {
        // Wer bekommt die Ecke? Hier: das angreifende Team — ist team selbst, falls es Ecken-empfänger ist
        const cornerTeam = ballOwnerTeam(after)
        if (cornerTeam === team) {
          // Anti-Hacking: 3+ Ecken in Folge ohne Schuss → ⅓ Reward
          reward += CORNER_WON * cornerRewardFactor(team)
          noteCorner(team)
        }
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
          // Anti-Hacking: 3+ Fouls in Folge → halber Reward
          reward += FOUL_DRAWN * foulDrawnRewardFactor(team)
          noteFoulDrawn(team)
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
        const passer = after.players.find(p => p.id === turnEvent.playerId)
        if (passer?.team === team) {
          // Vorwärts/Rückwärts-Klassifikation für Anti-Spam
          const target = turnEvent.position
          if (target) {
            const beforePos = before.ball.position
            const isForward = team === 1
              ? target.y < beforePos.y - 1   // gegen Tor (kleinere y) für Team 1
              : target.y > beforePos.y + 1
            if (isForward) {
              noteForwardPass(team)
            } else {
              noteBackwardPass(team)
              reward += backwardPassExtraMalus(team)  // Negativ ab 6+ in Folge
            }
            // Pass in den 16er?
            if (turnEvent.passKind === 'cross' || turnEvent.passKind === 'through_ball') {
              const oppGoalY = team === 1 ? 0 : 100
              const inBox = target.x >= PITCH.PENALTY_AREA_LEFT
                && target.x <= PITCH.PENALTY_AREA_RIGHT
                && Math.abs(target.y - oppGoalY) < PITCH.PENALTY_AREA_DEPTH
              if (inBox) reward += PASS_INTO_BOX
            }
          }
        }
        break
      }
      case 'shot_scored':
      case 'shot_saved':
      case 'shot_missed': {
        // Schuss vom Team → Ecken-Counter resetten (Angriff hat Chance erzeugt)
        const shooter = after.players.find(p => p.id === turnEvent.playerId)
        if (shooter?.team === team) {
          noteShotByTeam(team)
          // Schuss-Bonus: gehalten/getroffen = on target (+3),
          // verfehlt = off target (+1). Bei Tor zusätzlich +15 aus #1.
          if (turnEvent.type === 'shot_missed') {
            reward += SHOT_OFF_TARGET
          } else {
            reward += SHOT_ON_TARGET
          }
        }
        break
      }
    }
  }

  // ── 5. Box-Präsenz (nur wenn wir den Ball haben) ──
  // Cap: max BOX_PRESENCE_MAX_PLAYERS gezählt — verhindert Reward-Hacking
  // durch Ankleben aller Stürmer am 5er.
  if (ownerAfter === team) {
    const rawBoxCount = boxPresenceCount(after, team)
    const cappedBoxCount = Math.min(rawBoxCount, BOX_PRESENCE_MAX_PLAYERS)
    if (cappedBoxCount > 0) reward += cappedBoxCount * BOX_PRESENCE_PER_PLAYER
  }

  // ── 6. Defensive-Tiefe (jederzeit relevant) ──
  // Verteidiger zu hoch / nicht in der Lane = leicht überlaufbar.
  reward += defensiveDepthMalus(after, team)

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
