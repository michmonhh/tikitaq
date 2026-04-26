import type { PlayerData, GameState, ShootAction, GameEvent, TeamSide, Position, PenaltyDirection, PenaltyState } from './types'
import { name } from './playerName'
import { getConfidenceModifier } from './confidence'
import * as T from '../data/tickerTexts'
import { distance, rawDistance, pointToSegmentDistance, getInterceptRadius, getTackleRadius } from './geometry'
import { SHOOTING, PITCH } from './constants'
import { getGoalkeeper } from './formation'

export interface ShotResult {
  scored: boolean
  savedBy: PlayerData | null
  event: GameEvent
  /**
   * True wenn der gehaltene Schuss vom Keeper ins Aus abgelenkt wurde
   * und daraus ein Eckball für das angreifende Team resultiert. Der
   * gameStore transitioniert dann in die Corner-Phase statt dem Keeper
   * den Ball zu geben.
   */
  deflectedToCorner?: boolean
}

/**
 * Check if a target position is within the goal zone for the attacking team.
 */
export function isInGoalZone(target: { x: number; y: number }, attackingTeam: TeamSide): boolean {
  const xOk = target.x >= SHOOTING.GOAL_ZONE_X_LEFT && target.x <= SHOOTING.GOAL_ZONE_X_RIGHT

  if (attackingTeam === 1) {
    return xOk && target.y <= SHOOTING.GOAL_ZONE_Y_TOP
  } else {
    return xOk && target.y >= SHOOTING.GOAL_ZONE_Y_BOTTOM
  }
}

function getGoalCenter(attackingTeam: TeamSide): { x: number; y: number } {
  return {
    x: PITCH.CENTER_X,
    y: attackingTeam === 1 ? PITCH.GOAL_TOP_Y : PITCH.GOAL_BOTTOM_Y,
  }
}

/**
 * Calculate the distance from a position to the goal in "meters" (game units).
 * Uses raw distance (no aspect ratio) since we're measuring actual field distance.
 */
function distanceToGoal(pos: Position, attackingTeam: TeamSide): number {
  const goalCenter = getGoalCenter(attackingTeam)
  return rawDistance(pos, goalCenter)
}

/**
 * Prüft ob eine Position im gegnerischen Strafraum liegt.
 */
function isInPenaltyArea(pos: Position, attackingTeam: TeamSide): boolean {
  if (pos.x < PITCH.PENALTY_AREA_LEFT || pos.x > PITCH.PENALTY_AREA_RIGHT) return false
  if (attackingTeam === 1) return pos.y <= PITCH.PENALTY_AREA_DEPTH
  return pos.y >= (100 - PITCH.PENALTY_AREA_DEPTH)
}

/**
 * Calculate the base chance of the shot being on target (not saved, just accurate).
 * Distance curve + explicit penalty area bonus:
 * - < 10 units (inside 6yd box): ~80-92% base
 * - 10-20 units (penalty area): ~60-80% base
 * - 20-30 units (edge of box): drops sharply, ~20-50%
 * - > 30 units (long range): low, ~6-20%
 * - Inside 16er: +10% flat bonus (belohnt Geduld im Aufbauspiel)
 */
export function calculateShotAccuracy(
  shooter: PlayerData,
  fromPos: Position,
  attackingTeam: TeamSide
): number {
  const dist = distanceToGoal(fromPos, attackingTeam)
  const finishing = shooter.stats.finishing / 100 // 0.0 - 1.0

  // Base accuracy from distance (before finishing modifier)
  let baseAccuracy: number
  if (dist < 10) {
    // Very close: 80-92%
    baseAccuracy = 0.92 - dist * 0.012
  } else if (dist < 20) {
    // Penalty area range: 60-80%
    baseAccuracy = 0.80 - (dist - 10) * 0.02
  } else if (dist < 30) {
    // Edge of box / outside: drops sharply 20-50%
    baseAccuracy = 0.50 - (dist - 20) * 0.03
  } else {
    // Long range: low
    baseAccuracy = Math.max(0.06, 0.20 - (dist - 30) * 0.01)
  }

  // Bonus für Schüsse aus dem Strafraum: belohnt Geduld und gutes Kombinationsspiel
  if (isInPenaltyArea(fromPos, attackingTeam)) {
    baseAccuracy += 0.10
  }

  // Finishing stat modulates: low finishing reduces, high finishing boosts.
  const accuracy = baseAccuracy * (0.6 + finishing * 0.5) * getConfidenceModifier(shooter)
  return Math.max(0.05, Math.min(0.95, accuracy))
}

/**
 * Check if the keeper is in the shot line.
 */
