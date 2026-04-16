/**
 * Modul-State für die Positionierung.
 *
 * Gegenpress ist zustandsbasiert (aktiviert bei Ballverlust, bis der Gegner
 * dem Druck entkommen ist). Manndeckung nutzt eine feste Zuordnung.
 * Beide überleben mehrere AI-Turns, daher modulweit gehalten.
 */

let gegenpressActive = false
let markingAssignments = new Map<string, string>()

export function isGegenpressActive(): boolean {
  return gegenpressActive
}

export function setGegenpressActive(active: boolean): void {
  gegenpressActive = active
}

export function getMarkingAssignments(): Map<string, string> {
  return markingAssignments
}

export function setMarkingAssignments(map: Map<string, string>): void {
  markingAssignments = map
}

export function resetPositioningState(): void {
  gegenpressActive = false
  markingAssignments = new Map()
}
