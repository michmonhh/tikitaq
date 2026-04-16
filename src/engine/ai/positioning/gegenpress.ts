import type { GameState, PlayerData, TeamSide } from '../../types'
import type { TeamPlan } from '../types'
import { distance } from '../../geometry'
import { isGegenpressActive, setGegenpressActive } from './state'
import { getRoleGroup } from './roles'
import { PRESS_CONFIG, GEGENPRESS_CONFIG } from './config'

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
    setGegenpressActive(true)
    return
  }

  if (!isGegenpressActive()) return

  // Prüfen: ist der Ballführer noch unter Druck?
  const carrier = state.players.find(p => p.id === state.ball.ownerId)
  if (!carrier || carrier.team === team) {
    setGegenpressActive(false)
    return
  }

  const ourPlayers = state.players.filter(p => p.team === team && p.positionLabel !== 'TW')
  let pressCount = 0
  for (const p of ourPlayers) {
    if (distance(p.position, carrier.position) < 15) pressCount++
  }

  // Gegner entkommen → Gegenpress beenden
  if (pressCount < 2) setGegenpressActive(false)
}

/** Ist dieser Spieler der nächste Presser am Ball/Ballführer? */
export function isFirstPresser(player: PlayerData, state: GameState, pressers: Set<string>): boolean {
  const ballTarget = state.ball.position
  const myDist = distance(player.position, ballTarget)
  for (const pid of pressers) {
    if (pid === player.id) continue
    const other = state.players.find(p => p.id === pid)
    if (other && distance(other.position, ballTarget) < myDist) return false
  }
  return true
}

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
  const config = isGegenpressActive()
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
