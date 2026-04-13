/**
 * TIKITAQ AI — Positionierung (Schicht 3)
 *
 * Berechnet die Wunsch-Position jedes Spielers ohne Ball.
 * Berücksichtigt: Mannschaftsplan, Feldanalyse, Bedrohungsvorhersage.
 *
 * Modi:
 * - Eigener Ballbesitz → offensivePosition (Räume öffnen)
 * - Gegnerischer Ballbesitz → defensivePosition (Räume schließen)
 * - Gegenpress → sofort nachsetzen (zustandsbasiert)
 * - Manndeckung → feste Zuordnung mit Antizipation
 */

import type { GameState, TeamSide, PlayerData, Position } from '../types'
import type { TeamPlan, FieldReading, DefenseStrategy, AttackStrategy } from './types'
import { getMovementRadius, distance, clampToRadius, clampToPitch } from '../geometry'
import { PITCH } from '../constants'
import { FORMATION_433 } from '../formation'

// ══════════════════════════════════════════
//  Typen & Konfiguration
// ══════════════════════════════════════════

type RoleGroup = 'defender' | 'midfielder' | 'attacker'

interface PositionConfig {
  verticalOffset: number    // Einheiten in Vorwärtsrichtung (negativ = zurück)
  ballAttractionY: number   // 0–1: Verschiebung Richtung Ball (vertikal)
  ballAttractionX: number   // 0–1: Verschiebung Richtung Ball (horizontal)
  widthScale: number        // 1.0 = normal, <1 = enger, >1 = weiter
}

interface PressingConfig {
  maxPressers: number
  radius: number
  allowDefenders: boolean
}

// ── Defensiv-Verhalten pro Strategie ──

const DEF_BEHAVIOR: Record<DefenseStrategy, Record<RoleGroup, PositionConfig>> = {
  high_press: {
    defender:   { verticalOffset: 2,  ballAttractionY: 0.18, ballAttractionX: 0.20, widthScale: 1.00 },
    midfielder: { verticalOffset: 4,  ballAttractionY: 0.25, ballAttractionX: 0.18, widthScale: 0.95 },
    attacker:   { verticalOffset: 3,  ballAttractionY: 0.35, ballAttractionX: 0.12, widthScale: 0.85 },
  },
  mid_press: {
    defender:   { verticalOffset: 0,  ballAttractionY: 0.18, ballAttractionX: 0.20, widthScale: 1.00 },
    midfielder: { verticalOffset: 0,  ballAttractionY: 0.22, ballAttractionX: 0.18, widthScale: 0.95 },
    attacker:   { verticalOffset: -3, ballAttractionY: 0.15, ballAttractionX: 0.12, widthScale: 1.00 },
  },
  deep_block: {
    defender:   { verticalOffset: -5, ballAttractionY: 0.15, ballAttractionX: 0.20, widthScale: 1.05 },
    midfielder: { verticalOffset: -3, ballAttractionY: 0.18, ballAttractionX: 0.18, widthScale: 0.95 },
    attacker:   { verticalOffset: 0,  ballAttractionY: 0.08, ballAttractionX: 0.12, widthScale: 0.95 },
  },
  man_marking: {
    // Platzhalter — Manndeckung nutzt separate Logik
    defender:   { verticalOffset: 0, ballAttractionY: 0, ballAttractionX: 0, widthScale: 1.0 },
    midfielder: { verticalOffset: 0, ballAttractionY: 0, ballAttractionX: 0, widthScale: 1.0 },
    attacker:   { verticalOffset: 0, ballAttractionY: 0, ballAttractionX: 0, widthScale: 1.0 },
  },
}

// ── Offensiv-Verhalten pro Strategie ──

const ATK_BEHAVIOR: Record<AttackStrategy, Record<RoleGroup, PositionConfig>> = {
  possession: {
    defender:   { verticalOffset: 5,  ballAttractionY: 0.05, ballAttractionX: 0.00, widthScale: 1.15 },
    midfielder: { verticalOffset: 8,  ballAttractionY: 0.05, ballAttractionX: 0.00, widthScale: 1.15 },
    attacker:   { verticalOffset: 12, ballAttractionY: 0.05, ballAttractionX: 0.00, widthScale: 1.10 },
  },
  counter: {
    defender:   { verticalOffset: 2,  ballAttractionY: 0.03, ballAttractionX: 0.00, widthScale: 1.05 },
    midfielder: { verticalOffset: 8,  ballAttractionY: 0.05, ballAttractionX: 0.00, widthScale: 1.10 },
    attacker:   { verticalOffset: 18, ballAttractionY: 0.00, ballAttractionX: 0.00, widthScale: 1.05 },
  },
  wing_play: {
    defender:   { verticalOffset: 4,  ballAttractionY: 0.05, ballAttractionX: 0.00, widthScale: 1.15 },
    midfielder: { verticalOffset: 7,  ballAttractionY: 0.05, ballAttractionX: 0.00, widthScale: 1.25 },
    attacker:   { verticalOffset: 12, ballAttractionY: 0.05, ballAttractionX: 0.00, widthScale: 1.10 },
  },
  switch_play: {
    defender:   { verticalOffset: 4,  ballAttractionY: 0.05, ballAttractionX: 0.00, widthScale: 1.20 },
    midfielder: { verticalOffset: 6,  ballAttractionY: 0.05, ballAttractionX: 0.00, widthScale: 1.20 },
    attacker:   { verticalOffset: 10, ballAttractionY: 0.03, ballAttractionX: 0.00, widthScale: 1.15 },
  },
  direct: {
    defender:   { verticalOffset: 3,  ballAttractionY: 0.03, ballAttractionX: 0.00, widthScale: 1.05 },
    midfielder: { verticalOffset: 8,  ballAttractionY: 0.05, ballAttractionX: 0.00, widthScale: 1.10 },
    attacker:   { verticalOffset: 18, ballAttractionY: 0.00, ballAttractionX: 0.00, widthScale: 1.05 },
  },
}

// ── Pressing-Konfiguration ──

const PRESS_CONFIG: Record<DefenseStrategy, PressingConfig> = {
  high_press:  { maxPressers: 2, radius: 20, allowDefenders: false },
  mid_press:   { maxPressers: 1, radius: 15, allowDefenders: false },
  deep_block:  { maxPressers: 1, radius: 12, allowDefenders: false },
  man_marking: { maxPressers: 1, radius: 15, allowDefenders: false },
}

const GEGENPRESS_CONFIG: PressingConfig = { maxPressers: 2, radius: 22, allowDefenders: false }

// ══════════════════════════════════════════
//  Modul-State
// ══════════════════════════════════════════

let gegenpressActive = false
let markingAssignments = new Map<string, string>()  // eigener Spieler → Gegner-ID

/** Zurücksetzen bei neuem Spiel */
export function resetPositioning(): void {
  gegenpressActive = false
  markingAssignments = new Map()
}

// ══════════════════════════════════════════
//  Gegenpress — Zustandsbasiert
// ══════════════════════════════════════════

/**
 * Aktualisiert den Gegenpress-Zustand.
 * Aktiviert bei Ballverlust mit gegenpress-Transition.
 * Deaktiviert wenn der Gegner dem Druck entkommen ist.
 */
