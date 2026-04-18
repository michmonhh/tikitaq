// Elfmeterschießen-Engine (IFAB Law 10).
//
// Ablauf:
//   - Reihenfolge (wer zuerst schießt) wird per Zufall bestimmt (siehe initShootout).
//   - Je Runde schießt Team A, dann Team B.
//   - Die ersten 5 Runden (SHOOTOUT_ROUNDS) sind die reguläre Serie. Danach
//     läuft es als Sudden Death weiter — je Runde weiter A, dann B.
//   - Entscheidung tritt ein, sobald ein Team den Vorsprung selbst bei optimalem
//     Ausgang aller verbleibenden regulären Schüsse nicht mehr aufholen kann,
//     ODER in Sudden Death nach jeder vollständigen Runde bei ungleichem Stand.
//   - Schützenreihenfolge: Spieler nach `stats.finishing` absteigend, jeder
//     Spieler schießt höchstens einmal, bevor die Liste zurückgesetzt wird.

import type { GameState, PlayerData, PenaltyState, ShootoutState, TeamSide } from './types'
import { GAME } from './constants'

/**
 * Initialisiert den Elfmeterschießen-Zustand nach Ende der Verlängerung.
 * Reihenfolge wird zufällig bestimmt (IFAB: Coin Toss).
 */
export function initShootout(): ShootoutState {
  const first: TeamSide = Math.random() < 0.5 ? 1 : 2
  const second: TeamSide = first === 1 ? 2 : 1
  return {
    order: [first, second],
    round: 1,
    kicks: [],
    usedPlayers: { team1: [], team2: [] },
    decidedWinner: null,
  }
}

/**
 * Bestimmt, welches Team den nächsten Schuss hat.
 * - In Runde r ist order[0] zuerst, dann order[1].
 * - `kicks.length` liefert den 0-basierten Index innerhalb der Gesamtsequenz.
 */
export function nextShooterTeam(shootout: ShootoutState): TeamSide {
  // Innerhalb einer Runde: Kick 0 → order[0], Kick 1 → order[1]
  const kicksInCurrentRound = shootout.kicks.length % 2
  return shootout.order[kicksInCurrentRound]
}

/**
 * Liefert den nächsten Schützen des Teams.
 * Reihenfolge: alle 11 Spieler nach `finishing` absteigend. Spieler, die in
 * `usedPlayers[teamX]` stehen, werden übersprungen. Sobald alle 11 geschossen
 * haben, wird die Liste in `pushUsedPlayer` zurückgesetzt.
 */
export function pickShooter(team: TeamSide, state: GameState, shootout: ShootoutState): PlayerData | null {
  const usedKey = team === 1 ? 'team1' : 'team2'
  const used = new Set(shootout.usedPlayers[usedKey])

  const candidates = state.players
    .filter(p => p.team === team && !used.has(p.id))
    .sort((a, b) => b.stats.finishing - a.stats.finishing)

  return candidates[0] ?? null
}

/**
 * Liefert den Torwart des verteidigenden Teams.
 */
export function pickKeeper(shooterTeam: TeamSide, state: GameState): PlayerData | null {
  const keeperTeam: TeamSide = shooterTeam === 1 ? 2 : 1
  return state.players.find(p => p.team === keeperTeam && p.positionLabel === 'TW') ?? null
}

/**
 * Baut den PenaltyState für den nächsten Kick im Shootout.
 */
export function buildShootoutPenaltyState(state: GameState, shootout: ShootoutState): PenaltyState | null {
  const team = nextShooterTeam(shootout)
  const shooter = pickShooter(team, state, shootout)
  const keeper = pickKeeper(team, state)
  if (!shooter || !keeper) return null
  return {
    shooterTeam: team,
    shooterId: shooter.id,
    keeperId: keeper.id,
    shooterChoice: null,
    keeperChoice: null,
  }
}

/**
 * Erweitert den Shootout-State um einen neuen Kick.
 * Setzt `usedPlayers` zurück, wenn alle 11 Spieler einmal geschossen haben.
 * Erhöht `round`, sobald beide Teams in der aktuellen Runde geschossen haben.
 * Prüft Entscheidung und setzt `decidedWinner` entsprechend.
 */
export function recordKick(
  shootout: ShootoutState,
  team: TeamSide,
  playerId: string,
  scored: boolean,
): ShootoutState {
  const newKicks = [...shootout.kicks, { team, playerId, scored }]
  const usedKey = team === 1 ? 'team1' : 'team2'
  const newUsed = [...shootout.usedPlayers[usedKey], playerId]
  // Reset nach 11 Schüssen (alle Spieler einmal geschossen)
  const resetUsed = newUsed.length >= 11 ? [] : newUsed

  const newRound = newKicks.length % 2 === 0 ? shootout.round + 1 : shootout.round

  const next: ShootoutState = {
    ...shootout,
    kicks: newKicks,
    usedPlayers: {
      ...shootout.usedPlayers,
      [usedKey]: resetUsed,
    },
    round: newRound,
  }

  next.decidedWinner = computeWinner(next)
  return next
}

/**
 * Prüft, ob das Elfmeterschießen entschieden ist.
 * Rückgabe: Sieger-Team oder null (weiter schießen).
 */
export function computeWinner(shootout: ShootoutState): TeamSide | null {
  const { team1Scored, team2Scored, team1Kicks, team2Kicks } = tally(shootout)
  const REGS = GAME.SHOOTOUT_ROUNDS

  // Reguläre Phase (erste 5 Runden): Entscheidung, sobald Gegner auch bei
  // perfektem Rest nicht mehr aufschließen kann.
  if (team1Kicks <= REGS && team2Kicks <= REGS) {
    const team1Remaining = REGS - team1Kicks
    const team2Remaining = REGS - team2Kicks
    if (team1Scored > team2Scored + team2Remaining) return 1
    if (team2Scored > team1Scored + team1Remaining) return 2
    // Sonderfall: nach 5+5 Kicks in regulärer Phase — direkt prüfen
    if (team1Kicks === REGS && team2Kicks === REGS && team1Scored !== team2Scored) {
      return team1Scored > team2Scored ? 1 : 2
    }
    return null
  }

  // Sudden Death: Entscheidung nur nach vollständiger Runde (gleiche Kick-Anzahl)
  if (team1Kicks === team2Kicks && team1Scored !== team2Scored) {
    return team1Scored > team2Scored ? 1 : 2
  }
  return null
}

export function tally(shootout: ShootoutState): {
  team1Scored: number
  team2Scored: number
  team1Kicks: number
  team2Kicks: number
} {
  let team1Scored = 0, team2Scored = 0, team1Kicks = 0, team2Kicks = 0
  for (const k of shootout.kicks) {
    if (k.team === 1) {
      team1Kicks++
      if (k.scored) team1Scored++
    } else {
      team2Kicks++
      if (k.scored) team2Scored++
    }
  }
  return { team1Scored, team2Scored, team1Kicks, team2Kicks }
}
