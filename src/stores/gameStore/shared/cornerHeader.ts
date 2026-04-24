/**
 * Corner-Header: Ein Corner-Pass in die Box wird als direkter Kopfball-
 * Schuss des Empfängers aufgelöst — kein Zwischenturn, kein Ballbesitz-
 * Wechsel auf den Empfänger. Behebt das Turn-Modell-Problem, dass
 * zwischen Flankenankunft und Abschluss ein Gegnerzug liegt und der
 * Verteidiger den Empfänger meist tacklet bevor er schießen kann.
 */

import type { GameState, TeamSide } from '../../../engine/types'
import type { PassResult } from '../../../engine/passing/applyPass'
import { resolveHeaderShot } from '../../../engine/shooting'
import { handleGoalScored } from '../../../engine/turn'
import { addGoalLog, updateTeamStats } from '../helpers'
import { transitionToCorner } from './corner'

export interface HeaderOutcome {
  newState: GameState
  /** Wenn true: State wurde in Corner-Phase transitioniert (Deflection) */
  transitionedToCorner: boolean
  /** Wenn true: Tor wurde erzielt und kickoff gesetzt */
  goalScored: boolean
}

/**
 * Versucht, einen erfolgreichen Corner-Pass in einen direkten Kopfball-
 * Abschluss umzuwandeln. Gibt `null` zurück, wenn die Bedingungen nicht
 * erfüllt sind (kein Corner-Cooldown / Empfänger außerhalb Box / etc.) —
 * in dem Fall läuft der normale Pass-Flow weiter.
 *
 * Bedingungen:
 * - state.lastSetPiece === 'corner' ODER cornerCooldownUntilMin > gameTime
 * - passResult.success && receiver existiert
 * - Empfänger im 16er des Gegners (Tordistanz < 18)
 */
export function maybeResolveCornerHeader(
  state: GameState,
  passResult: PassResult,
  attackingTeam: TeamSide,
): HeaderOutcome | null {
  // Nur wenn es wirklich ein Corner-Kontext ist
  const inCornerContext = state.lastSetPiece === 'corner'
    || (state.cornerCooldownUntilMin !== undefined
        && state.gameTime < state.cornerCooldownUntilMin)
  if (!inCornerContext) return null

  if (!passResult.success || !passResult.receiver) return null

  const receiver = passResult.receiver
  const receiverPos = passResult.receiverNewPosition ?? receiver.position
  const goalY = attackingTeam === 1 ? 0 : 100
  const receiverGoalDist = Math.hypot(receiverPos.x - 50, receiverPos.y - goalY)
  if (receiverGoalDist >= 18) return null  // zu weit vom Tor für Kopfball

  const keeper = state.players.find(
    p => p.team !== attackingTeam && p.positionLabel === 'TW',
  ) ?? null

  const header = resolveHeaderShot(receiver, receiverPos, attackingTeam, keeper)

  // ── TOR ──
  if (header.outcome === 'scored') {
    let s: GameState = {
      ...state,
      players: state.players.map(p =>
        p.id === receiver.id
          ? { ...p, gameStats: { ...p.gameStats, goalsScored: p.gameStats.goalsScored + 1 } }
          : p,
      ),
      lastEvent: header.event,
    }
    s = addGoalLog(s, receiver, 'open_play')
    s = updateTeamStats(s, attackingTeam, st => ({
      shotsOnTarget: st.shotsOnTarget + 1,
      xG: st.xG + 0.6,  // Nahe-Tor-Kopfball ist hohe Qualitätschance
    }))
    s = handleGoalScored(s, attackingTeam)
    s = { ...s, lastEvent: header.event }
    return { newState: s, transitionedToCorner: false, goalScored: true }
  }

  // ── GEHALTEN + zur Ecke gefaustet ──
  if (header.outcome === 'saved' && header.deflectedToCorner) {
    let s: GameState = { ...state, lastEvent: header.event }
    s = updateTeamStats(s, attackingTeam, st => ({
      shotsOnTarget: st.shotsOnTarget + 1,
      corners: st.corners + 1,
      xG: st.xG + 0.4,
    }))
    s = transitionToCorner(s, { attackingTeam, originX: receiverPos.x })
    s = { ...s, lastEvent: header.event }
    return { newState: s, transitionedToCorner: true, goalScored: false }
  }

  // ── GEHALTEN regulär / VERPASST ──
  // Keeper bekommt den Ball (vereinfachte Abstoß-/Save-Behandlung).
  if (keeper) {
    const newBall = { position: { ...keeper.position }, ownerId: keeper.id }
    let s: GameState = {
      ...state,
      ball: newBall,
      lastEvent: header.event,
    }
    if (header.outcome === 'saved') {
      s = updateTeamStats(s, attackingTeam, st => ({
        shotsOnTarget: st.shotsOnTarget + 1,
        xG: st.xG + 0.3,
      }))
    } else {
      s = updateTeamStats(s, attackingTeam, st => ({
        shotsOff: st.shotsOff + 1,
        xG: st.xG + 0.2,
      }))
    }
    return { newState: s, transitionedToCorner: false, goalScored: false }
  }

  return null
}
