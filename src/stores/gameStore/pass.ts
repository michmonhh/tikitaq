import type { GamePhase, TeamSide, PlayerData, Position } from '../../engine/types'
import { applyPass } from '../../engine/passing'
import { repositionForSetPiece } from '../../engine/ai/setPiece'
import { enforceCrossTeamSpacing, enforceOpponentMinDistFromBall } from '../../engine/ai/setPieceHelpers'
import { recordPassEvent } from '../../engine/ai'
import { adjustConfidence } from '../../engine/confidence'
import { distance, getTackleRadius } from '../../engine/geometry'
import { calculateTackleWinChance } from '../../engine/movement'
import { resolveTackle } from '../../engine/tackle'
import { addTicker, updateTeamStats, findThrowInTaker, findCornerTaker } from './helpers'
import type { GameStore, StoreSet, StoreGet } from './types'
import { maybeResolveCornerHeader } from './shared/cornerHeader'

/**
 * Tackle-Check beim Pass-Empfang (User-Direktive 2026-04-26):
 * Wenn ein gegnerischer Spieler im Tackle-Radius des Empfaengers steht,
 * fordert er den Ball. Damit haben Verteidiger eine Chance auf
 * Ballgewinn auch wenn der Empfaenger sofort schiessen wuerde.
 */
function findReceptionChallenger(
  receiver: PlayerData,
  receivedAt: Position,
  players: PlayerData[],
): PlayerData | null {
  const opponents = players.filter(p =>
    p.team !== receiver.team
    && p.positionLabel !== 'TW'
    && !p.cannotTackle,
  )
  let best: PlayerData | null = null
  let bestDist = Infinity
  for (const opp of opponents) {
    const radius = getTackleRadius(opp)
    const d = distance(opp.position, receivedAt)
    if (d <= radius && d < bestDist) {
      bestDist = d
      best = opp
    }
  }
  return best
}