function isKeeperInShotLine(
  shooter: PlayerData,
  keeper: PlayerData,
  goalCenter: { x: number; y: number }
): boolean {
  const saveRadius = getInterceptRadius(keeper)
  const distToLine = pointToSegmentDistance(keeper.position, shooter.position, goalCenter)
  return distToLine <= saveRadius
}

/**
 * Calculate save probability IF the keeper is in the shot line.
 */
function calculateSaveProbability(
  shooter: PlayerData,
  keeper: PlayerData,
  goalCenter: { x: number; y: number }
): number {
  const keeperBonus = keeper.stats.quality * SHOOTING.KEEPER_QUALITY_WEIGHT
  const shooterBonus = shooter.stats.finishing * SHOOTING.SHOOTER_FINISHING_WEIGHT
  const distFromGoal = distance(shooter.position, goalCenter)
  const distancePenalty = distFromGoal * SHOOTING.DISTANCE_PENALTY

  const distToLine = pointToSegmentDistance(keeper.position, shooter.position, goalCenter)
  const saveRadius = getInterceptRadius(keeper)
  const positionBonus = (1 - distToLine / saveRadius) * 0.15

  const saveChance = SHOOTING.BASE_SAVE_CHANCE + keeperBonus - shooterBonus + distancePenalty + positionBonus
  return Math.max(0.05, Math.min(0.90, saveChance))
}

/**
 * Execute a shot action.
 * Two-phase: first check accuracy (is the shot on target?), then check save.
 */
export function applyShot(
  action: ShootAction,
  state: GameState
): ShotResult {
  const shooter = state.players.find(p => p.id === action.playerId)!
  const attackingTeam = shooter.team
  const defendingTeam: TeamSide = attackingTeam === 1 ? 2 : 1
  const goalCenter = getGoalCenter(attackingTeam)
  const keeper = getGoalkeeper(state.players, defendingTeam)

  // Phase 0: Geblockter Schuss?
  // Ein Verteidiger im Schuss-Korridor (zwischen Schütze und Tor) kann
  // den Schuss blocken. 2026-04-24 neu: Wenn der Block nahe am Tor
  // passiert, X % Chance → Ball ins Toraus abgelenkt → Ecke.
  const defenders = state.players.filter(
    p => p.team === defendingTeam && p.positionLabel !== 'TW',
  )
  let closestBlocker: PlayerData | null = null
  let closestBlockDist = Infinity
  for (const def of defenders) {
    const distToLine = pointToSegmentDistance(def.position, shooter.position, goalCenter)
    const blockRadius = getTackleRadius(def) * 0.7
    if (distToLine <= blockRadius && distToLine < closestBlockDist) {
      // Verteidiger muss VOR dem Tor stehen, nicht hinter dem Schützen
      const defToGoal = distance(def.position, goalCenter)
      const shooterToGoal = distance(shooter.position, goalCenter)
      if (defToGoal < shooterToGoal) {
        closestBlockDist = distToLine
        closestBlocker = def
      }
    }
  }
  if (closestBlocker) {
    const blockRadius = getTackleRadius(closestBlocker) * 0.7
    // Block-Chance skaliert mit Pfadnähe + defensive-radius-Stat
    const proximityFactor = 1 - (closestBlockDist / blockRadius)
    const defSkill = closestBlocker.stats.defensiveRadius / 100
    const blockChance = proximityFactor * (0.30 + defSkill * 0.25)  // 0.30–0.55 max
    if (Math.random() < blockChance) {
      // Geblockt! Block nahe am Tor kann in die Ecke gehen.
      const blockerToGoal = distance(closestBlocker.position, goalCenter)
      const goesToCorner = blockerToGoal < 18 && Math.random() < 0.40
      if (goesToCorner) {
        const cornerPos: Position = {
          x: closestBlocker.position.x < PITCH.CENTER_X ? PITCH.MIN_X : PITCH.MAX_X,
          y: goalCenter.y,
        }
        return {
          scored: false,
          savedBy: null,
          event: {
            type: 'corner',
            playerId: shooter.id,
            position: cornerPos,
            message: `${name(closestBlocker)} blockt den Schuss zur Ecke!`,
          },
        }
      }
      // Block ohne Toraus: Schuss abgefälscht, kein Tor, Ball bleibt lose
      return {
        scored: false,
        savedBy: null,
        event: {
          type: 'shot_missed',
          playerId: shooter.id,
          position: closestBlocker.position,
          message: `${name(closestBlocker)} blockt den Schuss von ${name(shooter)}!`,
        },
      }
    }
  }

  // Phase 1: Is the shot on target?
  const accuracy = calculateShotAccuracy(shooter, shooter.position, attackingTeam)
  if (Math.random() > accuracy) {
    return {
      scored: false,
      savedBy: null,
      event: {
        type: 'shot_missed',
        playerId: shooter.id,
        position: goalCenter,
        message: T.tickerMiss(name(shooter)),
      },
    }
  }

  // Phase 2: Shot is on target — can keeper save?
  if (keeper && isKeeperInShotLine(shooter, keeper, goalCenter)) {
    const saveProbability = calculateSaveProbability(shooter, keeper, goalCenter)
    if (Math.random() < saveProbability) {
      // Bei Paraden landet der Ball nicht immer beim Keeper — ein Teil der
      // Schüsse wird ins Aus gefaustet/abgelenkt → Eckball für das
      // angreifende Team. 60 % — User-Präferenz, gibt dem Replay mehr
      // Dynamik auch wenn die Absolut-Schusszahlen noch niedrig sind.
      const deflectedToCorner = Math.random() < 0.60
      return {
        scored: false,
        savedBy: keeper,
        deflectedToCorner,
        event: {
          type: deflectedToCorner ? 'corner' : 'shot_saved',
          playerId: shooter.id,
          targetId: keeper.id,
          position: goalCenter,
          message: deflectedToCorner
            ? `${name(keeper)} lenkt den Schuss von ${name(shooter)} zur Ecke!`
            : T.tickerSave(name(shooter), name(keeper)),
        },
      }
    }
  }

  // GOAL!
  return {
    scored: true,
    savedBy: null,
    event: {
      type: 'shot_scored',
      playerId: shooter.id,
      position: goalCenter,
      message: T.tickerGoal(name(shooter)),
    },
  }
}