export function updateGegenpress(
  state: GameState,
  team: TeamSide,
  plan: TeamPlan | null,
  justLostBall: boolean,
): void {
  // Aktivieren bei Ballverlust
  if (justLostBall && plan?.strategy.transition === 'gegenpress') {
    gegenpressActive = true
    return
  }

  if (!gegenpressActive) return

  // Prüfen: ist der Ballführer noch unter Druck?
  const carrier = state.players.find(p => p.id === state.ball.ownerId)
  if (!carrier || carrier.team === team) {
    gegenpressActive = false
    return
  }

  const ourPlayers = state.players.filter(p => p.team === team && p.positionLabel !== 'TW')
  let pressCount = 0
  for (const p of ourPlayers) {
    if (distance(p.position, carrier.position) < 15) pressCount++
  }

  // Gegner entkommen → Gegenpress beenden
  if (pressCount < 2) gegenpressActive = false
}

export function isGegenpressActive(): boolean { return gegenpressActive }

// ══════════════════════════════════════════
//  Antizipation — Spielerabhängig
// ══════════════════════════════════════════

/**
 * Berechnet die Antizipationsfähigkeit eines Spielers (0–1).
 *
 * Abgeleitet aus vorhandenen Stats:
 * - defensiveRadius: Raumgespür, Spielverständnis defensiv
 * - quality: allgemeine Spielintelligenz
 * - tackling: Timing, Zweikampf-Antizipation
 *
 * Ergebnis: 0.25 (schwacher Spieler, reagiert kaum) bis 0.95 (Weltklasse, liest das Spiel)
 */
function getAnticipation(player: PlayerData): number {
  const raw = player.stats.defensiveRadius * 0.35
    + player.stats.quality * 0.35
    + player.stats.tackling * 0.30
  // Skalierung: raw 50 → 0.25, raw 70 → 0.55, raw 85 → 0.80, raw 95 → 0.95
  return Math.max(0.15, Math.min(0.95, (raw - 40) / 65))
}

/**
 * Berechnet die durchschnittliche Mannschafts-Antizipation (0–1).
 *
 * Bessere Mannschaften verschieben als Block intelligenter,
 * schließen Räume kollektiv schneller.
 */
function getTeamAnticipation(state: GameState, team: TeamSide): number {
  const teamPlayers = state.players.filter(p => p.team === team && p.positionLabel !== 'TW')
  if (teamPlayers.length === 0) return 0.5
  const avgQuality = teamPlayers.reduce((s, p) => s + p.stats.quality, 0) / teamPlayers.length
  // avgQuality 70 → 0.40, 80 → 0.60, 88 → 0.76
  return Math.max(0.25, Math.min(0.90, (avgQuality - 50) / 50))
}

// ══════════════════════════════════════════
//  Bedrohungsvorhersage
// ══════════════════════════════════════════

/**
 * Findet den gefährlichsten freien Raum in Reichweite eines Gegners.
 *
 * Scannt Punkte im Halbkreis Richtung unser Tor und bewertet:
 * - Abstand zu unseren Verteidigern (weiter = freier)
 * - Nähe zu unserem Tor (näher = gefährlicher)
 * - Zwischen unseren Linien (Zehnerraum = sehr gefährlich)
 * - Erreichbarkeit (innerhalb des Bewegungsradius)
 *
 * Gibt den besten Punkt zurück, oder null wenn kein attraktiver Raum existiert.
 */
function findDangerousSpace(
  opponent: PlayerData,
  state: GameState,
  ourTeam: TeamSide,
  moveRad: number,
): { pos: Position; score: number } | null {
  const toward = ourTeam === 1 ? 1 : -1
  const ourGoalY = ourTeam === 1 ? 100 : 0
  const ourDefs = state.players.filter(
    p => p.team === ourTeam && p.positionLabel !== 'TW',
  )

  // Berechne unsere Linienpositionen für "zwischen den Linien"-Erkennung
  const defs = state.players.filter(
    p => p.team === ourTeam && getRoleGroup(p) === 'defender',
  )
  const mids = state.players.filter(
    p => p.team === ourTeam && getRoleGroup(p) === 'midfielder',
  )
  const defLineY = defs.length > 0
    ? defs.reduce((s, p) => s + p.position.y, 0) / defs.length : ourGoalY
  const midLineY = mids.length > 0
    ? mids.reduce((s, p) => s + p.position.y, 0) / mids.length : (ourGoalY - toward * 30)

  // Scanne 8 Punkte im Halbkreis Richtung unser Tor + 2 seitlich
  const scanDist = moveRad * 0.75
  let best: { pos: Position; score: number } | null = null

  // Winkel: Halbkreis nach vorne (Richtung unser Tor) + seitliche Optionen
  // 0 = geradeaus Richtung Tor, ±90° = seitlich
  const angles = [-80, -55, -30, -10, 10, 30, 55, 80]

  for (const angleDeg of angles) {
    const angleRad = (angleDeg * Math.PI) / 180
    // Basisrichtung: Richtung unser Tor (toward > 0 → nach unten, toward < 0 → nach oben)
    const baseAngle = toward > 0 ? Math.PI / 2 : -Math.PI / 2
    const finalAngle = baseAngle + angleRad

    const px = opponent.position.x + Math.cos(finalAngle) * scanDist
    const py = opponent.position.y + Math.sin(finalAngle) * scanDist

    // Außerhalb des Spielfelds → ignorieren
    if (px < 4 || px > 96 || py < 3 || py > 97) continue

    // ── Bewertung: Wie attraktiv ist dieser Raum? ──
    let score = 0

    // 1. Freiheit: Wie weit ist der nächste unserer Spieler entfernt?
    let minDefDist = Infinity
    for (const def of ourDefs) {
      const d = distance(def.position, { x: px, y: py })
      if (d < minDefDist) minDefDist = d
    }
    // Freier Raum (>15 Einheiten von jedem Verteidiger) → hoher Bonus
    if (minDefDist > 8) {
      score += Math.min(25, (minDefDist - 8) * 1.5)
    } else {
      score -= 10  // Zu nah an einem Verteidiger → unattraktiv
    }

    // 2. Nähe zu unserem Tor → gefährlicher
    const distToGoal = Math.abs(py - ourGoalY)
    if (distToGoal < 45) {
      score += (45 - distToGoal) * 0.4
    }

    // 3. Zwischen den Linien (der "Zehnerraum") → extrem gefährlich
    const isBetweenLines = toward > 0
      ? (py > Math.min(midLineY, defLineY) && py < Math.max(midLineY, defLineY))
      : (py < Math.max(midLineY, defLineY) && py > Math.min(midLineY, defLineY))
    if (isBetweenLines) score += 15

    // 4. Hinter unserer Abwehrlinie → durchgebrochen
    const behindDefLine = toward > 0
      ? py > defLineY
      : py < defLineY
    if (behindDefLine && minDefDist > 10) score += 20

    // 5. Lücke zwischen zwei Verteidigern (horizontale Lücke in der Kette)
    if (defs.length >= 2) {
      const defsOnLine = defs.filter(d => Math.abs(d.position.y - defLineY) < 10)
      const sortedX = defsOnLine.map(d => d.position.x).sort((a, b) => a - b)
      for (let i = 0; i < sortedX.length - 1; i++) {
        const gap = sortedX[i + 1] - sortedX[i]
        if (gap > 18 && px > sortedX[i] + 3 && px < sortedX[i + 1] - 3) {
          // Punkt liegt in einer Lücke → sehr attraktiv
          score += gap * 0.6
        }
      }
    }

    if (!best || score > best.score) {
      best = { pos: { x: px, y: py }, score }
    }
  }

  // Nur zurückgeben wenn der Raum wirklich attraktiv ist (score > 10)
  return best && best.score > 10 ? best : null
}

