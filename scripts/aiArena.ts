/**
 * Arena CLI — KI-vs-KI-Matches zwischen Bundesliga-Teams.
 *
 * Nutzung:
 *   tsx scripts/aiArena.ts                # Default: 1 Match Dortmund (id=1) vs. München (id=0)
 *   tsx scripts/aiArena.ts --home 1 --away 0 --runs 10
 *   tsx scripts/aiArena.ts --roundrobin   # Alle 18 Teams × 2 = 306 Matches
 *
 * Phase 1 — einfache Fassung:
 *   - Single-Match oder Round-Robin
 *   - Aggregierte Stats in die Konsole
 *   - Noch kein Replay-Dump, noch keine JSON-Ausgabe (kommt in Phase 1c)
 */

import { TEAMS, getTeamById } from '../src/data/teams'
import { runAIMatch } from '../src/engine/simulation/runAIMatch'
import type { ArenaMatchResult } from '../src/engine/simulation/replayTypes'

function arg(flag: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : fallback
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag)
}

async function main() {
  if (hasFlag('--roundrobin')) {
    await runRoundRobin()
    return
  }

  const homeId = Number(arg('--home', '1'))
  const awayId = Number(arg('--away', '0'))
  const runs   = Number(arg('--runs', '1'))

  const home = getTeamById(homeId)
  const away = getTeamById(awayId)
  if (!home || !away) {
    console.error(`Team-ID nicht gefunden. Verfügbar: ${TEAMS.map(t => `${t.id}=${t.shortName}`).join(', ')}`)
    process.exit(1)
  }

  console.log(`🏟  Arena — ${home.name} vs. ${away.name} × ${runs}\n`)

  const results: ArenaMatchResult[] = []
  for (let i = 0; i < runs; i++) {
    const r = runAIMatch(homeId, awayId)
    results.push(r)
    console.log(`Match ${i + 1}/${runs}: ${home.shortName} ${r.score.team1}–${r.score.team2} ${away.shortName}  (${r.simDurationMs} ms)`)
  }
  console.log()
  printAggregate(home.name, away.name, results)
}

async function runRoundRobin() {
  const teams = TEAMS
  const total = teams.length * (teams.length - 1)
  console.log(`🏟  Round-Robin — ${teams.length} Teams, ${total} Matches (Hin- + Rückspiele)\n`)

  const results: ArenaMatchResult[] = []
  const t0 = Date.now()
  let i = 0
  for (const home of teams) {
    for (const away of teams) {
      if (home.id === away.id) continue
      i++
      const r = runAIMatch(home.id, away.id)
      results.push(r)
      if (i % 10 === 0 || i === total) {
        console.log(`  ${i}/${total} — ${Math.round((Date.now() - t0) / 1000)}s — letzte: ${home.shortName} ${r.score.team1}–${r.score.team2} ${away.shortName}`)
      }
    }
  }
  console.log()

  // Pro Team: Punkte, Tore+, Tore-
  interface Row {
    teamId: number; name: string; played: number
    won: number; drew: number; lost: number
    goalsFor: number; goalsAgainst: number; points: number
  }
  const table = new Map<number, Row>()
  for (const t of teams) {
    table.set(t.id, { teamId: t.id, name: t.shortName, played: 0, won: 0, drew: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 })
  }
  for (const r of results) {
    const h = table.get(r.homeId)!
    const a = table.get(r.awayId)!
    h.played++; a.played++
    h.goalsFor += r.score.team1; h.goalsAgainst += r.score.team2
    a.goalsFor += r.score.team2; a.goalsAgainst += r.score.team1
    if (r.winner === 1) { h.won++; h.points += 3; a.lost++ }
    else if (r.winner === 2) { a.won++; a.points += 3; h.lost++ }
    else { h.drew++; a.drew++; h.points++; a.points++ }
  }

  const sorted = [...table.values()].sort((a, b) =>
    b.points - a.points ||
    (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) ||
    b.goalsFor - a.goalsFor,
  )

  console.log('Tabelle:')
  console.log('  #  Team              Sp  S  U  N   T:T     ±   Pkt')
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i]
    const diff = r.goalsFor - r.goalsAgainst
    const diffStr = (diff >= 0 ? '+' : '') + diff
    console.log(`  ${String(i + 1).padStart(2)}  ${r.name.padEnd(16)}  ${String(r.played).padStart(2)}  ${String(r.won).padStart(1)}  ${String(r.drew).padStart(1)}  ${String(r.lost).padStart(1)}   ${String(r.goalsFor).padStart(2)}:${String(r.goalsAgainst).padStart(2)}  ${diffStr.padStart(4)}   ${String(r.points).padStart(3)}`)
  }

  const totalSimMs = Date.now() - t0
  console.log(`\n⏱  Gesamt-Simulationszeit: ${(totalSimMs / 1000).toFixed(1)}s`)
  const avgGoals = results.reduce((s, r) => s + r.score.team1 + r.score.team2, 0) / results.length
  console.log(`⚽ Ø Tore/Match: ${avgGoals.toFixed(2)}`)
}

