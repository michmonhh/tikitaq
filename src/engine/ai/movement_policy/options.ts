/**
 * Movement-Options-Generator.
 *
 * Pro Off-Ball-Spieler werden 3-7 kontextabhängige Optionen produziert,
 * jeweils mit konkretem Target (von Sub-Heuristik berechnet) und einem
 * Heuristik-Score. Der Score wird vom Default-Behavior (= Heuristik-
 * Policy) zur deterministischen Wahl genutzt UND als Lehrer-Signal für
 * BC-Pretraining (das Netz lernt initial die heuristische Wahl zu
 * imitieren, dann wird per RL feingetunt).
 *
 * Konventionen:
 * - Score liegt in [0..1]. Höhere = situativ sinnvoller.
 * - 'stay' wird IMMER als letzte Option mitgegeben (Fallback).
 * - 'press_carrier' nur wenn Spieler Presser ist (pre-computed)
 * - 'man_marking' nur wenn Strategie = man_marking + Zuweisung existiert
 *
 * Personality-Erhalt: die Sub-Heuristiken lesen Spieler-Stats und
 * produzieren spielerspezifische Targets. Die Policy wählt nur die
 * Option, nicht das Target.
 */

import type { Position, PlayerData } from '../../types'
import { distance } from '../../geometry'
import { getRoleGroup, getFormationHome } from '../positioning/roles'
import { defensivePosition, manMarkingPosition } from '../positioning/defensive'
import { offensivePosition } from '../positioning/offensive'
import { getMarkingAssignments } from '../positioning/state'
import type { MovementContext, MovementOption } from './types'

/**
 * Hauptgenerator. Produziert pro Spieler 3-7 Optionen mit Scores.
 */
export function generateMovementOptions(ctx: MovementContext): MovementOption[] {
  const { state, team, player, plan, fieldReading, pressers, hasBall, ballLoose } = ctx
  const options: MovementOption[] = []

  const role = getRoleGroup(player)
  const carrier = state.players.find(p => p.id === state.ball.ownerId) ?? null
  const carrierIsOpp = carrier != null && carrier.team !== team

  // ── Press / Cover-Optionen (nur wenn Gegner-Ballbesitz oder lose) ──
  if ((carrierIsOpp || ballLoose) && pressers.has(player.id)) {
    const target = ballLoose
      ? state.ball.position
      : (carrier?.position ?? state.ball.position)
    options.push({
      type: 'press_carrier',
      target,
      score: 0.8,  // Pre-computed Presser → hohes Heuristik-Vertrauen
    })
    // Pass-Linie als Alternative für den NICHT-ersten Presser
    if (carrierIsOpp && carrier) {
      const lane = computePassLaneTarget(player, carrier, state.players, team)
      if (lane) {
        options.push({
          type: 'block_pass_lane',
          target: lane.target,
          score: 0.6,
          contextId: lane.threatId,
        })
      }
    }
  }

  // ── Man-Marking-Option (wenn Strategie + Zuweisung) ──
  if (plan?.strategy.defense === 'man_marking') {
    const assignedId = getMarkingAssignments().get(player.id)
    const opp = assignedId ? state.players.find(p => p.id === assignedId) : null
    if (opp) {
      const mark = manMarkingPosition(player, opp, state, team)
      options.push({
        type: 'man_marking',
        target: mark.target,
        score: 0.75,
        contextId: opp.id,
      })
    }
  }

  // ── Defensive Standard-Position (immer verfügbar wenn nicht im Ballbesitz) ──
  if (!hasBall) {
    const def = defensivePosition(player, state, team, plan, fieldReading)
    options.push({
      type: 'defensive_position',
      target: def.target,
      score: 0.65,
    })
  }

  // ── Offensive Standard-Position (immer verfügbar wenn Ballbesitz) ──
  if (hasBall) {
    const off = offensivePosition(player, state, team, plan, fieldReading)
    options.push({
      type: 'offensive_position',
      target: off.target,
      score: 0.70,
    })

    // Support-Lauf zum Carrier (Pass-Anbieten) für nahe Mitspieler
    if (carrier && carrier.team === team && carrier.id !== player.id) {
      const carrierDist = distance(player.position, carrier.position)
      if (carrierDist < 30 && role !== 'defender') {
        const supportTarget = computeSupportTarget(player, carrier, team)
        options.push({
          type: 'support_carrier',
          target: supportTarget,
          score: 0.55,
          contextId: carrier.id,
        })
      }
    }

    // Konter-Anker: 1-2 Stürmer bleiben hoch statt mit aufzurücken
    if (role === 'attacker' && plan?.strategy.transition === 'fall_back') {
      const home = getFormationHome(player)
      options.push({
        type: 'cover_counter',
        target: home,
        score: 0.45,
      })
    }

    // Overlap/Cut-Inside für Außen-Mitspieler bei Wing-Play
    if (plan?.strategy.attack === 'wing_play'
        && (player.positionLabel === 'LM' || player.positionLabel === 'RM'
            || player.positionLabel === 'LV' || player.positionLabel === 'RV')) {
      const overlap = computeOverlapTarget(player, state, team)
      options.push({
        type: 'overlap_run',
        target: overlap,
        score: 0.50,
      })
    }
    if (plan?.strategy.attack === 'switch_play' || plan?.strategy.attack === 'possession') {
      if (player.positionLabel === 'LM' || player.positionLabel === 'RM') {
        const cutInside = computeCutInsideTarget(player, team)
        options.push({
          type: 'cut_inside',
          target: cutInside,
          score: 0.40,
        })
      }
    }
  }

  // ── 'stay' als universeller Fallback ──
  options.push({
    type: 'stay',
    target: { x: player.position.x, y: player.position.y },
    score: 0.10,
  })

  return options
}

