/**
 * Diagnose: was passiert NACH jedem Corner-Event?
 *
 * Verfolgt die Event-Kette über die nächsten 5 Turns und zählt welche
 * Ereignis-Typen auftreten. So sehen wir, wo die Pipeline "zerbricht":
 * - Wird der Corner-Pass erfolgreich gespielt?
 * - Kommt ein Schuss zustande?
 * - Oder wird der Ball vom TW geraubt / abgefangen / neu ins Aus gefaustet?
 */

import { TEAMS } from '../src/data/teams'
import { runAIMatch } from '../src/engine/simulation/runAIMatch'
import type { GameEvent, TeamSide } from '../src/engine/types'

const WINDOW_TURNS = 5

interface EventCounts {
  corners: number
  // Erstes Folge-Event nach dem Corner (Taker-Aktion)
  firstEvent: Record<string, number>
  // Alle Events innerhalb des Fensters
  windowEvents: Record<string, number>
  // Wie viele Corners produzieren einen Schuss im Fenster?
  cornersWithShot: number
  cornersWithGoal: number
  cornersLeadingToNewCorner: number
  cornersEndingInIntercept: number
  cornersEndingInPassLost: number
  cornersEndingInTackle: number
  cornersEndingInOffside: number
}

const counts: EventCounts = {
  corners: 0,
  firstEvent: {},
  windowEvents: {},
  cornersWithShot: 0,
  cornersWithGoal: 0,
  cornersLeadingToNewCorner: 0,
  cornersEndingInIntercept: 0,
  cornersEndingInPassLost: 0,
  cornersEndingInTackle: 0,
  cornersEndingInOffside: 0,
}

const teams = TEAMS
let matchCount = 0
const t0 = Date.now()

console.log(`🔍  Corner-Flow-Diagnose — ${teams.length * (teams.length - 1)} Matches\n`)

for (const home of teams) {
  for (const away of teams) {
    if (home.id === away.id) continue
    matchCount++
    const r = runAIMatch(home.id, away.id, { record: true })
    const snaps = r.replay?.snapshots ?? []

    // Corner-Events suchen
    for (let i = 0; i < snaps.length; i++) {
      const ev: GameEvent | undefined = snaps[i].state.lastEvent ?? undefined
      if (ev?.type !== 'corner') continue

      counts.corners++
      const cornerTeam: TeamSide = snaps[i].state.players.find(p => p.id === ev.playerId)?.team === 1 ? 2 : 1
      const windowEnd = Math.min(snaps.length, i + WINDOW_TURNS + 1)
      let firstFound = false
      let sawShot = false
      let sawGoal = false
      let sawNewCorner = false
      let sawIntercept = false
      let sawPassLost = false
      let sawTackle = false
      let sawOffside = false

      for (let j = i + 1; j < windowEnd; j++) {
        const ev2 = snaps[j].state.lastEvent
        if (!ev2) continue
        const type = ev2.type

        // Falls ein neuer Corner für das gleiche Team kommt, window bis dahin zählen
        if (!firstFound && type !== 'corner') {
          counts.firstEvent[type] = (counts.firstEvent[type] ?? 0) + 1
          firstFound = true
        }
        counts.windowEvents[type] = (counts.windowEvents[type] ?? 0) + 1

        // Nur für das ECKEN-TEAM zählen (sie wollen das Tor)
        const actorTeam = snaps[j].state.players.find(p => p.id === ev2.playerId)?.team
        if (actorTeam === cornerTeam) {
          if (type === 'shot_scored' || type === 'penalty_scored') { sawShot = true; sawGoal = true }
          if (type === 'shot_saved' || type === 'shot_missed') sawShot = true
        }
        // Neue Ecke im gleichen Angriff (vom ehemaligen Gegner rausgespielt)
        if (type === 'corner' && j > i) {
          const newCornerFor = snaps[j].state.players.find(p => p.id === ev2.playerId)?.team === 1 ? 2 : 1
          if (newCornerFor === cornerTeam) sawNewCorner = true
          break  // Window endet beim Folge-Event
        }
        if (type === 'pass_intercepted' && actorTeam === cornerTeam) sawIntercept = true
        if (type === 'pass_lost' && actorTeam === cornerTeam) sawPassLost = true
        if (type === 'tackle_lost') {
          const loserTeam = snaps[j].state.players.find(p => p.id === ev2.playerId)?.team
          if (loserTeam === cornerTeam) sawTackle = true
        }
        if (type === 'offside' && actorTeam === cornerTeam) sawOffside = true
      }

      if (sawShot) counts.cornersWithShot++
      if (sawGoal) counts.cornersWithGoal++
      if (sawNewCorner) counts.cornersLeadingToNewCorner++
      if (sawIntercept) counts.cornersEndingInIntercept++
      if (sawPassLost) counts.cornersEndingInPassLost++
      if (sawTackle) counts.cornersEndingInTackle++
      if (sawOffside) counts.cornersEndingInOffside++
    }

    if (matchCount % 30 === 0) {
      console.log(`  ${matchCount}/${teams.length * (teams.length - 1)} — ${Math.round((Date.now() - t0) / 1000)}s`)
    }
  }
}

console.log('\n══════ CORNER-FLOW-DIAGNOSE ══════\n')
console.log(`Corners gesamt: ${counts.corners}\n`)

console.log(`ERGEBNIS pro Corner:`)
const pct = (n: number) => ((n / counts.corners) * 100).toFixed(1)
console.log(`  Schuss folgt:              ${counts.cornersWithShot.toString().padStart(4)}  (${pct(counts.cornersWithShot)}%)`)
console.log(`  Tor:                       ${counts.cornersWithGoal.toString().padStart(4)}  (${pct(counts.cornersWithGoal)}%)`)
console.log(`  Neue Ecke (TW faustet):    ${counts.cornersLeadingToNewCorner.toString().padStart(4)}  (${pct(counts.cornersLeadingToNewCorner)}%)`)
console.log(`  Ball abgefangen:           ${counts.cornersEndingInIntercept.toString().padStart(4)}  (${pct(counts.cornersEndingInIntercept)}%)`)
console.log(`  Pass verloren:             ${counts.cornersEndingInPassLost.toString().padStart(4)}  (${pct(counts.cornersEndingInPassLost)}%)`)
console.log(`  Tackle verloren:           ${counts.cornersEndingInTackle.toString().padStart(4)}  (${pct(counts.cornersEndingInTackle)}%)`)
console.log(`  Abseits:                   ${counts.cornersEndingInOffside.toString().padStart(4)}  (${pct(counts.cornersEndingInOffside)}%)`)
console.log()

console.log(`ERSTES FOLGE-EVENT nach Corner (Taker-Aktion):`)
const sortedFirst = Object.entries(counts.firstEvent).sort(([, a], [, b]) => b - a)
for (const [type, n] of sortedFirst) {
  console.log(`  ${type.padEnd(20)} ${n.toString().padStart(4)}  (${((n / counts.corners) * 100).toFixed(1)}%)`)
}
