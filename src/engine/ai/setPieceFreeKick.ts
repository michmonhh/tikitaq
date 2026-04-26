/**
 * Free kick positioning — offensive and defensive.
 *
 * Konventionen / Regeln (User-Direktive 2026-04-26):
 * 1. In der Naehe des Schuetzen darf maximal EIN eigener Spieler stehen
 *    (= short-pass option). Alle anderen halten Mindestabstand
 *    SHOOTER_KEEPOUT_RADIUS, sonst werden ihre Targets radial nach aussen
 *    geschoben.
 * 2. Verteidiger stehen bei OFFENSIVEN Freistoessen NICHT tief —
 *    sondern ruecken mit auf zur Konter-Absicherung. Bei einem Mittel-
 *    feld-Freistoss (ballPos.y ~ 50) stehen sie auf Hoehe ballPos+8,
 *    nicht halfway zwischen Ball und eigenem Tor.
 */

import type { PlayerData, Position, PlayerAction, TeamSide } from '../types'
import { distance } from '../geometry'
import {
  ownGoalY, attackGoalY, ownGoalCenter,
  distToAttackGoal, shiftToward, clamp,
  isDefender, isAttacker, isMidfielder,
  moveAction,
} from './setPieceHelpers'

/** Mindestabstand zum Schuetzen, wenn man NICHT die kurze Option ist. */
const SHOOTER_KEEPOUT_RADIUS = 12

/**
 * Wenn `target` zu nahe am Schuetzen ist, schiebt es radial weg.
 * Ausnahme: wenn `isShortOption` true, bleibt das Target wie gegeben
 * (genau ein Spieler darf in der Naehe stehen).
 */
function enforceShooterKeepout(
  target: Position,
  ballPos: Position,
  isShortOption: boolean,
): Position {
  if (isShortOption) return target
  const dx = target.x - ballPos.x
  const dy = target.y - ballPos.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist >= SHOOTER_KEEPOUT_RADIUS) return target
  // Zu nah — radial nach aussen schieben. Wenn target identisch zum
  // ballPos ist (dist=0), wird in Default-Richtung "nach hinten" gesetzt
  // (Richtung eigene Haelfte).
  if (dist < 0.01) {
    return { x: ballPos.x + SHOOTER_KEEPOUT_RADIUS, y: ballPos.y }
  }
  const scale = SHOOTER_KEEPOUT_RADIUS / dist
  return clamp({
    x: ballPos.x + dx * scale,
    y: ballPos.y + dy * scale,
  })
}

// ── Wall formation ──────────────────────────────────────────────────

/**
 * Compute positions for a defensive wall.
 *
 * The wall sits 9.15 units from the ball along the direct line toward the
 * goal center.  Players are spread perpendicular to that line, 2 units
 * apart, and centred on the shooting angle.
 */
function formWall(
  ballPos: Position,
  goalCenter: Position,
  numPlayers: number,
): Position[] {
  const dx = goalCenter.x - ballPos.x
  const dy = goalCenter.y - ballPos.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return []

  const ux = dx / len
  const uy = dy / len

  const wallCenterX = ballPos.x + ux * 9.15
  const wallCenterY = ballPos.y + uy * 9.15

  const px = -uy
  const py = ux

  const positions: Position[] = []
  const spacing = 5
  const offset = ((numPlayers - 1) * spacing) / 2

  for (let i = 0; i < numPlayers; i++) {
    const shift = i * spacing - offset
    positions.push(
      clamp({
        x: wallCenterX + px * shift,
        y: wallCenterY + py * shift,
      }),
    )
  }
  return positions
}

// ── Offensive ───────────────────────────────────────────────────────