// ══════════════════════════════════════════
//  Kopfball nach Flanke/Ecke
// ══════════════════════════════════════════

export interface HeaderResult {
  outcome: 'scored' | 'saved' | 'missed'
  /** Wenn gehalten & ins Aus gefaustet: neue Ecke für Angreifer */
  deflectedToCorner: boolean
  event: GameEvent
}

/**
 * Löst einen Kopfball-Schuss aus einer Flanken-Situation auf (insbesondere
 * nach Eckstoß). Der Ball fliegt vom Passer über seinen Bogen direkt zum
 * Header-Player, der ihn im selben Moment köpft — KEIN Zwischenturn, kein
 * Ballbesitz-Wechsel.
 *
 * Reduzierte Accuracy ggü. Fuß-Schuss: Kopfbälle sind schwerer zu platzieren,
 * TW hat bessere Reaktionszeit (Ball kommt von schräg-oben in vorhersehbarer
 * Bahn). Grob: Accuracy ≈ 0.7× Standard-Schuss, save chance +0.10.
 *
 * Konsumiert den Pass-Event — das Ergebnis ersetzt das pass_complete durch
 * ein shot_scored/saved/missed/corner.
 */
export function resolveHeaderShot(
  header: PlayerData,
  fromPos: Position,  // wo der Kopfball-Spieler beim Köpfen steht
  attackingTeam: TeamSide,
  defendingKeeper: PlayerData | null,
): HeaderResult {
  const goalCenter = getGoalCenter(attackingTeam)

  // Accuracy: Standard-Schuss-Formel × 0.7 (Kopfball-Malus)
  const standardAccuracy = calculateShotAccuracy(header, fromPos, attackingTeam)
  const headerAccuracy = standardAccuracy * 0.7
  const accRoll = Math.random()

  if (accRoll > headerAccuracy) {
    // Kopfball geht am Tor vorbei / drüber
    return {
      outcome: 'missed',
      deflectedToCorner: false,
      event: {
        type: 'shot_missed',
        playerId: header.id,
        position: goalCenter,
        message: `Kopfball von ${name(header)} geht vorbei!`,
      },
    }
  }

  // TW-Parade-Check (+0.10 gegenüber normalem Schuss — Kopfball ist
  // vorhersehbarer als Fuß-Schuss, TW steht bereits im 5er positioniert)
  if (defendingKeeper) {
    const inLine = isKeeperInShotLine(header, defendingKeeper, goalCenter)
    if (inLine) {
      const baseSave = calculateSaveProbability(header, defendingKeeper, goalCenter)
      const headerSave = Math.min(0.92, baseSave + 0.10)
      if (Math.random() < headerSave) {
        // Gehalten — 60 % Chance ins Aus gefaustet (Ecke)
        const toCorner = Math.random() < 0.60
        return {
          outcome: 'saved',
          deflectedToCorner: toCorner,
          event: {
            type: toCorner ? 'corner' : 'shot_saved',
            playerId: header.id,
            targetId: defendingKeeper.id,
            position: goalCenter,
            message: toCorner
              ? `${name(defendingKeeper)} faustet den Kopfball zur Ecke!`
              : `${name(defendingKeeper)} pariert den Kopfball von ${name(header)}!`,
          },
        }
      }
    }
  }

  // TOR — Event trägt passKind='cross', damit das Arena-Assist-Tracking
  // es als Flanken-Tor klassifiziert (nicht als "Alleingang").
  return {
    outcome: 'scored',
    deflectedToCorner: false,
    event: {
      type: 'shot_scored',
      playerId: header.id,
      position: goalCenter,
      message: `TOR! ${name(header)} köpft ein!`,
      passKind: 'cross',
    },
  }
}

