import type { GameState, PlayerData, Position, TeamSide } from '../../types'
import type { TeamPlan, FieldReading, DefenseStrategy } from '../types'
import { distance, getMovementRadius } from '../../geometry'
import { PITCH } from '../../constants'
import { DEF_BEHAVIOR } from './config'
import type { RoleGroup } from './config'
import { getFormationHome, getRoleGroup, getHomeSide, isOnLeftSide } from './roles'
import { getAnticipation, getTeamAnticipation } from './anticipation'
import { findNearestThreat, predictThreat } from './threats'
import { counterInsurance } from './offensive'

export function goalkeeperPosition(
  _player: PlayerData,
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

export function defensivePosition(
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
  // Attacker-Obergrenzen bewusst hoch — mind. ein Stürmer bleibt als Konter-
  // Anker im gegnerischen Halbfeld stehen, statt jedes Mal mit zurückzufallen.
  // Bei 82/78/72 steht der höchste Angreifer bei Team 1 zwischen y=18 und y=28
  // (also am oder im 16er), wenn der Gegner in Ballbesitz ist.
  const maxFromGoal: Record<RoleGroup, Record<DefenseStrategy, number>> = {
    defender:   { high_press: 40, mid_press: 35, deep_block: 28, man_marking: 35 },
    midfielder: { high_press: 55, mid_press: 48, deep_block: 40, man_marking: 48 },
    attacker:   { high_press: 82, mid_press: 78, deep_block: 72, man_marking: 78 },
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

  // ── Antizipations-Tiefenpuffer: nicht vom Stürmer überlaufen lassen ──
  // User-Feedback 2026-04-24: Bochum–Bayern 0:3 in 16 min durch Steilpässe
  // und lange Bälle. Verteidiger standen auf der Abseitslinie, der ST konnte
  // sie mit einem Sprint überlaufen. Die uncovered-runner-Logik oben zieht
  // den Verteidiger ZUM Gegner — in dieser Situation muss er aber HINTER
  // den Gegner, um nicht per Ball in den Rücken ausgespielt zu werden.
  //
  // Logik: für jeden defender, wenn ein offensiver Gegner (ST/OM/LM/RM) in
  // seiner horizontalen Zone UND in Bedrohungsdistanz vor der Abwehrlinie
  // steht, setze y auf einen pacing-sensitiven Tiefenpuffer hinter dem
  // Threat. Langsame Verteidiger vs schnelle Stürmer → größerer Puffer.
  if (role === 'defender') {
    const goalward = team === 1 ? 1 : -1

    // Angreifer des Gegners in meiner Zone
    const offensiveThreats = opponents.filter(o => {
      if (o.positionLabel === 'TW') return false
      const isOff = getRoleGroup(o) === 'attacker'
        || o.positionLabel === 'OM'
        || o.positionLabel === 'LM'
        || o.positionLabel === 'RM'
      if (!isOff) return false
      // Horizontal in meiner Zone (±15)
      const horDist = Math.abs(o.position.x - x)
      if (horDist > 15) return false
      // Vertikal: Stürmer noch vor mir UND in Bedrohungsdistanz (≤ 20)
      const threatDepth = team === 1
        ? y - o.position.y    // positiv: Stürmer oberhalb (vor Team-1-Verteidiger)
        : o.position.y - y
      if (threatDepth < 0) return false    // Stürmer schon durch
      if (threatDepth > 20) return false   // zu weit weg
      return true
    })

    if (offensiveThreats.length > 0) {
      // Gefährlichster Gegner: der am nähesten am eigenen Tor steht
      const ownGoalY = team === 1 ? 100 : 0
      const mostDangerous = offensiveThreats.reduce((best, o) => {
        const bestDist = Math.abs(best.position.y - ownGoalY)
        const oDist = Math.abs(o.position.y - ownGoalY)
        return oDist < bestDist ? o : best
      })

      // Puffer-Distanz nach pacing-Differential + Antizipation
      // Basis 7 Einheiten, ±3 pacing-abhängig, ±1 antizipationsabhängig
      const pacingDiff = player.stats.pacing - mostDangerous.stats.pacing
      const paceAdjust = -pacingDiff * 0.15  // pacingDiff -20 → +3 (tiefer stehen)
      const antAdjust = (0.65 - ant) * 2     // ant 0.3 → +0.7, ant 0.9 → -0.5
      const bufferDepth = Math.max(4, Math.min(14, 7 + paceAdjust + antAdjust))

      // Mindest-y HINTER dem Threat (goalwärts)
      const safeY = mostDangerous.position.y + goalward * bufferDepth

      // Nur fallback, nicht vorrücken — Ziel: "nicht überlaufen werden"
      if (team === 1 && y < safeY) {
        y = safeY
        reason = 'Fällt zurück (Antizipation)'
      }
      if (team === 2 && y > safeY) {
        y = safeY
        reason = 'Fällt zurück (Antizipation)'
      }
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

export function manMarkingPosition(
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
