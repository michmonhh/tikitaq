/**
 * Analyse: wie viele Tore entstehen in Folge einer Ecke?
 *
 * Definition "in Folge einer Ecke": Das scorende Team hat innerhalb der
 * letzten N Turns ein corner-Event auf seiner Seite gehabt, ohne dass
 * zwischendurch Ballbesitz verloren ging.
 *
 * Fenster: 5 Turns (= 2.5 simulierte Minuten). Nach 5 Turns gilt ein
 * Angriff als abgeschlossen — was später kommt, ist Neuangriff.
 */

import { TEAMS } from '../src/data/teams'
import { runAIMatch } from '../src/engine/simulation/runAIMatch'
import type { GameEvent, TeamSide } from '../src/engine/types'

const CORNER_WINDOW_TURNS = 5

interface CornerStats {
  totalGoals: number
  goalsFromCorner: number
  totalCorners: number
  cornersThatLedToGoal: number
}

const stats: CornerStats = {
  totalGoals: 0,
  goalsFromCorner: 0,
  totalCorners: 0,
  cornersThatLedToGoal: 0,
}

const teams = TEAMS
const total = teams.length * (teams.length - 1)
let i = 0
const t0 = Date.now()

console.log(`🔍  Round-Robin mit Corner-Tracking — ${total} Matches\n`)

for (const home of teams) {
  for (const away of teams) {
    if (home.id === away.id) continue
    i++

    // Match mit Replay aufnehmen
    const r = await runAIMatch(home.id, away.id, { record: true })
    const snaps = r.replay?.snapshots ?? []
    if (snaps.length === 0) continue

    // Events durchgehen: corner-Events und Tor-Events mit Turn-Index korrelieren.
    // lastCornerTurnByTeam[team] = Turn-Index des letzten corner-Events DIESES Teams
    const lastCornerTurnByTeam = new Map<TeamSide, number>()

    // Zusätzlich: hatte diese Ecke später zu einem Tor geführt?
    // Wir tracken "active corner" mit Ablaufdatum.
    const activeCornerExpiry = new Map<TeamSide, { turn: number; converted: boolean }>()

    for (const snap of snaps) {
      const turnIdx = snap.turn
      const ev: GameEvent | undefined = snap.state.lastEvent ?? undefined
      if (!ev) continue

      // Aktive Ecken ablaufen lassen
      for (const [team, entry] of activeCornerExpiry) {
        if (turnIdx - entry.turn > CORNER_WINDOW_TURNS) {
          if (!entry.converted) {
            // Diese Ecke ist verfallen — nichts zu tun (totalCorners wurde schon gezählt)
          }
          activeCornerExpiry.delete(team)
        }
      }

      // corner-Event? → wer bekommt die Ecke?
      // Der Event-Ursprung ist der Spieler, DESSEN Pass ins Aus ging.
      // Das verteidigende Team geht in die Ecke, das OTHER Team.
      if (ev.type === 'corner') {
        // Der corner-Event wird vom Pass-Ursprung ausgelöst. Die Ecke bekommt
        // das GEGNERISCHE Team.
        const passerTeam = snap.state.players.find(p => p.id === ev.playerId)?.team
        if (passerTeam) {
          const cornerTeam: TeamSide = passerTeam === 1 ? 2 : 1
          lastCornerTurnByTeam.set(cornerTeam, turnIdx)
          activeCornerExpiry.set(cornerTeam, { turn: turnIdx, converted: false })
          stats.totalCorners++
        }
      }

      // Tor? → war die letzte Ecke dieses Teams innerhalb des Fensters?
      if (ev.type === 'shot_scored') {
        const scorerTeam = snap.state.players.find(p => p.id === ev.playerId)?.team
        if (scorerTeam) {
          stats.totalGoals++
          const lastCornerTurn = lastCornerTurnByTeam.get(scorerTeam)
          if (lastCornerTurn !== undefined && (turnIdx - lastCornerTurn) <= CORNER_WINDOW_TURNS) {
            stats.goalsFromCorner++
            const active = activeCornerExpiry.get(scorerTeam)
            if (active && !active.converted) {
              active.converted = true
              stats.cornersThatLedToGoal++
            }
          }
        }
      }
    }

    if (i % 20 === 0 || i === total) {
      console.log(`  ${i}/${total} — ${Math.round((Date.now() - t0) / 1000)}s — ${home.shortName} ${r.score.team1}–${r.score.team2} ${away.shortName}`)
    }
  }
}

console.log('\n══════ ERGEBNIS ══════')
console.log(`Tore gesamt (Open-Play, ohne Elfmeter): ${stats.totalGoals}`)
console.log(`  davon in Folge einer Ecke (≤${CORNER_WINDOW_TURNS} Turns):  ${stats.goalsFromCorner}`)
const goalPct = stats.totalGoals === 0 ? 0 : (stats.goalsFromCorner / stats.totalGoals * 100)
console.log(`  Anteil: ${goalPct.toFixed(1)} %`)
console.log()
console.log(`Ecken gesamt: ${stats.totalCorners}`)
console.log(`  davon zum Tor geführt: ${stats.cornersThatLedToGoal}`)
const convPct = stats.totalCorners === 0 ? 0 : (stats.cornersThatLedToGoal / stats.totalCorners * 100)
console.log(`  Conversion-Rate: ${convPct.toFixed(1)} %`)
console.log()
console.log(`Pro Match (${total} Matches):`)
console.log(`  Tore aus Ecke: ${(stats.goalsFromCorner / total).toFixed(2)}`)
console.log(`  Ecken:         ${(stats.totalCorners / total).toFixed(2)}`)
console.log()
console.log(`Bundesliga-Referenz: ~8-12% der Tore aus Ecken, ~4.5 Ecken/Team/Match`)
