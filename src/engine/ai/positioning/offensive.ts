import type { GameState, PlayerData, Position, TeamSide } from '../../types'
import type { TeamPlan, FieldReading } from '../types'
import { distance } from '../../geometry'
import { ATK_BEHAVIOR } from './config'
import { getFormationHome, getRoleGroup, getHomeSide } from './roles'

/**
 * Verhindert, dass Verteidiger zu weit über die Mittellinie aufrücken,
 * wenn ein gegnerischer Feldspieler in dessen eigener Hälfte hinter ihnen steht.
 * Erlaubte Übersteuerung hängt von der Pace des Verteidigers ab:
 * - Schneller Verteidiger (Pace +20) → kann 11 Einheiten über die Mitte
 * - Gleiche Pace → max 5 Einheiten
 * - Langsamer Verteidiger (Pace -17+) → bleibt auf der Mittellinie
 */
export function counterInsurance(
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

export function offensivePosition(
  player: PlayerData,
  state: GameState,
  team: TeamSide,
  plan: TeamPlan | null,
  fieldReading: FieldReading | null,
): { target: Position; reason: string } {
  const fwd = team === 1 ? -1 : 1
  const role = getRoleGroup(player)
  const cfg = ATK_BEHAVIOR[plan?.strategy.attack ?? 'possession'][role]

  // Basis: Formationsposition als Orientierung.
  //
  // 2026-04-22: Pull-Werte getrennt für X und Y.
  //  - X stark (0.60): Flügelspieler sollen klar auf ihrer Seite stehen —
  //    sonst bleibt die Verteidigung eng stellbar (User-Befund).
  //  - Y schwach (0.20): Progression Richtung Tor darf nicht gebremst werden.
  // Stürmer bekommen zusätzlich ATTACKER_PUSH nach vorn — 10 → 20, weil ST
  // sich im Replay zu lange im Mittelfeld aufhielt.
  const formHome = getFormationHome(player)
  const FORMATION_PULL_X = 0.60
  const FORMATION_PULL_Y = 0.20
  const ATTACKER_PUSH = 20
  const anchorX = player.origin.x + (formHome.x - player.origin.x) * FORMATION_PULL_X
  const baseAnchorY = player.origin.y + (formHome.y - player.origin.y) * FORMATION_PULL_Y
  const anchorY = role === 'attacker' ? baseAnchorY + fwd * ATTACKER_PUSH : baseAnchorY
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
  //
  // Offensivspieler (ST, LM, RM, OM) brauchen AGGRESSIVES Freilaufen, damit
  // sie anspielbar bleiben. Arena-Befund (User, Replay-Sichtung): Offensive
  // pickt keine Räume. Attacker bekommen größeren Suchradius + stärkeren Push
  // und einen zusätzlichen Vorwärts-Bias im Push-Vektor.
  const isOffPlayer = role === 'attacker' || ['LM', 'RM', 'OM'].includes(player.positionLabel)
  const opponents = state.players.filter(p => p.team !== team && p.positionLabel !== 'TW')
  let nearOppDist = Infinity
  let nearOppX = 0, nearOppY = 0
  for (const opp of opponents) {
    const d = distance({ x, y }, opp.position)
    if (d < nearOppDist) { nearOppDist = d; nearOppX = opp.position.x; nearOppY = opp.position.y }
  }
  const evasionRadius = isOffPlayer ? 24 : 18
  const evasionStrength = isOffPlayer ? 0.60 : 0.35
  const forwardBias = isOffPlayer ? 4 : 2  // stärkerer Drang nach vorn beim Ausweichen
  if (nearOppDist < evasionRadius) {
    const push = (evasionRadius - nearOppDist) * evasionStrength
    const dx = x - nearOppX
    const dy = (y - nearOppY) + fwd * forwardBias
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