/**
 * Sagt vorher, wohin ein Gegner sich bewegen WILL.
 *
 * Die Qualität der Vorhersage hängt vom `observer` ab — dem eigenen Spieler,
 * der die Bedrohung einschätzt. Ein Weltklasse-IV antizipiert präzise,
 * ein schwacher Spieler sieht nur die aktuelle Position.
 *
 * Signale:
 * 1. Realer Bewegungsvektor (wohin er GERADE läuft)
 * 2. Freie Räume (welchen Raum kann er ausnutzen?) — nur bei guter Antizipation
 * 3. Rollenbasierte Tendenz (Rückfall ohne Bewegung)
 * + Kontext (Ballnähe, Abwehrlinie, Passreichweite)
 *
 * @param observer — Der eigene Spieler, der die Bedrohung einschätzt.
 *                   Kann null sein (dann wird Mannschaftsdurchschnitt verwendet).
 */
export function predictThreat(
  opponent: PlayerData,
  state: GameState,
  ourTeam: TeamSide,
  observer?: PlayerData | null,
): Position {
  const ourGoalY = ourTeam === 1 ? 100 : 0
  const toward = ourTeam === 1 ? 1 : -1
  const moveRad = getMovementRadius(opponent)
  const role = getRoleGroup(opponent)

  // ── Antizipationsfähigkeit des beobachtenden Spielers ──
  // Bestimmt, wie viel der Vorhersage tatsächlich genutzt wird.
  // Hohe Antizipation → sieht die Zukunft. Niedrige → sieht nur die Gegenwart.
  const ant = observer
    ? getAnticipation(observer)
    : getTeamAnticipation(state, ourTeam)

  // ── 1. Realer Bewegungsvektor: Wohin bewegt sich der Spieler? ──
  const dx = opponent.position.x - opponent.origin.x
  const dy = opponent.position.y - opponent.origin.y
  const movedDist = Math.sqrt(dx * dx + dy * dy)
  const hasMoved = movedDist > 1.5

  // Startet bei der aktuellen Position — Vorhersage verschiebt davon weg
  let tx = opponent.position.x
  let ty = opponent.position.y

  if (hasMoved) {
    // Extrapolation: Projektion skaliert mit Antizipation
    // ant=0.3 → projiziert nur 30% so weit, ant=0.9 → fast volle Projektion
    const nx = dx / movedDist
    const ny = dy / movedDist
    const projection = moveRad * 0.6 * ant

    tx += nx * projection
    ty += ny * projection

    // Bewegung Richtung Tor: nur erkannt wenn Antizipation > 0.4
    const movesTowardGoal = (toward > 0 && dy > 0) || (toward < 0 && dy < 0)
    if (movesTowardGoal && ant > 0.4) {
      ty += ny * moveRad * 0.2 * ant
    }
  } else {
    // Keine Bewegung → Rollenbasierte Tendenz, skaliert mit Antizipation
    const roleFactor = ant  // Schwache Spieler antizipieren Rollentendenzen kaum
    if (role === 'attacker') {
      ty += toward * moveRad * 0.7 * roleFactor
      tx += (50 - tx) * 0.3 * roleFactor
    } else if (role === 'midfielder') {
      const isWinger = opponent.positionLabel === 'LM' || opponent.positionLabel === 'RM'
      if (isWinger) {
        const nearBox = Math.abs(opponent.position.y - ourGoalY) < 40
        if (nearBox) {
          tx += (50 - tx) * 0.4 * roleFactor
          ty += toward * moveRad * 0.4 * roleFactor
        } else {
          const side = tx > 50 ? 1 : -1
          tx += side * moveRad * 0.3 * roleFactor
          ty += toward * moveRad * 0.4 * roleFactor
        }
      } else {
        ty += toward * moveRad * 0.4 * roleFactor
      }
    } else if (role === 'defender') {
      const isFullback = opponent.positionLabel === 'LV' || opponent.positionLabel === 'RV'
      if (isFullback) {
        ty += toward * moveRad * 0.3 * roleFactor
        const side = tx > 50 ? 1 : -1
        tx += side * moveRad * 0.2 * roleFactor
      }
    }
  }

  // ── 2. Freie Räume — nur bei ausreichender Antizipation (> 0.45) ──
  // Schwache Spieler erkennen gefährliche Räume nicht, sie reagieren nur auf Laufwege
  if ((role === 'attacker' || role === 'midfielder') && ant > 0.45) {
    const space = findDangerousSpace(opponent, state, ourTeam, moveRad)
    if (space) {
      // Raumgewicht skaliert mit Antizipation: ant=0.5 → schwach, ant=0.9 → stark
      const baseWeight = Math.min(0.5, 0.2 + (space.score - 10) / 100)
      let spaceWeight = baseWeight * ant

      // Raum in Bewegungsrichtung? → verstärken
      if (hasMoved) {
        const vecToSpace = { x: space.pos.x - opponent.position.x, y: space.pos.y - opponent.position.y }
        const dot = dx * vecToSpace.x + dy * vecToSpace.y
        if (dot > 0) {
          spaceWeight = Math.min(0.55, spaceWeight * 1.4)
        } else {
          spaceWeight *= 0.5
        }
      }

      tx = tx * (1 - spaceWeight) + space.pos.x * spaceWeight
      ty = ty * (1 - spaceWeight) + space.pos.y * spaceWeight
    }
  }

  // ── 3. Hinter unsere Abwehrlinie? — nur bei guter Antizipation ──
  const ourDefs = state.players.filter(
    p => p.team === ourTeam && getRoleGroup(p) === 'defender',
  )
  if (ourDefs.length > 0 && (role === 'attacker' || hasMoved) && ant > 0.35) {
    const defLineY = ourDefs.reduce((s, p) => s + p.position.y, 0) / ourDefs.length
    const oppDistToLine = Math.abs(opponent.position.y - defLineY)
    if (oppDistToLine < 10 && role === 'attacker') {
      ty = defLineY + toward * 5 * ant
    }
    if (hasMoved) {
      const movingTowardLine = (toward > 0 && dy > 0 && opponent.position.y < defLineY + toward * 15)
        || (toward < 0 && dy < 0 && opponent.position.y > defLineY + toward * 15)
      if (movingTowardLine) {
        ty += toward * 3 * ant
      }
    }
  }

  // ── 4. Im Passbereich des Ballführers → Bedrohung verstärken ──
  const ballCarrier = state.players.find(p => p.id === state.ball.ownerId)
  if (ballCarrier && ballCarrier.team === opponent.team && ballCarrier.id !== opponent.id) {
    const distToCarrier = distance(ballCarrier.position, opponent.position)
    if (distToCarrier < 35) {
      // Amplify skaliert mit Antizipation
      const amplify = 1 + (distToCarrier < 20 ? 0.3 : 0.15) * ant
      tx = opponent.position.x + (tx - opponent.position.x) * amplify
      ty = opponent.position.y + (ty - opponent.position.y) * amplify
    }
  }

  // ── Finale Interpolation: Antizipation bestimmt wie weit von der Ist-Position ──
  // ant=0.2 → 80% aktuelle Position, 20% Vorhersage (sieht fast nichts)
  // ant=0.9 → 10% aktuelle Position, 90% Vorhersage (liest das Spiel perfekt)
  const fx = opponent.position.x * (1 - ant) + tx * ant
  const fy = opponent.position.y * (1 - ant) + ty * ant

  return clampToPitch(clampToRadius({ x: fx, y: fy }, opponent.position, moveRad))
}

