import type { GameState, PenaltyDirection, PenaltyState, ShootoutState, TeamSide } from '../../engine/types'
import {
  initShootout,
  buildShootoutPenaltyState,
  recordKick,
} from '../../engine/shootout'
import { aiChoosePenaltyDirection } from '../../engine/shooting'
import { PITCH } from '../../engine/constants'
import { addTicker } from './helpers'
import type { StoreGet, StoreSet } from './types'

/**
 * Positioniert die Spieler für einen Elfmeterschuss im Shootout.
 * - Schütze auf den Elfmeterpunkt (mit Ball)
 * - Torwart auf die Torlinie (ggf. bei pre-committed keeperDir nach links/rechts/mitte)
 * - Alle anderen Spieler bleiben auf der Gegenseite (Mittellinie) und werden
 *   gleichmäßig dort verteilt — sie spielen im Shootout keine Rolle.
 */
function positionForShootoutKick(
  state: GameState,
  penalty: PenaltyState,
  keeperDir: PenaltyDirection | null,
): GameState {
  const shooterTeam = penalty.shooterTeam
  const keeperTeam: TeamSide = shooterTeam === 1 ? 2 : 1
  const penaltySpotY = shooterTeam === 1 ? PITCH.PENALTY_SPOT_TOP_Y : PITCH.PENALTY_SPOT_BOTTOM_Y
  const goalLineY = keeperTeam === 1 ? 97 : 3
  const keeperX = keeperDir === 'left' ? 40 : keeperDir === 'right' ? 60 : 50

  // Mittellinie: alle Nicht-Schützen/TW stehen außerhalb des Strafraums
  // Team 1 Spieler auf y=52–60, Team 2 auf y=40–48 — jeweils auf eigener Hälfte
  const othersByTeam: Record<TeamSide, { y: number; xs: number[] }> = {
    1: { y: 55, xs: [20, 28, 36, 44, 52, 60, 68, 76, 84, 92] },
    2: { y: 45, xs: [20, 28, 36, 44, 52, 60, 68, 76, 84, 92] },
  }
  const slotIdx: Record<TeamSide, number> = { 1: 0, 2: 0 }

  const players = state.players.map(p => {
    if (p.id === penalty.shooterId) {
      const pos = { x: PITCH.CENTER_X, y: penaltySpotY }
      return { ...p, position: pos, origin: { ...pos } }
    }
    if (p.id === penalty.keeperId) {
      const pos = { x: keeperX, y: goalLineY }
      return { ...p, position: pos, origin: { ...pos } }
    }
    const slot = othersByTeam[p.team]
    const idx = slotIdx[p.team]
    slotIdx[p.team]++
    const pos = { x: slot.xs[idx % slot.xs.length], y: slot.y }
    return { ...p, position: pos, origin: { ...pos } }
  })

  return {
    ...state,
    players,
    ball: { position: { x: PITCH.CENTER_X, y: penaltySpotY }, ownerId: penalty.shooterId },
  }
}

/**
 * Entscheidet, ob die KI in diesem Shootout-Kick verteidigt (Keeper spielt).
 * Keine KI im Duell-Modus → user steuert immer den Keeper seines Teams.
 */
function isAIDefending(
  penalty: PenaltyState,
  localTeam: TeamSide | null,
  isVsAI: boolean,
  isDuel: boolean,
): boolean {
  if (isDuel) return false
  if (!isVsAI) return false
  const keeperTeam: TeamSide = penalty.shooterTeam === 1 ? 2 : 1
  // Lokaler Spieler ist immer Team 1 im vs-AI; falls Keeper auf Team 2 → KI verteidigt
  return keeperTeam !== (localTeam ?? 1)
}

/**
 * Richtet den nächsten Kick des Elfmeterschießens ein (Position + PenaltyState).
 * Ruft intern keine resolvePenalty auf — die Auflösung erfolgt asynchron,
 * sobald der Nutzer "Bereit" klickt bzw. der Ball gezogen wird.
 */
export function setupShootoutKick(
  set: StoreSet,
  get: StoreGet,
  shootout: ShootoutState,
): void {
  const { state, localTeam, isVsAI, isDuel } = get()
  if (!state) return
  const penalty = buildShootoutPenaltyState(state, shootout)
  if (!penalty) return

  const aiDef = isAIDefending(penalty, localTeam, isVsAI, isDuel)
  const keeperDir = aiDef ? aiChoosePenaltyDirection() : null
  const positioned = positionForShootoutKick(state, penalty, keeperDir)

  set({
    state: { ...positioned, shootoutState: shootout, phase: 'shootout_kick' },
    penaltyState: { ...penalty, keeperChoice: keeperDir },
    drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
    selectedPlayerId: null,
  })
}

/**
 * Startet das Elfmeterschießen am Ende der Verlängerung.
 * Wird von `endCurrentTurn` aufgerufen, wenn endTurn() phase='shootout' liefert.
 */
export function startShootout(set: StoreSet, get: StoreGet): void {
  const { state } = get()
  if (!state) return
  const shootout = initShootout()
  const tickerMsg = `Elfmeterschießen beginnt — Team ${shootout.order[0]} zuerst`
  const withTicker = addTicker(state, tickerMsg, 'penalty')
  set({ state: withTicker })
  setupShootoutKick(set, get, shootout)
}

/**
 * Wird nach jeder Kick-Auflösung (resolvePenalty) aufgerufen.
 * Dokumentiert den Schuss, prüft Entscheidung und geht entweder zu
 * 'full_time' oder richtet den nächsten Schuss ein.
 */
export function completeShootoutKick(
  set: StoreSet,
  get: StoreGet,
  scored: boolean,
): void {
  const { state, penaltyState } = get()
  if (!state || !state.shootoutState || !penaltyState) return

  const shootout = recordKick(
    state.shootoutState,
    penaltyState.shooterTeam,
    penaltyState.shooterId,
    scored,
  )

  if (shootout.decidedWinner !== null) {
    const winner = shootout.decidedWinner
    const loser: TeamSide = winner === 1 ? 2 : 1
    // Score bleibt auf dem Stand aus der Verlängerung (Gleichstand).
    // Den Sieger liefert shootoutState.decidedWinner; finalizeMatch nutzt diese Info.
    const msg = `Elfmeterschießen entschieden: Team ${winner} gewinnt gegen Team ${loser}!`
    let finalState: GameState = {
      ...state,
      shootoutState: shootout,
      phase: 'full_time',
    }
    finalState = addTicker(finalState, msg, 'half_time')
    finalState = addTicker(finalState, 'Abpfiff – Spielende', 'half_time')
    set({
      state: finalState,
      penaltyState: null,
      drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
    })
    get().showEvent('Full Time!', 5000)
    return
  }

  // Noch nicht entschieden → nächster Kick
  set({ state: { ...state, shootoutState: shootout } })
  setupShootoutKick(set, get, shootout)
}
