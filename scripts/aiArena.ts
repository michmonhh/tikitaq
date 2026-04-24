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

import * as fs from 'node:fs'
import * as zlib from 'node:zlib'
import { TEAMS, getTeamById } from '../src/data/teams'
import { runAIMatch } from '../src/engine/simulation/runAIMatch'
import type { ArenaMatchResult } from '../src/engine/simulation/replayTypes'
import {
  initTrainingExport, setTrainingMatchId, endTrainingMatch, drainTrainingBuffer,
} from '../src/engine/ai/training'

let trainingOutputPath: string | null = null
let trainingGzipStream: zlib.Gzip | null = null
let trainingFileStream: fs.WriteStream | null = null

function openTrainingOutput(path: string): void {
  trainingOutputPath = path
  // Endet der Pfad auf .gz oder .jsonl.gz → streamed gzip.
  // Kompressionsrate ~10-15× bei JSONL-Daten mit redundanten Keys.
  if (path.endsWith('.gz')) {
    trainingFileStream = fs.createWriteStream(path, { flags: 'w' })
    trainingGzipStream = zlib.createGzip({ level: 6 })  // balanced: ~10× compression, fast
    trainingGzipStream.pipe(trainingFileStream)
  } else {
    // Plain JSONL — alte Datei überschreiben
    fs.writeFileSync(path, '')
  }
}

function flushTrainingToFile(): void {
  if (!trainingOutputPath) return
  const lines = drainTrainingBuffer()
  if (lines.length === 0) return
  const payload = lines.join('\n') + '\n'
  if (trainingGzipStream) {
    trainingGzipStream.write(payload)
  } else {
    fs.appendFileSync(trainingOutputPath, payload)
  }
}

function closeTrainingOutput(): Promise<void> {
  return new Promise((resolve) => {
    if (trainingGzipStream && trainingFileStream) {
      trainingGzipStream.end(() => {
        trainingFileStream!.end(() => resolve())
      })
    } else {
      resolve()
    }
  })
}

function arg(flag: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : fallback
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag)
}

async function main() {
  // ML-Readiness: optional --export-training <file>
  // Wenn gesetzt, wird jedes Match State-Action-Paare als JSONL in die
  // Datei schreiben, die später ein Python-Trainer als Behavior-
  // Cloning-Dataset einlesen kann.
  const exportFile = arg('--export-training')
  if (exportFile) {
    openTrainingOutput(exportFile)
    initTrainingExport(exportFile)
    const gz = exportFile.endsWith('.gz') ? ' (gzip)' : ''
    console.log(`🤖  Training-Export aktiv → ${exportFile}${gz}\n`)
  }

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
    setTrainingMatchId(`${home.shortName}-${away.shortName}-${i + 1}`)
    const r = runAIMatch(homeId, awayId)
    endTrainingMatch()
    flushTrainingToFile()
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
      setTrainingMatchId(`${home.shortName}-${away.shortName}-${i}`)
      const r = runAIMatch(home.id, away.id)
      endTrainingMatch()
      flushTrainingToFile()
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

  printBundesligaComparison(results)
}

// ──────────────────────────────────────────────────────────────────
//  Bundesliga-Vergleich
// ──────────────────────────────────────────────────────────────────

interface AvgRow {
  label: string
  sim: number
  ref: number
  /** Einheit für die Anzeige (z.B. 'pro Match', '%', '/Team'). */
  unit: string
  /** Format: Anzahl Nachkommastellen. */
  digits?: number
}