// ══════════════════════════════════════════
//  Presser-Differenzierung
// ══════════════════════════════════════════

/** Ist dieser Spieler der nächste Presser am Ball/Ballführer? */
function isFirstPresser(player: PlayerData, state: GameState, pressers: Set<string>): boolean {
  const ballTarget = state.ball.position
  let myDist = distance(player.position, ballTarget)
  for (const pid of pressers) {
    if (pid === player.id) continue
    const other = state.players.find(p => p.id === pid)
    if (other && distance(other.position, ballTarget) < myDist) return false
  }
  return true
}

// ══════════════════════════════════════════
//  Manndeckung — Feste Zuordnung
// ══════════════════════════════════════════

/** Berechnet die Zuordnung: welcher eigene Spieler deckt welchen Gegner */
export function computeMarkingAssignments(
  ownPlayers: PlayerData[],
  opponents: PlayerData[],
): void {
  markingAssignments = new Map()
  const taken = new Set<string>()

  // Angreifer bleiben vorn für Konter — nur Verteidiger + Mittelfeld decken
  const markers = ownPlayers
    .filter(p => p.positionLabel !== 'TW' && getRoleGroup(p) !== 'attacker')
    .sort((a, b) => {
      // Verteidiger zuerst zuordnen (wichtigste Deckung)
      const roleOrder: Record<RoleGroup, number> = { defender: 0, midfielder: 1, attacker: 2 }
      return roleOrder[getRoleGroup(a)] - roleOrder[getRoleGroup(b)]
    })

  const availableOpponents = opponents.filter(o => o.positionLabel !== 'TW')

  for (const marker of markers) {
    // Nächsten ungedeckten Gegner auf ähnlicher Feldhöhe und Seite finden
    let bestOpp: PlayerData | null = null
    let bestScore = -Infinity

    for (const opp of availableOpponents) {
      if (taken.has(opp.id)) continue

      const dist = distance(marker.position, opp.position)
      if (dist > 50) continue  // Zu weit weg

      // Score: Nähe + Seiten-Übereinstimmung + Gefährlichkeit
      let score = 50 - dist

      // Gleiche Feldseite bevorzugen
      const sameSide = Math.abs(marker.origin.x - opp.position.x) < 30
      if (sameSide) score += 15

      // Gefährliche Gegner (nah am Tor) bevorzugen für Verteidiger
      if (getRoleGroup(marker) === 'defender') {
        const ownGoalY = marker.team === 1 ? 100 : 0
        const threatToGoal = 50 - Math.abs(opp.position.y - ownGoalY)
        score += threatToGoal * 0.3
      }

      if (score > bestScore) {
        bestScore = score
        bestOpp = opp
      }
    }

    if (bestOpp) {
      markingAssignments.set(marker.id, bestOpp.id)
      taken.add(bestOpp.id)
    }
  }
}

// ══════════════════════════════════════════
//  Pressing-Auswahl
// ══════════════════════════════════════════

/** Wählt Presser basierend auf Strategie + Gegenpress-Zustand */
export function selectPressers(
  players: PlayerData[],
  state: GameState,
  team: TeamSide,
  plan: TeamPlan | null,
  acted: Set<string>,
): Set<string> {
  const pressers = new Set<string>()
  const ballLoose = state.ball.ownerId === null
  const carrier = state.players.find(p => p.id === state.ball.ownerId)
  const hasBall = carrier != null && carrier.team === team
  if (hasBall) return pressers

  // Loser Ball → IMMER mindestens einer jagt, zweiter sichert ab
  if (ballLoose) {
    const sorted = players
      .filter(p => !acted.has(p.id) && p.positionLabel !== 'TW')
      .map(p => ({ id: p.id, dist: distance(p.position, state.ball.position), role: getRoleGroup(p) }))
      .sort((a, b) => a.dist - b.dist)
    if (sorted.length === 0) return pressers
    // Erster Presser: nächster Nicht-Verteidiger wenn nah genug, sonst einfach der Nächste
    const firstNonDef = sorted.find(c => c.role !== 'defender' && c.dist < 25)
    const first = firstNonDef ?? sorted[0]
    // IMMER jemanden zum Ball schicken — egal wie weit
    pressers.add(first.id)
    // Zweiter wenn innerhalb 15 Einheiten
    const second = sorted.find(c => c.id !== first.id && c.dist < 15)
    if (second) pressers.add(second.id)
    return pressers
  }

  // Pressing-Konfiguration wählen
  const config = gegenpressActive
    ? GEGENPRESS_CONFIG
    : PRESS_CONFIG[plan?.strategy.defense ?? 'mid_press']

  const target = carrier ? carrier.position : state.ball.position

  const candidates = players
    .filter(p => {
      if (acted.has(p.id) || p.positionLabel === 'TW') return false
      if (!config.allowDefenders && getRoleGroup(p) === 'defender') return false
      return true
    })
    .map(p => ({ id: p.id, dist: distance(p.position, target) }))
    .filter(c => c.dist < config.radius)
    .sort((a, b) => a.dist - b.dist)

  for (const { id } of candidates.slice(0, config.maxPressers)) {
    pressers.add(id)
  }
  return pressers
}

// ══════════════════════════════════════════
//  Hauptfunktion: Positionierung
// ══════════════════════════════════════════

/** Berechnet die Wunsch-Position eines Spielers ohne Ball */
export function decidePositioning(
  player: PlayerData,
  state: GameState,
  team: TeamSide,
  plan: TeamPlan | null,
  fieldReading: FieldReading | null,
  hasBall: boolean,
  ballLoose: boolean,
  pressers: Set<string>,
): { target: Position; reason: string } {

  // Torwart
  if (player.positionLabel === 'TW') {
    return goalkeeperPosition(player, state, team, plan)
  }

  // Pressing (inkl. Gegenpress + loser Ball)
  if (pressers.has(player.id)) {
    if (ballLoose) {
      // Loser Ball: erster Presser direkt zum Ball, zweiter leicht versetzt
      const isClosest = isFirstPresser(player, state, pressers)
      if (isClosest) {
        return { target: state.ball.position, reason: 'Läuft zum losen Ball' }
      }
      // Zweiter Presser: abfangen statt identische Position
      const fwd = team === 1 ? -1 : 1
      return {
        target: { x: state.ball.position.x, y: state.ball.position.y + fwd * 6 },
        reason: 'Sichert losen Ball ab',
      }
    }
    const carrier = state.players.find(p => p.id === state.ball.ownerId)
    if (carrier) {
      const isClosest = isFirstPresser(player, state, pressers)
      if (isClosest) {
        // Erster Presser: direkt auf den Ballführer
        return { target: carrier.position, reason: gegenpressActive ? 'Gegenpressing' : 'Pressing' }
      }
      // Zweiter Presser: Passweg abschneiden (Richtung eigenes Tor versetzt)
      const fwd = team === 1 ? -1 : 1
      const cutOff = {
        x: carrier.position.x + (player.position.x > carrier.position.x ? 8 : -8),
        y: carrier.position.y + fwd * 8,
      }
      return { target: cutOff, reason: gegenpressActive ? 'Gegenpressing (Passweg)' : 'Pressing (Passweg)' }
    }
    return { target: state.ball.position, reason: 'Pressing' }
  }

  // Eigener Ballbesitz → Angriff
  if (hasBall) {
    return offensivePosition(player, state, team, plan, fieldReading)
  }

  // Manndeckung
  if (plan?.strategy.defense === 'man_marking') {
    const assignedId = markingAssignments.get(player.id)
    if (assignedId) {
      const opponent = state.players.find(p => p.id === assignedId)
      if (opponent) return manMarkingPosition(player, opponent, state, team)
    }
  }

  // Defensiv-Position
  return defensivePosition(player, state, team, plan, fieldReading)
}