// ── Sub-Helpers ─────────────────────────────────────────────────

interface PassLaneResult {
  target: Position
  threatId: string
}

/**
 * Identifiziert den gefährlichsten Pass-Empfänger des Carriers und
 * berechnet das Pass-Linien-Block-Target. Spiegelt die Logik der
 * Coordinated Pressing Cascade (positioning.ts:line ~92).
 */
function computePassLaneTarget(
  player: PlayerData,
  carrier: PlayerData,
  allPlayers: PlayerData[],
  team: number,
): PassLaneResult | null {
  const carrierMates = allPlayers.filter(p =>
    p.team === carrier.team
    && p.id !== carrier.id
    && p.positionLabel !== 'TW',
  )
  const ownDefenders = allPlayers.filter(p =>
    p.team === team && p.id !== player.id,
  )

  const advancingMates = carrierMates.filter(m => {
    const matesAhead = team === 1
      ? m.position.y >= carrier.position.y - 5
      : m.position.y <= carrier.position.y + 5
    const closeEnough = distance(carrier.position, m.position) < 32
    return matesAhead && closeEnough
  })

  if (advancingMates.length === 0) return null

  let bestMate = advancingMates[0]
  let bestScore = -Infinity
  for (const m of advancingMates) {
    const dangerY = team === 1 ? m.position.y : 100 - m.position.y
    const nearestDefDist = ownDefenders.reduce(
      (min, d) => Math.min(min, distance(d.position, m.position)),
      Infinity,
    )
    const score = dangerY + Math.min(15, nearestDefDist)
    if (score > bestScore) {
      bestScore = score
      bestMate = m
    }
  }

  return {
    target: {
      x: carrier.position.x * 0.42 + bestMate.position.x * 0.58,
      y: carrier.position.y * 0.42 + bestMate.position.y * 0.58,
    },
    threatId: bestMate.id,
  }
}

/** Anlauf-Punkt zum Carrier (für Pass-Empfangs-Lauf). */
function computeSupportTarget(player: PlayerData, carrier: PlayerData, team: number): Position {
  const fwd = team === 1 ? -1 : 1
  // Position 8-10 Einheiten vor dem Carrier in dessen Bewegungsrichtung,
  // seitlich versetzt damit eine offene Pass-Linie entsteht
  return {
    x: carrier.position.x + (player.position.x > carrier.position.x ? 6 : -6),
    y: carrier.position.y + fwd * 8,
  }
}

/** Hochrückender Außen-Lauf für Wing-Play. */
function computeOverlapTarget(player: PlayerData, _state: { ball: { position: Position } }, team: number): Position {
  const fwd = team === 1 ? -1 : 1
  // Außen, weit nach vorn — typisch 80% in den Halb-Außenraum
  const onLeft = player.positionLabel === 'LV' || player.positionLabel === 'LM'
  return {
    x: onLeft ? 12 : 88,
    y: team === 1 ? 30 + fwd * 0 : 70,
  }
}

/** Diagonaler Lauf in den Halbraum. */
function computeCutInsideTarget(player: PlayerData, team: number): Position {
  const onLeft = player.positionLabel === 'LM'
  return {
    x: onLeft ? 38 : 62,
    y: team === 1 ? 30 : 70,
  }
}