// ══════════════════════════════════════════
//  Elfmeter-Auflösung
// ══════════════════════════════════════════

export interface PenaltyResult {
  outcome: 'scored' | 'saved' | 'missed'
  /** Wenn gehalten: Abpraller-Position (Ball wird dort frei abgelegt) */
  reboundPos: Position | null
  event: GameEvent
}

/**
 * Löst einen Elfmeter auf.
 *
 * Regeln:
 * - 10% Fehlschuss (Ball geht ins Aus → Abstoß)
 * - Schuss ≠ TW-Richtung → Tor
 * - Schuss = TW-Richtung → Haltechance basierend auf TW-Qualität
 *   - Gehalten → Ball prallt ab (frei im Umkreis ~5-8 Einheiten)
 *   - Nicht gehalten → Tor
 */
export function resolvePenalty(
  penalty: PenaltyState,
  shooter: PlayerData,
  keeper: PlayerData,
): PenaltyResult {
  const shootDir = penalty.shooterChoice!
  const keepDir = penalty.keeperChoice!
  const goalY = penalty.shooterTeam === 1 ? PITCH.GOAL_TOP_Y : PITCH.GOAL_BOTTOM_Y
  const goalCenter: Position = { x: PITCH.CENTER_X, y: goalY }

  // 10% Fehlschuss — Ball geht drüber/daneben
  if (Math.random() < 0.10) {
    return {
      outcome: 'missed',
      reboundPos: null,
      event: {
        type: 'penalty_missed',
        playerId: shooter.id,
        position: goalCenter,
        message: `${name(shooter)} setzt den Elfmeter neben das Tor!`,
      },
    }
  }

  // Schuss geht in eine andere Richtung als der TW → TOR
  if (shootDir !== keepDir) {
    return {
      outcome: 'scored',
      reboundPos: null,
      event: {
        type: 'penalty_scored',
        playerId: shooter.id,
        position: goalCenter,
        message: `TOR! ${name(shooter)} verwandelt den Elfmeter!`,
      },
    }
  }

  // Schuss = TW-Richtung → Haltechance basierend auf TW-Qualität
  // TW quality 60 → 40% halten, quality 80 → 55%, quality 95 → 65%
  const saveChance = 0.20 + (keeper.stats.quality / 100) * 0.50
  // Finishing des Schützen verringert die Haltechance leicht
  const adjustedSaveChance = Math.max(0.15, saveChance - (shooter.stats.finishing / 100) * 0.15)

  if (Math.random() < adjustedSaveChance) {
    // GEHALTEN — Ball prallt ab
    const reboundAngle = (Math.random() * Math.PI) - (Math.PI / 2) // -90° bis +90°
    const reboundDist = 5 + Math.random() * 4 // 5-9 Einheiten vom Tor
    const penaltySpotY = penalty.shooterTeam === 1 ? PITCH.PENALTY_SPOT_TOP_Y : PITCH.PENALTY_SPOT_BOTTOM_Y
    const toward = penalty.shooterTeam === 1 ? 1 : -1
    const reboundPos: Position = {
      x: Math.max(5, Math.min(95, PITCH.CENTER_X + Math.cos(reboundAngle) * reboundDist * 2)),
      y: Math.max(3, Math.min(97, penaltySpotY + toward * reboundDist)),
    }

    return {
      outcome: 'saved',
      reboundPos,
      event: {
        type: 'penalty_saved',
        playerId: keeper.id,
        targetId: shooter.id,
        position: goalCenter,
        message: `${name(keeper)} hält den Elfmeter von ${name(shooter)}!`,
      },
    }
  }

  // TW in der richtigen Ecke, aber nicht gehalten → TOR
  return {
    outcome: 'scored',
    reboundPos: null,
    event: {
      type: 'penalty_scored',
      playerId: shooter.id,
      position: goalCenter,
      message: `TOR! ${name(shooter)} verwandelt den Elfmeter!`,
    },
  }
}

/** KI wählt Elfmeter-Richtung (für Schuss oder TW) */
export function aiChoosePenaltyDirection(): PenaltyDirection {
  const r = Math.random()
  // 40% links, 20% mitte, 40% rechts
  if (r < 0.4) return 'left'
  if (r < 0.6) return 'center'
  return 'right'
}