// ══════════════════════════════════════════
//  Positions-Berechnungen
// ══════════════════════════════════════════

function goalkeeperPosition(
  player: PlayerData,
  state: GameState,
  team: TeamSide,
  plan: TeamPlan | null,
): { target: Position; reason: string } {
  const baseY = team === 1 ? 97 : 3
  const xShift = (state.ball.position.x - PITCH.CENTER_X) * 0.25

  // High Press: leicht aus dem Tor herausrücken
  let yAdjust = 0
  if (plan?.strategy.defense === 'high_press') yAdjust = team === 1 ? -2 : 2

  return {
    target: { x: PITCH.CENTER_X + xShift, y: baseY + yAdjust },
    reason: 'Torwart-Position',
  }
}

function offensivePosition(
  player: PlayerData,
  state: GameState,
  team: TeamSide,
  plan: TeamPlan | null,
  fieldReading: FieldReading | null,
): { target: Position; reason: string } {
  const fwd = team === 1 ? -1 : 1
  const role = getRoleGroup(player)
  const cfg = ATK_BEHAVIOR[plan?.strategy.attack ?? 'possession'][role]

  // Basis: Formationsposition mit Rückzug-Drang zum Mannschaftsgefüge
  // Bei Ballgewinn stehen Spieler oft falsch — Formation-Pull zieht sie zurück
  const formHome = getFormationHome(player)
  const FORMATION_PULL_ATK = 0.45  // 45% Zug Richtung Heimposition
  const anchorX = player.origin.x + (formHome.x - player.origin.x) * FORMATION_PULL_ATK
  const anchorY = player.origin.y + (formHome.y - player.origin.y) * FORMATION_PULL_ATK
  const xOffset = anchorX - 50
  let x = 50 + xOffset * cfg.widthScale
  let y = anchorY

  // Vertikal: aufrücken
  y += fwd * cfg.verticalOffset

  // Ball-Anziehung
  y += (state.ball.position.y - y) * cfg.ballAttractionY
  x += (state.ball.position.x - x) * cfg.ballAttractionX

  // Feldanalyse: schwache Seite ausnutzen
  if (fieldReading) {
    if (fieldReading.weakSide === 'left' && player.origin.x < 40) x -= 3
    if (fieldReading.weakSide === 'right' && player.origin.x > 60) x += 3
  }

  // ── Freilaufen: Abstand von Gegnern UND Mitspielern suchen ──
  // In Ballbesitz: Räume besetzen, nicht klumpen

  // 1) Vom nächsten Gegner weg (sichere Passoptionen)
  const opponents = state.players.filter(p => p.team !== team && p.positionLabel !== 'TW')
  let nearOppDist = Infinity
  let nearOppX = 0, nearOppY = 0
  for (const opp of opponents) {
    const d = distance({ x, y }, opp.position)
    if (d < nearOppDist) { nearOppDist = d; nearOppX = opp.position.x; nearOppY = opp.position.y }
  }
  if (nearOppDist < 18) {
    const push = (18 - nearOppDist) * 0.35
    let dx = x - nearOppX
    let dy = (y - nearOppY) + fwd * 2
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    x += (dx / len) * push
    y += (dy / len) * push
  }

  // 2) Von Mitspielern weg (Breite und Tiefe erzeugen)
  const teammates = state.players.filter(p => p.team === team && p.id !== player.id && p.positionLabel !== 'TW')
  for (const mate of teammates) {
    const d = distance({ x, y }, mate.position)
    if (d < 12 && d > 0.5) {
      const push = (12 - d) * 0.20
      const dx = x - mate.position.x
      const dy = y - mate.position.y
      const len = Math.sqrt(dx * dx + dy * dy) || 1
      x += (dx / len) * push
      y += (dy / len) * push
    }
  }

  // ── Staffelung: Verteidiger nie vor dem tiefsten Mittelfeldspieler ──
  if (role === 'defender') {
    const mids = state.players.filter(p => p.team === team && p.id !== player.id && getRoleGroup(p) === 'midfielder')
    if (mids.length > 0) {
      const deepestMidY = team === 1
        ? Math.max(...mids.map(m => m.position.y))
        : Math.min(...mids.map(m => m.position.y))
      if (team === 1 && y < deepestMidY) y = deepestMidY + 2
      if (team === 2 && y > deepestMidY) y = deepestMidY - 2
    }
  }

  // Konter-Absicherung: nicht blind über die Mitte aufrücken
  y = counterInsurance(player, y, state, team)

  // ── Finale Seitengrenze: Flügelspieler verlassen nie ihre Seite ──
  const oSide = getHomeSide(player)
  if (oSide === 'left' && x > 48) x = 48
  if (oSide === 'right' && x < 52) x = 52

  return { target: { x, y }, reason: 'Angriffs-Position' }
}

