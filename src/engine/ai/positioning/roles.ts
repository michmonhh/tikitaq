import type { PlayerData, Position } from '../../types'
import type { RoleGroup } from './config'

/**
 * Berechnet die Formationsheimposition eines Spielers.
 *
 * Vor dem Multi-Formations-Refactor: Lookup in FORMATION_433 per Index aus
 * der Player-ID. Jetzt: jeder Player trägt seinen Slot direkt
 * (`formationSlot`), gesetzt beim Erstellen mit der jeweiligen Team-
 * Formation. Damit kann jedes Team eine andere Formation spielen, ohne
 * dass diese Funktion wissen muss welche.
 *
 * Konvention: `formationSlot.x/y` liegt in Team-1-Koordinaten. Für Team 2
 * wird hier gespiegelt.
 */
export function getFormationHome(player: PlayerData): Position {
  const slot = player.formationSlot
  if (!slot) return player.origin

  const cf = Math.max(0.15, Math.min(0.95, player.confidence / 100))
  const xOff = slot.x < 50 ? -slot.xSpread * cf
             : slot.x > 50 ?  slot.xSpread * cf : 0
  const baseX = Math.max(3, Math.min(97, slot.x + xOff))

  // Y-Floor pro Rolle: Stürmer dürfen ihre Heimat in der gegnerischen Hälfte
  // haben (y < 50 für Team 1), Mittelfeld maximal Mittellinie, Abwehr bleibt
  // in eigener Hälfte.
  const role = getRoleGroup(player)
  const yFloor = role === 'attacker' ? 28 : 50
  const baseY = Math.max(yFloor, slot.y - slot.push * cf)

  if (player.team === 2) {
    return { x: 100 - baseX, y: 100 - baseY }
  }
  return { x: baseX, y: baseY }
}

/** Rolle aus Positionslabel — stabil, driftet nicht mit origin.
 *
 *  Position-Labels:
 *    - TW: Torwart (separat behandelt)
 *    - LV/IV/RV: Verteidiger (Außen-/Innen-/Außen-Verteidiger)
 *    - ZDM: Defensiver Mittelfeldspieler
 *    - ZM: Zentraler Mittelfeldspieler (Box-to-Box)
 *    - LM/RM: Linker/Rechter Mittelfeldspieler (Flügel)
 *    - OM: Offensiver Mittelfeldspieler
 *    - ST: Stürmer
 */
export function getRoleGroup(player: PlayerData): RoleGroup {
  const label = player.positionLabel
  if (['IV', 'LV', 'RV'].includes(label)) return 'defender'
  if (['ZDM', 'ZM', 'LM', 'RM'].includes(label)) return 'midfielder'
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
export function getHomeSide(player: PlayerData): 'left' | 'right' | null {
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
export function isOnLeftSide(player: PlayerData): boolean {
  const side = getHomeSide(player)
  return side === 'left'
}