export function positionOffensiveFreekick(
  players: PlayerData[],
  _opponents: PlayerData[],
  team: TeamSide,
  ballPos: Position,
): PlayerAction[] {
  const actions: PlayerAction[] = []
  const goalDist = distToAttackGoal(ballPos.y, team)
  const goalY = attackGoalY(team)

  const attackers = players.filter(p => isAttacker(p.positionLabel))
  const midfielders = players.filter(p => isMidfielder(p.positionLabel))
  const defenders = players.filter(p => isDefender(p.positionLabel))
  const goalkeeper = players.find(p => p.positionLabel === 'TW')

  // Wir ermitteln EINEN naechstgelegenen Spieler (ausser Schuetze) als
  // einzige zulaessige Short-Option. Der Schuetze selbst steht am ballPos
  // — das ist nicht in `players` enthalten, weil er bereits seine action
  // hat, daher hier ignorieren wir ihn implizit.
  const allFieldPlayers = [...attackers, ...midfielders, ...defenders]
  const nearestFieldPlayer = allFieldPlayers
    .map(p => ({ p, d: distance(p.position, ballPos) }))
    .sort((a, b) => a.d - b.d)[0]?.p ?? null

  /** Push pro Spieler — Short-Option-Spieler bekommt sein wunsch-Target,
   *  alle anderen werden via enforceShooterKeepout vom Schuetzen weg. */
  const push = (p: PlayerData, target: Position) => {
    const isShort = nearestFieldPlayer?.id === p.id
    actions.push(moveAction(p, enforceShooterKeepout(target, ballPos, isShort)))
  }

  if (goalDist <= 35) {
    // ─── Attacking third: Box laden ───────────────────────────────
    const boxTargets: Position[] = [
      { x: 35, y: team === 1 ? goalY + 14 : goalY - 14 },
      { x: 65, y: team === 1 ? goalY + 14 : goalY - 14 },
      { x: 50, y: team === 1 ? goalY + 18 : goalY - 18 },
      { x: 42, y: team === 1 ? goalY + 22 : goalY - 22 },
    ]

    const boxRunners = [...attackers, ...midfielders].slice(0, 4)
    for (let i = 0; i < boxRunners.length; i++) {
      push(boxRunners[i], boxTargets[i % boxTargets.length])
    }

    const remainingMids = midfielders.filter(m => !boxRunners.includes(m))
    for (const mid of remainingMids) {
      // Restliche Mids als Sicherung am 16er-Eingang
      push(mid, {
        x: mid.positionLabel === 'LM' ? 25 : mid.positionLabel === 'RM' ? 75 : 50,
        y: shiftToward(ballPos.y, -10, team),
      })
    }

    // Verteidiger ruecken AUF — Konter-Absicherung knapp hinter Mittellinie,
    // nicht 30 Einheiten tief am eigenen Tor. User-Feedback 2026-04-26:
    // Verteidiger standen viel zu tief.
    const defenseLineY = team === 1 ? 58 : 42
    for (let i = 0; i < defenders.length; i++) {
      const xSpread = 25 + i * 18
      push(defenders[i], { x: xSpread, y: defenseLineY })
    }

    if (goalkeeper) {
      actions.push(moveAction(goalkeeper, { x: 50, y: team === 1 ? 93 : 7 }))
    }
  } else if (goalDist <= 65) {
    // ─── Midfield: balanced positioning ───────────────────────────
    // Genau EIN Mittelfeldspieler als kurze Option (nearestFieldPlayer).
    // Andere Mids breit verteilt am Halfraum bzw Fluegel.
    for (const mid of midfielders) {
      if (mid.id === nearestFieldPlayer?.id) {
        // Short option seitlich versetzt
        push(mid, {
          x: ballPos.x + (mid.position.x >= ballPos.x ? 9 : -9),
          y: shiftToward(ballPos.y, 4, team),
        })
        continue
      }
      // Andere Mids — auf Fluegel oder Halfraum
      const xTarget =
        mid.positionLabel === 'LM' ? 20 :
        mid.positionLabel === 'RM' ? 80 :
        mid.positionLabel === 'OM' ? 50 :
        38 + (Math.abs(mid.position.x - 50) > 15 ? 0 : 24)
      push(mid, {
        x: xTarget,
        y: shiftToward(ballPos.y, 12, team),
      })
    }

    for (let i = 0; i < attackers.length; i++) {
      push(attackers[i], {
        x: 40 + i * 20,
        y: shiftToward(ballPos.y, 22, team),
      })
    }

    // Verteidiger ruecken mit auf — auf Hoehe ballPos plus etwas
    // zurueck (8 Einheiten). Vorher: halfway zwischen ballPos und
    // eigenem Tor → bei ballPos.y=50 stand die Kette bei y=75. Jetzt
    // bei y=58 (Team 1). Realistisch Bundesliga-ueblich.
    const defenseLineY = shiftToward(ballPos.y, -8, team)
    for (let i = 0; i < defenders.length; i++) {
      const xSpread = 25 + i * 18
      push(defenders[i], { x: xSpread, y: defenseLineY })
    }

    if (goalkeeper) {
      actions.push(moveAction(goalkeeper, { x: 50, y: team === 1 ? 93 : 7 }))
    }
  } else {
    // ─── Own half: compact und sicher ──────────────────────────────
    // Eigener Freistoss tief in der eigenen Haelfte. Hier ist eine
    // tiefere Verteidigung gerechtfertigt, ABER auch hier max EIN
    // Mid in der Schuetzen-Naehe.
    for (const mid of midfielders) {
      if (mid.id === nearestFieldPlayer?.id) {
        push(mid, {
          x: ballPos.x + (mid.position.x >= ballPos.x ? 10 : -10),
          y: shiftToward(ballPos.y, 6, team),
        })
        continue
      }
      // Andere Mids hochstellen als Anlauf-Punkte
      push(mid, {
        x: mid.positionLabel === 'LM' ? 22 : mid.positionLabel === 'RM' ? 78 : 50,
        y: shiftToward(ballPos.y, 18, team),
      })
    }

    // Stürmer als Konter-Anker in der gegnerischen Hälfte
    for (let i = 0; i < attackers.length; i++) {
      push(attackers[i], {
        x: 40 + i * 20,
        y: shiftToward(50, 15, team),
      })
    }

    // Verteidiger nicht ganz tief — Aufrueckung zur Mittellinie hin,
    // damit beim Pass die Linie nicht 25 Einheiten hinter dem Ball ist.
    const ownGoal = ownGoalY(team)
    const defenseLineY = team === 1
      ? Math.min(ownGoal - 18, ballPos.y + 6)
      : Math.max(ownGoal + 18, ballPos.y - 6)
    for (let i = 0; i < defenders.length; i++) {
      push(defenders[i], { x: 30 + i * 18, y: defenseLineY })
    }

    if (goalkeeper) {
      actions.push(moveAction(goalkeeper, { x: 50, y: team === 1 ? 95 : 5 }))
    }
  }

  return actions
}