function defensivePosition(
  player: PlayerData,
  state: GameState,
  team: TeamSide,
  plan: TeamPlan | null,
  fieldReading: FieldReading | null,
): { target: Position; reason: string } {
  const fwd = team === 1 ? -1 : 1
  const role = getRoleGroup(player)
  const defStrat = plan?.strategy.defense ?? 'mid_press'
  const cfg = DEF_BEHAVIOR[defStrat][role]

  // Basis: Formationsposition mit Rückzug-Drang zum Mannschaftsgefüge (schwächer als offensiv)
  const formHome = getFormationHome(player)
  const FORMATION_PULL_DEF = 0.25  // 25% Zug Richtung Heimposition
  const anchorX = player.origin.x + (formHome.x - player.origin.x) * FORMATION_PULL_DEF
  const anchorY = player.origin.y + (formHome.y - player.origin.y) * FORMATION_PULL_DEF
  const xOffset = anchorX - 50
  let x = 50 + xOffset * cfg.widthScale
  let y = anchorY

  // Vertikal: aufrücken oder zurückfallen
  y += fwd * cfg.verticalOffset

  // Ball-Anziehung
  y += (state.ball.position.y - y) * cfg.ballAttractionY
  x += (state.ball.position.x - x) * cfg.ballAttractionX

  // ── Defensive Tiefenbegrenzung: verhindert Vorwärts-Drift über viele Züge ──
  // origin ist die Startposition der Runde, NICHT die Formationsposition.
  // Ohne Begrenzung driften Verteidiger Runde für Runde nach vorne.
  const maxFromGoal: Record<RoleGroup, Record<DefenseStrategy, number>> = {
    defender:   { high_press: 40, mid_press: 35, deep_block: 28, man_marking: 35 },
    midfielder: { high_press: 55, mid_press: 48, deep_block: 40, man_marking: 48 },
    attacker:   { high_press: 70, mid_press: 65, deep_block: 55, man_marking: 65 },
  }
  const ceiling = maxFromGoal[role][defStrat]
  if (team === 1 && y < (100 - ceiling)) y = 100 - ceiling
  if (team === 2 && y > ceiling) y = ceiling

  // ── Ballseiten-Kompaktheit: Team verschiebt als Block zum Ball ──
  // Stärke der kollektiven Verschiebung hängt von Mannschaftsqualität ab.
  // Gute Teams verschieben synchron, schwache reagieren träge.
  const earlyTeamAnt = getTeamAnticipation(state, team)
  const ballXFromCenter = state.ball.position.x - PITCH.CENTER_X
  const ballIsWide = Math.abs(ballXFromCenter) > 15
  if (ballIsWide) {
    const baseShift = role === 'defender' ? 4 : role === 'midfielder' ? 3 : 2
    const shiftAmount = baseShift * (0.5 + earlyTeamAnt * 0.6)  // 0.5–1.04 Multiplikator
    x += Math.sign(ballXFromCenter) * shiftAmount
  }

  // ── Tiefenstaffelung: Verteidiger weit vom Ball lassen sich tiefer fallen ──
  // Ein Verteidiger, der horizontal weit vom Ball entfernt steht, kann weder
  // pressen noch einen Steilpass/Ball in die Tiefe rechtzeitig abfangen.
  // Er bleibt daher tiefer, um die Kette abzusichern.
  if (role === 'defender') {
    const horizontalDist = Math.abs(x - state.ball.position.x)
    if (horizontalDist > 20) {
      const depthPull = (horizontalDist - 20) * 0.15  // 0–4.5 Einheiten tiefer
      y -= fwd * depthPull  // Richtung eigenes Tor
    }
  }

  // ── Raumverteidigung: auf Bedrohung in der eigenen Zone reagieren ──
  // ── Raumverteidigung: auf Bedrohung reagieren, skaliert mit Spieler-Antizipation ──
  const ant = getAnticipation(player)
  const teamAnt = getTeamAnticipation(state, team)
  const opponents = state.players.filter(p => p.team !== team)
  const threat = findNearestThreat(player, opponents, state, team)
  if (threat) {
    // Basis-Gewicht + Spieler-Antizipation: ant=0.3 → reagiert kaum, ant=0.9 → volle Reaktion
    const baseH = role === 'defender' ? 0.20 : 0.15
    const baseV = role === 'defender' ? 0.18 : 0.12
    const threatWeight = baseH + ant * 0.25
    x += (threat.x - x) * threatWeight
    const vertWeight = baseV + ant * 0.22
    y += (threat.y - y) * vertWeight
  }

  // ── Ungedeckte Gegner in der eigenen Zone absichern ──
  let reason = 'Defensiv-Position'
  {
    const ownGroup = role === 'defender'
      ? state.players.filter(p => p.team === team && getRoleGroup(p) === 'defender')
      : state.players.filter(p => p.team === team && getRoleGroup(p) === 'midfielder')

    let uncoveredRunner: PlayerData | null = null
    let bestUrgency = 0

    for (const opp of opponents) {
      if (opp.positionLabel === 'TW') continue

      // Ist dieser Gegner ungedeckt?
      const nearestMateDist = Math.min(
        ...ownGroup.map(m => distance(m.position, opp.position)),
        Infinity,
      )
      if (nearestMateDist < 10) continue  // Bereits gedeckt

      // Bin ich der nächste in meiner Gruppe?
      const myDist = distance({ x, y }, opp.position)
      if (myDist > 35) continue
      const closerMate = ownGroup.some(
        m => m.id !== player.id && distance(m.position, opp.position) < myDist,
      )
      if (closerMate) continue

      // Dringlichkeit berechnen
      let urgency = nearestMateDist * 0.3  // Je weiter ungedeckt, desto dringender

      if (role === 'defender') {
        const defLineY = ownGroup.length > 0
          ? ownGroup.reduce((s, p) => s + p.position.y, 0) / ownGroup.length : y
        const lineProximity = Math.max(0, 15 - Math.abs(opp.position.y - defLineY))
        const isWide = opp.position.x < 30 || opp.position.x > 70
        urgency += lineProximity + (isWide ? 8 : 0)
      }

      if (role === 'midfielder') {
        // Gegner zwischen den Linien = sehr gefährlich
        const ownGoalY = team === 1 ? 100 : 0
        const distToGoal = Math.abs(opp.position.y - ownGoalY)
        if (distToGoal < 55) urgency += (55 - distToGoal) * 0.3
        // Gegner in meiner horizontalen Zone
        const inMyZone = Math.abs(opp.position.x - player.origin.x) < 25
        if (inMyZone) urgency += 8
        // Gegner nah am Ball (wahrscheinlicher Passempfänger)
        const ballDist = distance(opp.position, state.ball.position)
        if (ballDist < 20) urgency += (20 - ballDist) * 0.4
      }

      if (urgency > bestUrgency) {
        bestUrgency = urgency
        uncoveredRunner = opp
      }
    }

    if (uncoveredRunner && bestUrgency > 6) {
      // Spieler mit hoher Antizipation erkennen + reagieren auf freie Läufer stärker
      const pull = Math.min(0.5, bestUrgency / 25) * (0.5 + ant * 0.6)
      x += (uncoveredRunner.position.x - x) * pull
      y += (uncoveredRunner.position.y - y) * pull * (role === 'defender' ? 0.5 : 0.6)
      reason = 'Deckt freien Raum'
    }
  }

  // Feldanalyse: Gegner greift eine Seite an → stärker verschieben
  // Gute Teams lesen die Angriffsrichtung und reagieren, schwache nicht
  if (fieldReading && teamAnt > 0.35) {
    const baseShift = role === 'defender' ? 4 : 3
    const shift = baseShift * teamAnt  // schwache Teams: kaum, starke: voll
    if (fieldReading.attackDirection === 'left') x -= shift
    if (fieldReading.attackDirection === 'right') x += shift
  }

  // ── Außenverteidiger: Flankenverteidigung ──
  if (player.positionLabel === 'LV' || player.positionLabel === 'RV') {
    const isLeft = isOnLeftSide(player)
    const carrier = state.ball.ownerId
      ? state.players.find(p => p.id === state.ball.ownerId)
      : null

    if (carrier && carrier.team !== team) {
      const onMyWing = isLeft ? carrier.position.x < 45 : carrier.position.x > 55

      if (onMyWing) {
        // Ballführer auf meiner Flanke → Laufweg zum Tor abschneiden
        const toward = team === 1 ? 1 : -1
        const interceptY = carrier.position.y + toward * 5
        // Heimat-X statt origin.x als Anker: LV ≈ 22 (team1) / 78 (team2)
        const homeX = isLeft ? (team === 1 ? 22 : 22) : (team === 1 ? 78 : 78)
        const interceptX = homeX * 0.5 + carrier.position.x * 0.5
        x = x * 0.3 + interceptX * 0.7
        y = y * 0.3 + interceptY * 0.7
        reason = 'Flanke verteidigen'
      } else {
        // Ball auf anderer Seite → einrücken, aber Flanke nicht aufgeben
        // Harte Grenze: nie über 42 (links) oder unter 58 (rechts)
        if (isLeft) {
          x = Math.min(x, 42)
        } else {
          x = Math.max(x, 58)
        }
      }
    }

    // ── Flügel-Gegner in Reichweite halten ──
    const wingOpponents = opponents.filter(o => {
      if (o.positionLabel === 'TW') return false
      return isLeft ? o.position.x < 40 : o.position.x > 60
    })
    if (wingOpponents.length > 0) {
      const mostAdvanced = wingOpponents.reduce((best, o) => {
        const oDanger = team === 1 ? o.position.y : -o.position.y
        const bDanger = team === 1 ? best.position.y : -best.position.y
        return oDanger > bDanger ? o : best
      })

      const maxAhead = getMovementRadius(player) * 0.3
      const oppY = mostAdvanced.position.y
      if (team === 1 && y < oppY - maxAhead) {
        y = oppY - maxAhead
        reason = 'Sichert Flügel ab'
      }
      if (team === 2 && y > oppY + maxAhead) {
        y = oppY + maxAhead
        reason = 'Sichert Flügel ab'
      }
    }

    // ── Harte Seitengrenze: Außenverteidiger verlässt NIEMALS seine Seite ──
    // LV darf maximal bis x=42 einrücken, RV maximal bis x=58
    if (isLeft && x > 42) x = 42
    if (!isLeft && x < 58) x = 58
  }

  // ── Flügelspieler (LM/RM): dürfen nicht auf die falsche Seite driften ──
  if (player.positionLabel === 'LM' || player.positionLabel === 'RM') {
    const isLeft = isOnLeftSide(player)
    // Weichere Grenze als Außenverteidiger — dürfen etwas mehr einrücken
    if (isLeft && x > 48) x = 48
    if (!isLeft && x < 52) x = 52
  }

  // ── Mitspieler-Abstoßung: auch defensiv nicht klumpen ──
  const mates = state.players.filter(p => p.team === team && p.id !== player.id && p.positionLabel !== 'TW')
  for (const mate of mates) {
    const d = distance({ x, y }, mate.position)
    if (d < 17 && d > 0.5) {
      const push = (17 - d) * 0.25
      const dx = x - mate.position.x
      const dy = y - mate.position.y
      const len = Math.sqrt(dx * dx + dy * dy) || 1
      x += (dx / len) * push
      // Vertikal nur minimal schieben — Linie halten
      y += (dy / len) * push * 0.4
    }
  }

  // ── Staffelung: Verteidiger nie vor dem tiefsten Mittelfeldspieler ──
  if (role === 'defender') {
    const mids = state.players.filter(p => p.team === team && p.id !== player.id && getRoleGroup(p) === 'midfielder')
    if (mids.length > 0) {
      const deepestMidY = team === 1
        ? Math.max(...mids.map(m => m.position.y))
        : Math.min(...mids.map(m => m.position.y))
      if (team === 1 && y < deepestMidY) y = deepestMidY + 2
      if (team === 2 && y > deepestMidY) y = deepestMidY - 2
    }
  }

  // Konter-Absicherung: nicht blind über die Mitte aufrücken
  y = counterInsurance(player, y, state, team)

  // ── Finale Seitengrenze: Abstoßung und Staffelung dürfen Seite nicht verletzen ──
  const finalSide = getHomeSide(player)
  if (finalSide === 'left' && x > 48) x = 48
  if (finalSide === 'right' && x < 52) x = 52

  return { target: { x, y }, reason }
}