function printBundesligaComparison(results: ArenaMatchResult[]) {
  const n = results.length
  if (n === 0) return

  // Match-Ergebnis-Verteilung
  let homeWins = 0, draws = 0, awayWins = 0
  let totalGoals = 0
  for (const r of results) {
    totalGoals += r.score.team1 + r.score.team2
    if (r.winner === 1) homeWins++
    else if (r.winner === 2) awayWins++
    else draws++
  }

  // Per-Team-Summen (2 Datenpunkte pro Match: home + away)
  const sum = {
    shotsTotal: 0, shotsOnTarget: 0, xG: 0,
    passesTotal: 0, passesCompleted: 0,
    possessionPct: 0, boxPresencePct: 0,
    tacklesWon: 0, tacklesLost: 0,
    fouls: 0, yellowCards: 0, redCards: 0,
    corners: 0,
    distanceCovered: 0,
  }
  for (const r of results) {
    for (const ts of [r.stats.team1, r.stats.team2]) {
      sum.shotsTotal += ts.shotsOnTarget + ts.shotsOff
      sum.shotsOnTarget += ts.shotsOnTarget
      sum.xG += ts.xG
      sum.passesTotal += ts.passesTotal
      sum.passesCompleted += ts.passesCompleted
      sum.possessionPct += ts.possessionPercent
      sum.boxPresencePct += ts.boxPresencePercent
      sum.tacklesWon += ts.tacklesWon
      sum.tacklesLost += ts.tacklesLost
      sum.fouls += ts.fouls
      sum.yellowCards += ts.yellowCards
      sum.redCards += ts.redCards
      sum.corners += ts.corners
      sum.distanceCovered += ts.distanceCovered
    }
  }

  const perTeam = (x: number) => x / (n * 2)  // pro Team pro Match
  const passAccuracy = sum.passesTotal > 0 ? (sum.passesCompleted / sum.passesTotal) * 100 : 0

  // Referenz: echte Bundesliga-Saison-Durchschnitte (grobe Werte aus
  // öffentlichen Statistiken, z.B. kicker / DFL / Opta der letzten Saisons)
  const rows: AvgRow[] = [
    { label: 'Tore pro Match',         sim: totalGoals / n,             ref: 3.00,  unit: '',       digits: 2 },
    { label: 'Heimsieg',               sim: (homeWins / n) * 100,       ref: 43,    unit: '%',      digits: 0 },
    { label: 'Unentschieden',          sim: (draws / n) * 100,          ref: 25,    unit: '%',      digits: 0 },
    { label: 'Auswärtssieg',           sim: (awayWins / n) * 100,       ref: 32,    unit: '%',      digits: 0 },
    { label: 'xG / Team',              sim: perTeam(sum.xG),            ref: 1.50,  unit: '',       digits: 2 },
    { label: 'Schüsse / Team',         sim: perTeam(sum.shotsTotal),    ref: 12.5,  unit: '',       digits: 1 },
    { label: 'Schüsse a. Tor / Team',  sim: perTeam(sum.shotsOnTarget), ref: 4.5,   unit: '',       digits: 1 },
    { label: 'Pässe / Team',           sim: perTeam(sum.passesTotal),   ref: 450,   unit: '',       digits: 0 },
    { label: 'Passquote',              sim: passAccuracy,               ref: 82,    unit: '%',      digits: 1 },
    { label: 'Ballbesitz / Team',      sim: perTeam(sum.possessionPct), ref: 50,    unit: '%',      digits: 1 },
    { label: 'Box-Präsenz / Team',     sim: perTeam(sum.boxPresencePct),ref: 25,    unit: '%',      digits: 1 },
    { label: 'Tacklings gewonnen',     sim: perTeam(sum.tacklesWon),    ref: 17,    unit: '/Team',  digits: 1 },
    { label: 'Fouls / Team',           sim: perTeam(sum.fouls),         ref: 12,    unit: '',       digits: 1 },
    { label: 'Gelbe Karten / Team',    sim: perTeam(sum.yellowCards),   ref: 1.8,   unit: '',       digits: 2 },
    { label: 'Rote Karten / Team',     sim: perTeam(sum.redCards),      ref: 0.05,  unit: '',       digits: 3 },
    { label: 'Eckbälle / Team',        sim: perTeam(sum.corners),       ref: 4.5,   unit: '',       digits: 1 },
  ]

  // Tor-Typen
  const goalKinds = { open_play: 0, penalty: 0, own_goal: 0 }
  const assistKinds = { short_pass: 0, long_ball: 0, through_ball: 0, cross: 0, solo: 0 }
  for (const r of results) {
    for (const g of r.scorers) {
      goalKinds[g.kind] = (goalKinds[g.kind] ?? 0) + 1
      // Assist-Klassifizierung nur für Open-Play-Tore sinnvoll
      if (g.kind === 'open_play') {
        if (g.assistKind) assistKinds[g.assistKind]++
        else assistKinds.solo++
      }
    }
  }
  const totalGoalsCounted = goalKinds.open_play + goalKinds.penalty + goalKinds.own_goal
  if (totalGoalsCounted > 0) {
    console.log()
    console.log('Tor-Typen:')
    const pct = (k: number) => `${((k / totalGoalsCounted) * 100).toFixed(1)}%`
    console.log(`  Aus dem Spiel:   ${String(goalKinds.open_play).padStart(4)}  (${pct(goalKinds.open_play)})`)
    console.log(`  Elfmeter:        ${String(goalKinds.penalty).padStart(4)}  (${pct(goalKinds.penalty)})`)
    console.log(`  Eigentor:        ${String(goalKinds.own_goal).padStart(4)}  (${pct(goalKinds.own_goal)})`)
    console.log(`  Bundesliga-Referenz: ~86 % aus dem Spiel, ~10 % Elfmeter, ~4 % Eigentor`)

    if (goalKinds.open_play > 0) {
      const openGoals = goalKinds.open_play
      const apct = (k: number) => `${((k / openGoals) * 100).toFixed(1)}%`
      console.log()
      console.log(`Entstehung der ${openGoals} Open-Play-Tore:`)
      console.log(`  Steilpass (through):  ${String(assistKinds.through_ball).padStart(4)}  (${apct(assistKinds.through_ball)})`)
      console.log(`  Kurzpass:             ${String(assistKinds.short_pass).padStart(4)}  (${apct(assistKinds.short_pass)})`)
      console.log(`  Langer Ball:          ${String(assistKinds.long_ball).padStart(4)}  (${apct(assistKinds.long_ball)})`)
      console.log(`  Flanke:               ${String(assistKinds.cross).padStart(4)}  (${apct(assistKinds.cross)})`)
      console.log(`  Alleingang / solo:    ${String(assistKinds.solo).padStart(4)}  (${apct(assistKinds.solo)})`)
    }
  }

  console.log()
  console.log('Vergleich mit realen Bundesliga-Durchschnitten:')
  console.log('                              Simuliert     Bundesliga    Δ')
  console.log('  ─────────────────────────────────────────────────────────────')
  for (const row of rows) {
    const d = row.digits ?? 1
    const sim = row.sim.toFixed(d) + row.unit
    const ref = row.ref.toFixed(d) + row.unit
    const delta = row.sim - row.ref
    const deltaPct = row.ref !== 0 ? (delta / row.ref) * 100 : 0
    const deltaStr = (delta >= 0 ? '+' : '') + delta.toFixed(d) + row.unit
    const pctStr = row.ref !== 0
      ? `  (${(deltaPct >= 0 ? '+' : '') + deltaPct.toFixed(0)}%)`
      : ''
    console.log(`  ${row.label.padEnd(26)}  ${sim.padStart(10)}    ${ref.padStart(10)}    ${deltaStr.padStart(8)}${pctStr}`)
  }
  console.log(`\n  (Referenz: DFL/Opta-Durchschnitte der letzten Bundesliga-Spielzeiten)`)
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

;(async () => {
  try {
    await main()
    await closeTrainingOutput()
  } catch (err) {
    console.error(err)
    await closeTrainingOutput()
    process.exit(1)
  }
})()
