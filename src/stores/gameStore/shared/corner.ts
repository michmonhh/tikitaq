/**
 * Shared helper: transitioniert einen bestehenden GameState in die Corner-
 * Phase. Setzt Ball an die Eckfahne, lädt den Taker, positioniert beide
 * Teams für den Eckstoß und schaltet die Phase auf 'corner'.
 *
 * Wird genutzt von:
 * - pass.ts: Pass geht ins Toraus
 * - shoot.ts: TW lenkt Schuss zur Ecke
 * - move.ts: Tackle nahe Grundlinie (Ball ins Aus geköpft) / Schuss-Block
 *
 * Die Funktion mutiert den State nicht, sondern gibt einen neuen GameState
 * zurück. Der Aufrufer muss den passenden lastEvent, ticker + showEvent-
 * Aufruf setzen.
 */

import type { GameState, PlayerData, Position, TeamSide } from '../../../engine/types'
import { repositionForSetPiece } from '../../../engine/ai/setPiece'
import { enforceCrossTeamSpacing, enforceOpponentMinDistFromBall } from '../../../engine/ai/setPieceHelpers'
import { findCornerTaker } from '../helpers'

export interface CornerTransitionOptions {
  /** Das angreifende Team (bekommt die Ecke) */
  attackingTeam: TeamSide
  /** Approximative x-Position des Balls beim Deflection — bestimmt,
   *  welche Eckfahne (links/rechts) genutzt wird. */
  originX: number
}

/**
 * Berechnet die Eckfahnen-Position für das angreifende Team + Seite.
 */
export function getCornerPosition(attackingTeam: TeamSide, originX: number): Position {
  const goalY = attackingTeam === 1 ? 3 : 97
  const cornerX = originX < 50 ? 4 : 96
  return { x: cornerX, y: goalY }
}

/**
 * Positioniert den Corner-Taker, beide Teams und setzt die Phase auf
 * 'corner'. Gibt den neuen GameState zurück — OHNE lastEvent, den der
 * Aufrufer setzt. `corners`-Stat wird NICHT incrementiert — das macht
 * der Aufrufer, damit die Logik für "Ecke zählt" konsistent bleibt.
 */
export function transitionToCorner(
  state: GameState,
  opts: CornerTransitionOptions,
): GameState {
  const cornerPos = getCornerPosition(opts.attackingTeam, opts.originX)
  const taker = findCornerTaker(state.players, opts.attackingTeam)

  let players: PlayerData[] = state.players

  if (taker) {
    players = players.map(p =>
      p.id === taker.id
        ? { ...p, position: { ...cornerPos }, origin: { ...cornerPos } }
        : p,
    )
  }

  const cornerBall = taker
    ? { position: { ...cornerPos }, ownerId: taker.id }
    : { position: { ...cornerPos }, ownerId: null }

  // Beide Teams aufstellen
  for (const team of [1 as TeamSide, 2 as TeamSide]) {
    const spState = { ...state, players, ball: cornerBall }
    const spActions = repositionForSetPiece(spState, team, 'corner')
    for (const action of spActions) {
      if (action.type === 'move') {
        players = players.map(p =>
          p.id === action.playerId
            ? { ...p, position: { ...action.target }, origin: { ...action.target } }
            : p,
        )
      }
    }
  }

  enforceCrossTeamSpacing(players, new Set(taker ? [taker.id] : []))
  enforceOpponentMinDistFromBall(players, cornerPos, opts.attackingTeam)

  return {
    ...state,
    players: players.map(p => ({
      ...p,
      hasActed: false,
      hasMoved: p.id === taker?.id,
      hasPassed: false,
      hasReceivedPass: false,
      origin: { ...p.position },
    })),
    ball: cornerBall,
    phase: 'corner',
    currentTurn: opts.attackingTeam,
    passesThisTurn: 0,
    ballOwnerChangedThisTurn: true,
    mustPass: false,
    setPieceReady: true,
    lastSetPiece: 'corner',
    // 2026-04-24: Corner-Cooldown für ~2 min (≈ 4 Turns). Gibt den
    // Ecken-Empfängern Schuss-Bonus und erlaubt der 2. Welle, den
    // Abpraller unter Druck nachzusetzen. Unabhängig vom lastSetPiece-
    // Reset beim ersten Pass.
    cornerCooldownUntilMin: state.gameTime + 2.0,
  }
}