function manMarkingPosition(
  player: PlayerData,
  opponent: PlayerData,
  state: GameState,
  team: TeamSide,
): { target: Position; reason: string } {
  const toward = team === 1 ? 1 : -1

  // Vorhersage: wo WILL der Gegner hin? (Qualität hängt von unserem Spieler ab)
  const threat = predictThreat(opponent, state, team, player)

  // Positioniere dich zwischen Gegner und vorhergesagtem Ziel, torwartseitig
  const ant = getAnticipation(player)
  let tx = threat.x * (0.5 + ant * 0.3) + opponent.position.x * (0.5 - ant * 0.3)
  let ty = threat.y * 0.7 + opponent.position.y * 0.3
  ty += toward * 2  // Torwartseitig bleiben

  // Nicht zu weit von der Grundposition entfernen (max 15 Einheiten)
  const dx = tx - player.origin.x
  const dy = ty - player.origin.y
  const drift = Math.sqrt(dx * dx + dy * dy)
  if (drift > 15) {
    const scale = 15 / drift
    tx = player.origin.x + dx * scale
    ty = player.origin.y + dy * scale
  }

  return {
    target: { x: tx, y: ty },
    reason: `Deckt ${opponent.positionLabel} ${opponent.lastName}`,
  }
}

// ══════════════════════════════════════════
//  Konter-Absicherung
// ══════════════════════════════════════════

/**
 * Verhindert, dass Verteidiger zu weit über die Mittellinie aufrücken,
 * wenn ein gegnerischer Feldspieler in dessen eigener Hälfte hinter ihnen steht.
 * Erlaubte Übersteuerung hängt von der Pace des Verteidigers ab:
 * - Schneller Verteidiger (Pace +20) → kann 11 Einheiten über die Mitte
 * - Gleiche Pace → max 5 Einheiten
 * - Langsamer Verteidiger (Pace -17+) → bleibt auf der Mittellinie
 */
function counterInsurance(
  player: PlayerData,
  targetY: number,
  state: GameState,
  team: TeamSide,
): number {
  if (getRoleGroup(player) !== 'defender') return targetY

  const halfway = 50

  // Nur relevant wenn über die Mittellinie hinausgerückt
  const pastHalfway = team === 1 ? targetY < halfway : targetY > halfway
  if (!pastHalfway) return targetY

  // Gegner in deren eigener Hälfte, die hinter unserer Position stehen
  const threats = state.players.filter(p => {
    if (p.team === team || p.positionLabel === 'TW') return false
    // In eigener Hälfte? (kann nicht abseits stehen)
    const inOwnHalf = team === 1 ? p.position.y < halfway : p.position.y > halfway
    if (!inOwnHalf) return false
    // Hinter unserer Linie? (näher an unserem Tor)
    return team === 1 ? p.position.y > targetY : p.position.y < targetY
  })

  if (threats.length === 0) return targetY

  // Schnellste Bedrohung finden
  const fastestPace = Math.max(...threats.map(p => p.stats.pacing))

  // Können wir ihn einholen? Abhängig von Verteidigerqualität
  const catchUp = (player.stats.pacing - fastestPace) / 100

  // Erlaubte Distanz jenseits der Mittellinie
  const maxSafe = Math.max(0, catchUp * 30 + 5)

  const overExtension = Math.abs(targetY - halfway)
  if (overExtension <= maxSafe) return targetY

  return team === 1 ? halfway - maxSafe : halfway + maxSafe
}

// ══════════════════════════════════════════
//  Hilfsfunktionen
// ══════════════════════════════════════════

/**
 * Berechnet die Formationsheimposition eines Spielers.
 * Nutzt den Slot-Index aus der Player-ID (t1-3 → Index 3) und
 * die aktuelle Confidence für Push/Spread.
 * Ergebnis: dort wo der Spieler im Mannschaftsgefüge "hingehört".
 */
function getFormationHome(player: PlayerData): Position {
  const idx = parseInt(player.id.split('-')[1], 10)
  const slot = FORMATION_433[idx]
  if (!slot) return player.origin

  const cf = Math.max(0.15, Math.min(0.95, player.confidence / 100))
  const xOff = slot.x < 50 ? -slot.xSpread * cf
             : slot.x > 50 ?  slot.xSpread * cf : 0
  const baseX = Math.max(3, Math.min(97, slot.x + xOff))
  const baseY = Math.max(50, slot.y - slot.push * cf)

  if (player.team === 2) {
    return { x: 100 - baseX, y: 100 - baseY }
  }
  return { x: baseX, y: baseY }
}

