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

  // Short-Option-Regel (User 2026-04-26):
  //   - Angriffsdrittel: GENAU EIN Spieler als kurze Pass-Option zulaessig
  //   - Mittelfeld + eigene Haelfte: NUR der Schuetze am Ball, alle
  //     anderen halten Mindestabstand
  // `shortOptionId` ist im Angriffsdrittel-Modus die Spieler-ID der
  // einzigen erlaubten Short-Option (nearest field player), in den
  // anderen Modi null (keine Ausnahme von keepout).
  let shortOptionId: string | null = null
  if (goalDist <= 35) {
    const allFieldPlayers = [...attackers, ...midfielders, ...defenders]
    const nearest = allFieldPlayers
      .map(p => ({ p, d: distance(p.position, ballPos) }))
      .sort((a, b) => a.d - b.d)[0]?.p ?? null
    shortOptionId = nearest?.id ?? null
  }

  /** Push pro Spieler — Short-Option-Spieler (nur Angriffsdrittel)
   *  bekommt sein wunsch-Target, alle anderen werden via
   *  enforceShooterKeepout vom Schuetzen weg. */
  const push = (p: PlayerData, target: Position) => {
    const isShort = shortOptionId !== null && shortOptionId === p.id
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
    // KEINE kurze Option am Ball — der Schuetze schlaegt direkt einen
    // langen Ball, alle anderen verteilen sich breit. shortOptionId
    // ist null in diesem Modus → enforceShooterKeepout pusht alle
    // Spieler aus dem 12er-Radius weg.
    for (const mid of midfielders) {
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
    // KEINE kurze Option am Ball. Der Schuetze (typ. IV/TW) loest die
    // Situation lang, alle Mids stehen weiter vorn als Anspielstationen.
    for (const mid of midfielders) {
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
//
// Aufstellungs-Regel (User 2026-04-26):
//   IVs am tiefsten (kurz vor dem eigenen Tor)
//   LV links, RV rechts — als Wing-Schutz davor
//   Mittelfeld dahinter, ZDM zentral, ZM Halfräume, LM/RM auf Flügeln
//   OM als zentraler Konter-Anker
//   Stürmer hochstellen (gegnerische Hälfte) als Konter-Anker
//   TW auf Linie

// Hilfsfunktion: x-Slots fuer IVs je nach Anzahl (3er-Kette / 4er / 1)
function ivXSlots(count: number): number[] {
  if (count >= 3) return [35, 50, 65]
  if (count === 2) return [42, 58]
  if (count === 1) return [50]
  return []
}

// Default-X pro Mid-Rolle (Anker fuer rolle-basierte Verteilung)
function midX(label: string, fallbackIndex: number): number {
  switch (label) {
    case 'LM': return 22
    case 'RM': return 78
    case 'OM': return 50
    case 'ZDM':
    case 'ZM':
      return fallbackIndex === 0 ? 42
        : fallbackIndex === 1 ? 58
        : 50
    default:
      return 30 + fallbackIndex * 14
  }
}

export function positionDefensiveFreekick(
  players: PlayerData[],
  _opponents: PlayerData[],
  team: TeamSide,
  ballPos: Position,
): PlayerAction[] {
  const actions: PlayerAction[] = []
  const ownGoal = ownGoalCenter(team)
  const distFromOwnGoal = Math.abs(ballPos.y - ownGoalY(team))

  // Rolle-basierte Gruppierung
  const tw = players.find(p => p.positionLabel === 'TW')
  const ivs = players.filter(p => p.positionLabel === 'IV')
  const lvs = players.filter(p => p.positionLabel === 'LV')
  const rvs = players.filter(p => p.positionLabel === 'RV')
  const zdms = players.filter(p => p.positionLabel === 'ZDM')
  const zms = players.filter(p => p.positionLabel === 'ZM')
  const lms = players.filter(p => p.positionLabel === 'LM')
  const rms = players.filter(p => p.positionLabel === 'RM')
  const oms = players.filter(p => p.positionLabel === 'OM')
  const sts = players.filter(p => p.positionLabel === 'ST')
  const ivXs = ivXSlots(ivs.length)

  if (distFromOwnGoal <= 30) {
    // ─── Wall-Mode: gefaehrlicher Freistoss nahe eigenem Tor ──────
    // Wall aus 4 Spielern (bevorzugt Mids) blockt den direkten Schuss.
    // Verteidiger bleiben auf der Linie und halten gegnerische Stuermer
    // im 16er manndeckungsnah.
    const wallCandidates: PlayerData[] = [
      ...zdms, ...zms, ...lms, ...rms, ...oms,
    ]
    const wallCount = Math.min(4, wallCandidates.length)
    const wallPositions = formWall(ballPos, ownGoal, wallCount)
    const wallPlayers = new Set<string>()
    for (let i = 0; i < wallCount; i++) {
      wallPlayers.add(wallCandidates[i].id)
      actions.push(moveAction(wallCandidates[i], wallPositions[i]))
    }

    // TW: nah am Pfosten der ballnaeheren Seite
    if (tw) {
      const gkX = Math.max(38, Math.min(62, ballPos.x))
      actions.push(moveAction(tw, { x: gkX, y: team === 1 ? 97 : 3 }))
    }

    // IVs: ganz tief auf 8 Einheiten vom Tor, X nach Slot
    const ivLineY = team === 1 ? ownGoalY(team) - 8 : ownGoalY(team) + 8
    for (let i = 0; i < ivs.length; i++) {
      actions.push(moveAction(ivs[i], { x: ivXs[i] ?? 50, y: ivLineY }))
    }

    // LV/RV: 14 Einheiten vom Tor, je auf ihrer Seite
    const wingLineY = team === 1 ? ownGoalY(team) - 14 : ownGoalY(team) + 14
    for (const lv of lvs) actions.push(moveAction(lv, { x: 18, y: wingLineY }))
    for (const rv of rvs) actions.push(moveAction(rv, { x: 82, y: wingLineY }))

    // Stuermer hoch als Konter-Anker
    for (let i = 0; i < sts.length; i++) {
      const x = sts.length === 1 ? 50 : (i === 0 ? 40 : 60)
      actions.push(moveAction(sts[i], { x, y: shiftToward(50, 15, team) }))
    }

    // Verbleibende Offensive (OM nicht in Wall) ein wenig vor der eigenen
    // Haelfte — Anlauf-Punkt fuer Befreiungspass
    for (const om of oms) {
      if (wallPlayers.has(om.id)) continue
      actions.push(moveAction(om, { x: 50, y: shiftToward(50, 8, team) }))
    }
  } else {
    // ─── Mittelfeld-Mode: defensive Linie vor dem Ball ────────────
    // Y wird relativ zum Ball gestaffelt — Mid auf Hoehe Ball, LV/RV
    // 9 Einheiten zurueck, IVs 14 Einheiten zurueck (am tiefsten).
    // X strikt rolle-basiert.

    // IVs am tiefsten
    const ivLineY = team === 1 ? ballPos.y + 14 : ballPos.y - 14
    for (let i = 0; i < ivs.length; i++) {
      actions.push(moveAction(ivs[i], { x: ivXs[i] ?? 50, y: ivLineY }))
    }

    // LV/RV davor (9 Einheiten zurueck)
    const wingLineY = team === 1 ? ballPos.y + 9 : ballPos.y - 9
    for (const lv of lvs) actions.push(moveAction(lv, { x: 18, y: wingLineY }))
    for (const rv of rvs) actions.push(moveAction(rv, { x: 82, y: wingLineY }))

    // ZDM/ZM: zentrale Mid-Linie, leicht hinter Ball (4-5 Einheiten)
    const defMidY = team === 1 ? ballPos.y + 4 : ballPos.y - 4
    for (let i = 0; i < zdms.length; i++) {
      actions.push(moveAction(zdms[i], { x: midX('ZDM', i), y: defMidY }))
    }
    for (let i = 0; i < zms.length; i++) {
      actions.push(moveAction(zms[i], { x: midX('ZM', i), y: defMidY - (team === 1 ? 2 : -2) }))
    }

    // LM/RM auf Fluegeln, leicht vor dem Ball (Konter-Anlauf)
    const wingMidY = team === 1 ? ballPos.y - 2 : ballPos.y + 2
    for (const lm of lms) actions.push(moveAction(lm, { x: 22, y: wingMidY }))
    for (const rm of rms) actions.push(moveAction(rm, { x: 78, y: wingMidY }))

    // OM als hoeherer zentraler Konter-Anker
    for (const om of oms) {
      actions.push(moveAction(om, { x: 50, y: shiftToward(50, 12, team) }))
    }

    // Stuermer als hoechster Konter-Anker
    for (let i = 0; i < sts.length; i++) {
      const x = sts.length === 1 ? 50 : (i === 0 ? 40 : 60)
      actions.push(moveAction(sts[i], { x, y: shiftToward(50, 18, team) }))
    }

    if (tw) {
      actions.push(moveAction(tw, { x: 50, y: team === 1 ? 95 : 5 }))
    }
  }

  return actions
}

// `distance` bleibt importiert fuer evtl. spaetere Erweiterungen
void distance
