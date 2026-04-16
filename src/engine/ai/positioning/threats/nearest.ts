import type { GameState, PlayerData, Position, TeamSide } from '../../../types'
import { distance } from '../../../geometry'
import { getRoleGroup, isOnLeftSide } from '../roles'
import { predictThreat } from './predict'

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
