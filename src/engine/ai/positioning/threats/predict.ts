import type { GameState, PlayerData, Position, TeamSide } from '../../../types'
import { distance, getMovementRadius, clampToRadius, clampToPitch } from '../../../geometry'
import { getRoleGroup } from '../roles'
import { getAnticipation, getTeamAnticipation } from '../anticipation'
import { findDangerousSpace } from './dangerousSpace'

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