// ── Defensive ───────────────────────────────────────────────────────

export function positionDefensiveFreekick(
  players: PlayerData[],
  opponents: PlayerData[],
  team: TeamSide,
  ballPos: Position,
): PlayerAction[] {
  const actions: PlayerAction[] = []
  const ownGoal = ownGoalCenter(team)
  const distFromOwnGoal = Math.abs(ballPos.y - ownGoalY(team))

  const defenders = players.filter(p => isDefender(p.positionLabel))
  const midfielders = players.filter(p => isMidfielder(p.positionLabel))
  const attackers = players.filter(p => isAttacker(p.positionLabel))
  const goalkeeper = players.find(p => p.positionLabel === 'TW')

  if (distFromOwnGoal <= 30) {
    // Dangerous free kick near own goal: form a wall
    const wallCount = Math.min(4, defenders.length + midfielders.length)
    const wallPositions = formWall(ballPos, ownGoal, wallCount)

    const wallCandidates = [...defenders, ...midfielders]
    const wallPlayers: PlayerData[] = []
    for (let i = 0; i < wallCount && i < wallCandidates.length; i++) {
      wallPlayers.push(wallCandidates[i])
      actions.push(moveAction(wallCandidates[i], wallPositions[i]))
    }

    if (goalkeeper) {
      const gkX = Math.max(38, Math.min(62, ballPos.x))
      actions.push(moveAction(goalkeeper, { x: gkX, y: ownGoalY(team) === 100 ? 97 : 3 }))
    }

    const remainingDef = [...defenders, ...midfielders].filter(
      p => !wallPlayers.includes(p),
    )
    const oppAttackersInBox = opponents.filter(opp => {
      const oppDistFromGoal = Math.abs(opp.position.y - ownGoalY(team))
      return oppDistFromGoal <= 22 + 5
    })

    for (let i = 0; i < remainingDef.length; i++) {
      if (i < oppAttackersInBox.length) {
        const opp = oppAttackersInBox[i]
        actions.push(moveAction(remainingDef[i], {
          x: (opp.position.x + ownGoal.x) / 2,
          y: (opp.position.y + ownGoalY(team)) / 2,
        }))
      } else {
        actions.push(moveAction(remainingDef[i], {
          x: 35 + i * 15,
          y: team === 1 ? ownGoalY(team) - 12 : ownGoalY(team) + 12,
        }))
      }
    }

    // Stürmer als Konter-Anker in der gegnerischen Hälfte lassen,
    // nicht auf Mittellinie parken.
    for (let i = 0; i < attackers.length && i < 2; i++) {
      actions.push(moveAction(attackers[i], {
        x: 35 + i * 30,
        y: shiftToward(50, 15, team),
      }))
    }
  } else {
    // Midfield free kick: compact shape
    const midY = (ballPos.y + ownGoalY(team)) / 2

    for (let i = 0; i < defenders.length; i++) {
      actions.push(moveAction(defenders[i], {
        x: 25 + i * 20,
        y: team === 1 ? Math.max(midY, ballPos.y + 5) : Math.min(midY, ballPos.y - 5),
      }))
    }

    const nearOpponents = opponents.filter(
      opp => distance(opp.position, ballPos) < 20,
    )
    for (let i = 0; i < midfielders.length; i++) {
      if (i < nearOpponents.length) {
        const opp = nearOpponents[i]
        actions.push(moveAction(midfielders[i], {
          x: opp.position.x,
          y: (opp.position.y + ownGoalY(team)) / 2,
        }))
      } else {
        actions.push(moveAction(midfielders[i], {
          x: 30 + i * 20,
          y: shiftToward(ballPos.y, -5, team),
        }))
      }
    }

    // Stürmer als Konter-Anker, nicht nur knapp über Mittellinie.
    for (let i = 0; i < attackers.length && i < 2; i++) {
      actions.push(moveAction(attackers[i], {
        x: 35 + i * 30,
        y: shiftToward(50, 18, team),
      }))
    }

    if (goalkeeper) {
      actions.push(moveAction(goalkeeper, { x: 50, y: team === 1 ? 95 : 5 }))
    }
  }

  return actions
}
