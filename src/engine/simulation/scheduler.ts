// Round-Robin-Scheduler (Berger/Circle-Methode) für Doppelrunden-Ligen.
// Erzeugt Hin- und Rückrunde; Heim-/Auswärts-Balance über Tausch der Paarungsseiten.

export interface Fixture {
  id: string           // stabil, z.B. "md01-0v1"
  matchday: number     // 1-basiert
  homeId: number
  awayId: number
}

/**
 * Erzeugt einen kompletten Hin-/Rückrunden-Spielplan.
 * - Bei ungerader Team-Zahl wird ein Dummy (`-1`) eingefügt; Spiele gegen ihn werden herausgefiltert.
 *   Phase A betrifft das nicht (18 bzw. 20 Teams — beide gerade).
 * - Heim-/Auswärts-Balance: jedes Paar spielt einmal zu Hause, einmal auswärts.
 * - Hinrunde: Runden 1..(n-1). Rückrunde: selbe Paarungen mit getauschten Seiten, Runden n..2(n-1).
 */
export function createRoundRobin(teamIds: number[]): Fixture[] {
  const n = teamIds.length
  if (n < 2) return []

  const teams = [...teamIds]
  if (teams.length % 2 === 1) teams.push(-1) // Dummy für Freilos
  const size = teams.length
  const roundsPerHalf = size - 1
  const half = size / 2

  const fixtures: Fixture[] = []

  // Circle method: Team 0 ist fix, alle anderen rotieren.
  const rotation = teams.slice()

  for (let round = 0; round < roundsPerHalf; round++) {
    for (let i = 0; i < half; i++) {
      const a = rotation[i]
      const b = rotation[size - 1 - i]
      if (a === -1 || b === -1) continue
      // Heim-/Auswärts-Balance: in geraden Runden der erste zu Hause, in ungeraden umgekehrt
      // Kombiniert mit i=0-Seitenwechsel sorgt das für faire Verteilung.
      const flip = (round + i) % 2 === 0
      const home = flip ? a : b
      const away = flip ? b : a
      const matchday = round + 1
      fixtures.push({
        id: fixtureId(matchday, home, away),
        matchday,
        homeId: home,
        awayId: away,
      })
    }
    // Rotation: Team 0 fix, Rest im Uhrzeigersinn
    const last = rotation.pop()!
    rotation.splice(1, 0, last)
  }

  // Rückrunde: selbe Paarungen, Heim/Auswärts getauscht
  const firstHalf = fixtures.slice()
  for (const fx of firstHalf) {
    const matchday = fx.matchday + roundsPerHalf
    fixtures.push({
      id: fixtureId(matchday, fx.awayId, fx.homeId),
      matchday,
      homeId: fx.awayId,
      awayId: fx.homeId,
    })
  }

  return fixtures
}

function fixtureId(matchday: number, home: number, away: number): string {
  return `md${String(matchday).padStart(2, '0')}-${home}v${away}`
}
