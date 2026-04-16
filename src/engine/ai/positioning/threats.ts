import type { GameState, PlayerData, Position, TeamSide } from '../../types'
import { distance, getMovementRadius, clampToRadius, clampToPitch } from '../../geometry'
import { getRoleGroup, isOnLeftSide } from './roles'
import { getAnticipation, getTeamAnticipation } from './anticipation'

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
export function findNearestThreat(
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