function printAggregate(homeName: string, awayName: string, results: ArenaMatchResult[]) {
  const n = results.length
  const agg = {
    home: { wins: 0, goals: 0, xG: 0, shots: 0, poss: 0, passAcc: 0 },
    away: { wins: 0, goals: 0, xG: 0, shots: 0, poss: 0, passAcc: 0 },
    draws: 0,
  }
  for (const r of results) {
    if (r.winner === 1) agg.home.wins++
    else if (r.winner === 2) agg.away.wins++
    else agg.draws++

    agg.home.goals += r.score.team1
    agg.away.goals += r.score.team2
    agg.home.xG += r.stats.team1.xG
    agg.away.xG += r.stats.team2.xG
    agg.home.shots += r.stats.team1.shotsOnTarget + r.stats.team1.shotsOff
    agg.away.shots += r.stats.team2.shotsOnTarget + r.stats.team2.shotsOff
    agg.home.poss += r.stats.team1.possessionPercent
    agg.away.poss += r.stats.team2.possessionPercent
    agg.home.passAcc += r.stats.team1.passAccuracy
    agg.away.passAcc += r.stats.team2.passAccuracy
  }
  const avg = (x: number) => (x / n).toFixed(2)
  const pct = (x: number) => (x / n).toFixed(1) + '%'

  const boxHome = results.reduce((s, r) => s + r.stats.team1.boxPresencePercent, 0) / n
  const boxAway = results.reduce((s, r) => s + r.stats.team2.boxPresencePercent, 0) / n

  console.log(`Aggregate (${n} Matches):`)
  console.log(`                       ${homeName.padEnd(16)}  ${awayName.padEnd(16)}`)
  console.log(`  Siege               ${String(agg.home.wins).padStart(16)}  ${String(agg.away.wins).padStart(16)}`)
  console.log(`  Unentschieden       ${String(agg.draws).padStart(16)}  ${''.padStart(16)}`)
  console.log(`  Ø Tore              ${avg(agg.home.goals).padStart(16)}  ${avg(agg.away.goals).padStart(16)}`)
  console.log(`  Ø xG                ${avg(agg.home.xG).padStart(16)}  ${avg(agg.away.xG).padStart(16)}`)
  console.log(`  Ø Schüsse           ${avg(agg.home.shots).padStart(16)}  ${avg(agg.away.shots).padStart(16)}`)
  console.log(`  Ø Ballbesitz        ${pct(agg.home.poss).padStart(16)}  ${pct(agg.away.poss).padStart(16)}`)
  console.log(`  Ø Box-Präsenz       ${pct(boxHome).padStart(16)}  ${pct(boxAway).padStart(16)}`)
  console.log(`  Ø Passquote         ${pct(agg.home.passAcc).padStart(16)}  ${pct(agg.away.passAcc).padStart(16)}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