/** Rolle aus Positionslabel — stabil, driftet nicht mit origin */
function getRoleGroup(player: PlayerData): RoleGroup {
  const label = player.positionLabel
  if (['IV', 'LV', 'RV'].includes(label)) return 'defender'
  if (['ZDM', 'LM', 'RM'].includes(label)) return 'midfielder'
  return 'attacker'  // ST, OM, TW (TW wird separat behandelt)
}

/**
 * Bestimmt ob ein Spieler auf der linken Seite des Spielfelds gehört.
 *
 * Basiert auf positionLabel + team, NICHT auf origin.x.
 * Team 2 ist gespiegelt: LV hat x>50, RV hat x<50.
 *
 * Gibt null zurück für zentrale Spieler (IV, ZDM, OM, ST, TW).
 */
function getHomeSide(player: PlayerData): 'left' | 'right' | null {
  const label = player.positionLabel
  // Formation: LV/LM = links (x<50 bei Team 1), RV/RM = rechts (x>50 bei Team 1)
  // Team 2 spiegelt: LV → x>50, RV → x<50
  if (label === 'LV' || label === 'LM') {
    return player.team === 1 ? 'left' : 'right'
  }
  if (label === 'RV' || label === 'RM') {
    return player.team === 1 ? 'right' : 'left'
  }
  return null  // Zentrale Spieler
}

/**
 * Gibt true zurück wenn der Spieler auf der linken Bildschirmseite (x < 50) gehört.
 * Zuverlässig unabhängig von origin-Drift.
 */
function isOnLeftSide(player: PlayerData): boolean {
  const side = getHomeSide(player)
  return side === 'left'
}

/**
 * Findet die gefährlichste relevante Bedrohung für einen Spieler.
 * Verteidiger beobachten Angreifer, Mittelfeldspieler beobachten Mittelfeldspieler.
 *
 * Bedrohungsbewertung für Verteidiger berücksichtigt:
 * - Distanz (näher = gefährlicher)
 * - Position nahe der Abwehrlinie (Läufer in die Tiefe)
 * - Ungedeckte Gegner in freien Räumen
 * - Außenverteidiger priorisieren ihre Flanke
 */
function findNearestThreat(
  player: PlayerData,
  opponents: PlayerData[],
  state: GameState,
  team: TeamSide,
): Position | null {
  const role = getRoleGroup(player)
  const maxRange = 40

  // Relevante Gegner filtern (alle Feldspieler außer TW)
  const relevant = opponents.filter(o => o.positionLabel !== 'TW')
  if (relevant.length === 0) return null

  const isFullback = player.positionLabel === 'LV' || player.positionLabel === 'RV'
  const isDefender = role === 'defender'
  const fwd = team === 1 ? -1 : 1
  const ownGoalY = team === 1 ? 100 : 0

  // Eigene Mitspieler nach Rolle für Deckungsprüfung
  const ownDefs = state.players.filter(
    p => p.team === team && getRoleGroup(p) === 'defender',
  )
  const ownMids = state.players.filter(
    p => p.team === team && getRoleGroup(p) === 'midfielder',
  )
  const defLineY = ownDefs.length > 0
    ? ownDefs.reduce((s, p) => s + p.position.y, 0) / ownDefs.length
    : player.position.y

  let bestOpp: PlayerData | null = null
  let bestScore = -Infinity

  for (const opp of relevant) {
    const d = distance(player.position, opp.position)
    if (d > maxRange) continue

    // Basis-Score: näher = besser
    let score = maxRange - d

    // ── Wie gefährlich ist dieser Gegner gerade? ──

    // Nah am Ball = aktiver, gefährlicher
    const ballDist = distance(opp.position, state.ball.position)
    if (ballDist < 20) score += (20 - ballDist) * 0.5

    // Nah an unserem Tor = gefährlicher
    const distToGoal = Math.abs(opp.position.y - ownGoalY)
    if (distToGoal < 50) score += (50 - distToGoal) * 0.3

    // ── Bewegungsvektor: Gegner läuft aktiv auf unsere Kette zu ──
    const odx = opp.position.x - opp.origin.x
    const ody = opp.position.y - opp.origin.y
    const oppMovedDist = Math.sqrt(odx * odx + ody * ody)
    if (oppMovedDist > 1.5) {
      // Läuft Richtung unser Tor?
      const movesTowardUs = (fwd < 0 && ody < 0) || (fwd > 0 && ody > 0)
      if (movesTowardUs) {
        // Je schneller und direkter, desto gefährlicher
        score += oppMovedDist * 1.2  // Schnelle Sprints = hohe Gefahr
        // Läuft auf die Abwehrlinie zu? Extra-Bonus
        const distToDefLine = Math.abs(opp.position.y - defLineY)
        if (distToDefLine < 20) score += (20 - distToDefLine) * 0.8
      }
    }

    // ── Deckungsprüfung: ungedeckte Gegner sind gefährlicher ──
    const ownGroup = isDefender ? ownDefs : ownMids
    const coveredBy = ownGroup.filter(
      mate => mate.id !== player.id && distance(mate.position, opp.position) < 12,
    )
    if (coveredBy.length === 0) score += 15  // Ungedeckt → viel gefährlicher

    // ── Rollenspezifische Bonusse ──

    if (isDefender) {
      // Flanken-Bonus für Außenverteidiger
      if (isFullback) {
        const myLeft = isOnLeftSide(player)
        const onMyWing = myLeft ? opp.position.x < 45 : opp.position.x > 55
        if (onMyWing) score += 15
      }

      // Gegner nahe unserer Abwehrlinie (Tiefenläufer)
      const nearDefLine = Math.abs(opp.position.y - defLineY)
      if (nearDefLine < 12) score += (12 - nearDefLine) * 1.5

      // Gegner breit + ungedeckt
      const isWide = opp.position.x < 30 || opp.position.x > 70
      if (isWide && coveredBy.length === 0) score += 10
    }

    if (role === 'midfielder') {
      // ZDM: Gegner zwischen den Linien ist besonders gefährlich
      const isCDM = player.positionLabel === 'ZDM'
      if (isCDM) {
        // Gegner im Raum zwischen Mittelfeld und Abwehr (der "Zehnerraum")
        const inPocket = team === 1
          ? opp.position.y > defLineY && opp.position.y < player.origin.y
          : opp.position.y < defLineY && opp.position.y > player.origin.y
        if (inPocket) score += 18
      }

      // Flügelspieler: Gegner auf meiner Seite
      const isWingMid = player.positionLabel === 'LM' || player.positionLabel === 'RM'
      if (isWingMid) {
        const myLeft = isOnLeftSide(player)
        const onMySide = myLeft ? opp.position.x < 40 : opp.position.x > 60
        if (onMySide) score += 12
      }

      // OM: Gegner im Zentrum vor der Abwehr
      if (player.positionLabel === 'OM') {
        const isCentral = opp.position.x > 30 && opp.position.x < 70
        if (isCentral) score += 8
      }

      // Bonus: Gegner empfängt wahrscheinlich den nächsten Pass (nah am Ballführer)
      if (ballDist < 15 && d < 25) score += 10
    }

    if (score > bestScore) { bestScore = score; bestOpp = opp }
  }

  if (!bestOpp) return null
  return predictThreat(bestOpp, state, team, player)
}