export function makePassBall(set: StoreSet, get: StoreGet): GameStore['passBall'] {
  return (passerId, target, receiverId) => {
    const { state } = get()
    if (!state) return

    // Double pass rule: block second pass if not allowed
    if (!get().gameSettings.allowDoublePass && state.passesThisTurn >= 1) {
      get().showEvent('Nur ein Pass pro Zug', 2000, 'rule_pass')
      set({
        drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
        selectedPlayerId: null,
      })
      return
    }

    const result = applyPass({ type: 'pass', playerId: passerId, target, receiverId: receiverId ?? '' }, state)

    // 2026-04-24: Corner-Pass in die Box → direkter Kopfball-Abschluss.
    // Behebt das Turn-Modell-Problem, bei dem der Empfänger erst nach
    // einem Gegner-Zug schießen könnte und dabei meistens tackelt wird.
    // Wenn die Bedingungen greifen, ersetzt der Header-Flow den normalen
    // Pass-Complete-Pfad.
    {
      const headerOutcome = maybeResolveCornerHeader(state, result, state.currentTurn)
      if (headerOutcome) {
        set({
          state: headerOutcome.newState,
          drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
          selectedPlayerId: null,
        })
        const evType = headerOutcome.newState.lastEvent?.type ?? 'shot_scored'
        const msg = headerOutcome.newState.lastEvent?.message ?? 'Kopfball'
        get().showEvent(msg, 2500, evType)
        return
      }
    }

    // AI memory + identity: record pass outcome for the passing team.
    // No-op if that team is human-controlled.
    const passer = state.players.find(p => p.id === passerId)
    if (passer) recordPassEvent(passer.team, passer.position, target, result.success)

    let newPlayers = [...state.players]
    let newBall = { ...state.ball }
    let ballOwnerChanged = state.ballOwnerChangedThisTurn

    // Mark passer: hasPassed=true, hasActed only if they already moved
    newPlayers = newPlayers.map(p => {
      if (p.id !== passerId) return p
      const doneAfterPass = p.hasMoved // Already moved → now fully done
      return { ...p, hasPassed: true, hasActed: doneAfterPass, gameStats: { ...p.gameStats, passes: p.gameStats.passes + 1 } }
    })

    if (result.success && result.receiver) {
      // Through ball into space: receiver runs to the target position
      const landingPos = result.receiverNewPosition ?? result.receiver.position
      newBall = { position: { ...landingPos }, ownerId: result.receiver.id }
      newPlayers = newPlayers.map(p => {
        if (p.id !== result.receiver!.id) return p
        // Through ball: receiver ran → hasMoved=true, fully done
        const ranToSpace = result.receiverNewPosition != null
        const doneAfterReceive = p.hasMoved || ranToSpace
        return {
          ...p,
          hasReceivedPass: true,
          hasActed: doneAfterReceive,
          hasMoved: p.hasMoved || ranToSpace,
          position: ranToSpace ? { ...landingPos } : p.position,
          origin: ranToSpace ? { ...landingPos } : p.origin,
        }
      })
      ballOwnerChanged = true

      // ── Tackle beim Pass-Empfang (Reception-Challenge) ──
      // Wenn ein Gegner im Tackle-Radius des Empfaengers steht, fordert
      // er den Ball heraus. Vorher konnte der Empfaenger sofort schiessen,
      // egal ob ein Defender direkt neben ihm stand → User-Feedback:
      // "Verteidiger haben keine Chance".
      const updatedReceiver = newPlayers.find(p => p.id === result.receiver!.id)
      if (updatedReceiver) {
        const challenger = findReceptionChallenger(updatedReceiver, landingPos, newPlayers)
        if (challenger) {
          const tackleResult = resolveTackle({
            defender: challenger,
            attacker: updatedReceiver,
            winProbability: calculateTackleWinChance(challenger, updatedReceiver),
          })

          if (tackleResult.outcome === 'won') {
            // Defender erobert den Ball direkt
            newBall = {
              position: { ...tackleResult.winner.position },
              ownerId: tackleResult.winner.id,
            }
            newPlayers = newPlayers.map(p => {
              if (p.id === tackleResult.winner.id) {
                return adjustConfidence({
                  ...p, hasActed: true,
                  gameStats: { ...p.gameStats, tacklesWon: p.gameStats.tacklesWon + 1 },
                }, 'tackle_won')
              }
              if (p.id === tackleResult.loser.id) {
                return adjustConfidence({
                  ...p, hasActed: true, cannotTackle: true,
                  gameStats: { ...p.gameStats, tacklesLost: p.gameStats.tacklesLost + 1 },
                }, 'tackle_lost')
              }
              return p
            })
          } else if (tackleResult.outcome === 'lost') {
            // Empfaenger behaelt Ball, Defender wird gesperrt (kein Doppel-Tackle)
            newPlayers = newPlayers.map(p => {
              if (p.id === tackleResult.winner.id) {
                return adjustConfidence({ ...p, hasActed: true }, 'tackle_won')
              }
              if (p.id === tackleResult.loser.id) {
                return adjustConfidence({
                  ...p, hasActed: true, cannotTackle: true,
                  gameStats: { ...p.gameStats, tacklesLost: p.gameStats.tacklesLost + 1 },
                }, 'tackle_lost')
              }
              return p
            })
          } else if (tackleResult.outcome === 'foul') {
            // Foul vom Defender → Empfaenger bekommt Freistoss am
            // Empfangs-Punkt. Wir setzen die Phase, alle Spieler werden
            // entsprechend repositioniert. Recordet wird im Ticker.
            newBall = { position: { ...landingPos }, ownerId: updatedReceiver.id }
            newPlayers = newPlayers.map(p => {
              if (p.id === tackleResult.loser.id) {
                return adjustConfidence({
                  ...p, hasActed: true,
                  gameStats: { ...p.gameStats, tacklesLost: p.gameStats.tacklesLost + 1 },
                }, 'tackle_lost')
              }
              if (p.id === tackleResult.winner.id) {
                return adjustConfidence({ ...p, hasActed: true }, 'tackle_won')
              }
              return p
            })
            // Phase wird im uebergeordneten Set-Update korrekt gesetzt;
            // hier nur das Tackle-Outcome durchziehen. Detail-Recording
            // (Karten/Elfmeter) folgt der bestehenden move.ts-Logik —
            // hier vereinfacht, weil Reception-Foul ein Edge-Case ist.
          }

          // Tackle-Event als Overlay anzeigen (analog move.ts)
          get().showEvent(tackleResult.event.message, 3000, tackleResult.event.type)
        }
      }
    } else if (result.interceptedBy) {
      // Interception — ball changes owner
      newBall = { position: { ...result.interceptedBy.position }, ownerId: result.interceptedBy.id }
      ballOwnerChanged = true
    } else if (result.event.type === 'offside') {
      // Abseits → Freistoß an der Position des abseits-stehenden Empfängers (FIFA Law 12)
      const defendingTeam: TeamSide = state.currentTurn === 1 ? 2 : 1
      const fkPos = result.event.position ?? newBall.position
      const fkBallPos = { x: fkPos.x, y: fkPos.y }

      // Freistoß-Nehmer: Spieler dessen Grundposition (origin) am nächsten zur Abseits-Stelle liegt
      const fkTaker = newPlayers
        .filter(p => p.team === defendingTeam && p.positionLabel !== 'TW')
        .sort((a, b) => {
          const da = Math.sqrt((a.origin.x - fkBallPos.x) ** 2 + (a.origin.y - fkBallPos.y) ** 2)
          const db = Math.sqrt((b.origin.x - fkBallPos.x) ** 2 + (b.origin.y - fkBallPos.y) ** 2)
          return da - db
        })[0]

      if (fkTaker) {
        newPlayers = newPlayers.map(p =>
          p.id === fkTaker.id
            ? { ...p, position: { ...fkBallPos }, origin: { ...fkBallPos } }
            : p,
        )
        newBall = { position: { ...fkBallPos }, ownerId: fkTaker.id }
      }

      // Beide Teams aufstellen, dann Freistoß-Phase setzen
      for (const team of [1 as TeamSide, 2 as TeamSide]) {
        const spState = { ...state, players: newPlayers, ball: newBall }
        const spActions = repositionForSetPiece(spState, team, 'free_kick')
        for (const action of spActions) {
          if (action.type === 'move') {
            newPlayers = newPlayers.map(p =>
              p.id === action.playerId
                ? { ...p, position: { ...action.target }, origin: { ...action.target } }
                : p,
            )
          }
        }
      }
      enforceCrossTeamSpacing(newPlayers, new Set(fkTaker ? [fkTaker.id] : []))
      // FIFA Law 13: Gegner mind. 9.15 m vom Ball beim Freistoß
      enforceOpponentMinDistFromBall(newPlayers, fkBallPos, defendingTeam)

      set({
        state: {
          ...state,
          players: newPlayers.map(p => ({
            ...p,
            hasActed: false,
            hasMoved: p.id === fkTaker?.id,
            hasPassed: false,
            hasReceivedPass: false,
            origin: { ...p.position },
          })),
          ball: newBall,
          phase: 'free_kick',
          currentTurn: defendingTeam,
          ticker: [...state.ticker, {
            minute: state.gameTime,
            message: result.event.message,
            type: 'offside',
            team: state.currentTurn,
          }],
          passesThisTurn: 0,
          ballOwnerChangedThisTurn: false,
          mustPass: true,
          setPieceReady: false,
          lastSetPiece: 'free_kick',
          lastEvent: result.event,
        },
        drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
        selectedPlayerId: null,
      })
      get().showEvent('Abseits', 3000, 'offside')
      return
    } else if (result.outOfBounds && result.ballLandingPos) {
      // Ball went out of bounds — transition to throw-in or corner phase
      const opposingTeam: TeamSide = state.currentTurn === 1 ? 2 : 1
      const landingPos = result.ballLandingPos

      if (result.outOfBounds === 'throw_in') {
        // --- THROW-IN ---
        const throwX = landingPos.x < 50 ? 4 : 96
        const throwY = Math.max(5, Math.min(95, landingPos.y))
        const throwPos = { x: throwX, y: throwY }

        const taker = findThrowInTaker(newPlayers, opposingTeam, throwX)
        if (taker) {
          newPlayers = newPlayers.map(p =>
            p.id === taker.id ? { ...p, position: { ...throwPos }, origin: { ...throwPos } } : p,
          )
          newBall = { position: { ...throwPos }, ownerId: taker.id }
        } else {
          newBall = { position: { ...throwPos }, ownerId: null }
        }

        // Reposition both teams for the set piece (no "Throw In" button — user
        // passes directly, so defenders need sensible default positioning).
        for (const team of [1 as TeamSide, 2 as TeamSide]) {
          const spState = { ...state, players: newPlayers, ball: newBall }
          const spActions = repositionForSetPiece(spState, team, 'throw_in')
          for (const action of spActions) {
            if (action.type === 'move') {
              newPlayers = newPlayers.map(p =>
                p.id === action.playerId
                  ? { ...p, position: { ...action.target }, origin: { ...action.target } }
                  : p,
              )
            }
          }
        }
        enforceCrossTeamSpacing(newPlayers, new Set(taker ? [taker.id] : []))

        // Track stats + ticker, then transition to throw_in phase
        let trackedState = { ...state, players: newPlayers, ball: newBall }
        trackedState = updateTeamStats(trackedState, state.currentTurn, s => ({
          passesTotal: s.passesTotal + 1,
        }))
        trackedState = addTicker(trackedState, result.event.message, result.event.type, state.currentTurn)

        set({
          state: {
            ...trackedState,
            players: trackedState.players.map(p => ({
              ...p,
              hasActed: false,
              hasMoved: p.id === taker?.id, // Taker is pre-marked → after passing, hasActed=true
              hasPassed: false,
              hasReceivedPass: false,
              origin: { ...p.position },
            })),
            phase: 'throw_in',
            currentTurn: opposingTeam,
            passesThisTurn: 0,
            ballOwnerChangedThisTurn: false,
            mustPass: false,
            lastSetPiece: 'throw_in',
            lastEvent: result.event,
          },
          drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
          selectedPlayerId: null,
        })
        get().showEvent('Einwurf', 2000, 'throw_in')
        return
      } else {
        // --- CORNER ---
        // Wer bekommt die Ecke? Normalerweise opposingTeam (der Passer hat
        // den Ball über seine eigene Grundlinie gespielt). Bei
        // abgefälschter Flanke / Pass-Deflection im 16er (Felder #6, #10)
        // bekommt ihn aber der Passer selbst — dann wird
        // `cornerForAttackingTeam` im PassResult explizit gesetzt.
        const attackingTeam = result.cornerForAttackingTeam ?? opposingTeam
        // Corner position: near the goal the attacking team targets
        const goalY = attackingTeam === 1 ? 3 : 97
        const cornerX = landingPos.x < 50 ? 4 : 96
        const cornerPos = { x: cornerX, y: goalY }

        const taker = findCornerTaker(newPlayers, attackingTeam)
        if (taker) {
          newPlayers = newPlayers.map(p =>
            p.id === taker.id ? { ...p, position: { ...cornerPos }, origin: { ...cornerPos } } : p,
          )
          newBall = { position: { ...cornerPos }, ownerId: taker.id }
        } else {
          newBall = { position: { ...cornerPos }, ownerId: null }
        }

        // Reposition both teams for the corner (no "Corner" button — user
        // passes directly, so defenders need sensible default positioning).
        for (const team of [1 as TeamSide, 2 as TeamSide]) {
          const spState = { ...state, players: newPlayers, ball: newBall }
          const spActions = repositionForSetPiece(spState, team, 'corner')
          for (const action of spActions) {
            if (action.type === 'move') {
              newPlayers = newPlayers.map(p =>
                p.id === action.playerId
                  ? { ...p, position: { ...action.target }, origin: { ...action.target } }
                  : p,
              )
            }
          }
        }
        enforceCrossTeamSpacing(newPlayers, new Set(taker ? [taker.id] : []))
        // FIFA Law 17: Gegner mind. 9.15 m vom Ball beim Eckstoß
        enforceOpponentMinDistFromBall(newPlayers, cornerPos, attackingTeam)

        // Track stats + ticker, then transition to corner phase
        let trackedState = { ...state, players: newPlayers, ball: newBall }
        trackedState = updateTeamStats(trackedState, state.currentTurn, s => ({
          passesTotal: s.passesTotal + 1,
          corners: s.corners + 1,
        }))
        trackedState = addTicker(trackedState, result.event.message, result.event.type, state.currentTurn)

        set({
          state: {
            ...trackedState,
            players: trackedState.players.map(p => ({
              ...p,
              hasActed: false,
              hasMoved: p.id === taker?.id, // Taker is pre-marked → after passing, hasActed=true
              hasPassed: false,
              hasReceivedPass: false,
              origin: { ...p.position },
            })),
            phase: 'corner',
            currentTurn: attackingTeam,
            passesThisTurn: 0,
            ballOwnerChangedThisTurn: false,
            mustPass: false,
            lastSetPiece: 'corner',
            lastEvent: result.event,
          },
          drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
          selectedPlayerId: null,
        })
        get().showEvent('Ecke', 2000, 'corner')
        return
      }
    } else if (result.ballLandingPos) {
      // Pass missed — ball lands free at target position, no owner
      newBall = { position: { ...result.ballLandingPos }, ownerId: null }
      ballOwnerChanged = true
    }

    // Show on-field message only for turnovers
    if (['pass_intercepted', 'pass_lost'].includes(result.event.type)) {
      get().showEvent(result.event.message, 3000, result.event.type)
    }

    // Confidence updates
    newPlayers = newPlayers.map(p => {
      if (p.id === passerId) return adjustConfidence(p, result.success ? 'pass_complete' : 'pass_failed')
      if (result.interceptedBy && p.id === result.interceptedBy.id) return adjustConfidence(p, 'intercept')
      return p
    })

    // Track pass stats + ticker
    let trackedState = { ...state, players: newPlayers, ball: newBall }
    const passingTeam = state.currentTurn
    trackedState = updateTeamStats(trackedState, passingTeam, s => ({
      passesTotal: s.passesTotal + 1,
      passesCompleted: s.passesCompleted + (result.success ? 1 : 0),
      corners: s.corners + (result.outOfBounds === 'corner' ? 1 : 0),
    }))
    trackedState = addTicker(trackedState, result.event.message, result.event.type, passingTeam)

    // If this pass was executed from a standard (free_kick / corner /
    // throw_in), the set piece is now over — transition to 'playing'. The
    // user no longer clicks a dedicated confirm button; the first pass from
    // the taker ends the standard automatically. Kickoff keeps its explicit
    // "Kickoff" button and is not handled here.
    const wasSetPiecePhase = trackedState.phase === 'free_kick'
      || trackedState.phase === 'corner'
      || trackedState.phase === 'throw_in'
    const nextPhase: GamePhase = wasSetPiecePhase ? 'playing' : trackedState.phase

    set({
      state: {
        ...trackedState,
        phase: nextPhase,
        passesThisTurn: state.passesThisTurn + 1,
        ballOwnerChangedThisTurn: ballOwnerChanged,
        mustPass: false,
        setPieceReady: true,
        lastSetPiece: null, // Clear after first pass (corner no-offside only applies to direct pass)
        lastEvent: result.event,
      },
      drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
      selectedPlayerId: null,
    })
  }
}
