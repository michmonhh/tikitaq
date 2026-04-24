/**
 * Gezielter Test Bochum (id=13) vs München (id=0).
 * Je 100 Matches in beiden Richtungen.
 */

import { runAIMatch } from '../src/engine/simulation/runAIMatch'
import { getTeamById } from '../src/data/teams'

const MUC = getTeamById(0)!
const BOC = getTeamById(13)!
const RUNS = 100

interface Bucket {
  matches: number
  goalsFor: number
  goalsAgainst: number
  wins: number
  draws: number
  losses: number
  openPlayGoals: number
  penaltyGoals: number
  throughBallGoals: number
  shortPassGoals: number
  longBallGoals: number
  crossGoals: number
  soloGoals: number
}

function emptyBucket(): Bucket {
  return {
    matches: 0, goalsFor: 0, goalsAgainst: 0, wins: 0, draws: 0, losses: 0,
    openPlayGoals: 0, penaltyGoals: 0,
    throughBallGoals: 0, shortPassGoals: 0, longBallGoals: 0, crossGoals: 0, soloGoals: 0,
  }
}

function runSeries(homeId: number, awayId: number, homeBucket: Bucket, awayBucket: Bucket) {
  for (let i = 0; i < RUNS; i++) {
    const r = runAIMatch(homeId, awayId)
    homeBucket.matches++
    awayBucket.matches++
    homeBucket.goalsFor += r.score.team1
    homeBucket.goalsAgainst += r.score.team2
    awayBucket.goalsFor += r.score.team2
    awayBucket.goalsAgainst += r.score.team1
    if (r.winner === 1) { homeBucket.wins++; awayBucket.losses++ }
    else if (r.winner === 2) { awayBucket.wins++; homeBucket.losses++ }
    else { homeBucket.draws++; awayBucket.draws++ }

    for (const scorer of r.scorers) {
      const bucket = scorer.team === 1 ? homeBucket : awayBucket
      if (scorer.kind === 'penalty') bucket.penaltyGoals++
      else if (scorer.kind === 'open_play') {
        bucket.openPlayGoals++
        const kind = scorer.assistKind
        if (kind === 'through_ball') bucket.throughBallGoals++
        else if (kind === 'short_pass') bucket.shortPassGoals++
        else if (kind === 'long_ball') bucket.longBallGoals++
        else if (kind === 'cross') bucket.crossGoals++
        else bucket.soloGoals++
      }
    }
  }
}

function printBucket(label: string, b: Bucket) {
  const goalsPerMatch = (b.goalsFor / b.matches).toFixed(2)
  const winPct = ((b.wins / b.matches) * 100).toFixed(0)
  const drawPct = ((b.draws / b.matches) * 100).toFixed(0)
  const lossPct = ((b.losses / b.matches) * 100).toFixed(0)
  const totalGoals = b.goalsFor
  const pct = (n: number) => totalGoals === 0 ? '0' : ((n / totalGoals) * 100).toFixed(1)
  console.log(`\n${label} (${b.matches} Matches):`)
  console.log(`  Bilanz: ${b.wins}W / ${b.draws}D / ${b.losses}L   (${winPct}/${drawPct}/${lossPct}%)`)
  console.log(`  Tore: ${b.goalsFor} für, ${b.goalsAgainst} gegen (${goalsPerMatch}/Match für)`)
  console.log(`  Tor-Typen:`)
  console.log(`    Elfmeter:         ${b.penaltyGoals.toString().padStart(3)}  (${pct(b.penaltyGoals)}%)`)
  console.log(`    Steilpass:        ${b.throughBallGoals.toString().padStart(3)}  (${pct(b.throughBallGoals)}%)`)
  console.log(`    Kurzpass:         ${b.shortPassGoals.toString().padStart(3)}  (${pct(b.shortPassGoals)}%)`)
  console.log(`    Langer Ball:      ${b.longBallGoals.toString().padStart(3)}  (${pct(b.longBallGoals)}%)`)
  console.log(`    Flanke:           ${b.crossGoals.toString().padStart(3)}  (${pct(b.crossGoals)}%)`)
  console.log(`    Alleingang:       ${b.soloGoals.toString().padStart(3)}  (${pct(b.soloGoals)}%)`)
}

console.log(`🔬  Testserie: ${BOC.name} vs ${MUC.name}   —   ${RUNS} Matches pro Richtung\n`)

// MUC zuhause
const mucHome = emptyBucket()
const bocAway = emptyBucket()
console.log(`Serie 1: ${MUC.name} zuhause...`)
runSeries(MUC.id, BOC.id, mucHome, bocAway)
printBucket(`${MUC.name} (Heim)`, mucHome)
printBucket(`${BOC.name} (Auswärts)`, bocAway)

// BOC zuhause
const bocHome = emptyBucket()
const mucAway = emptyBucket()
console.log(`\n\nSerie 2: ${BOC.name} zuhause...`)
runSeries(BOC.id, MUC.id, bocHome, mucAway)
printBucket(`${BOC.name} (Heim)`, bocHome)
printBucket(`${MUC.name} (Auswärts)`, mucAway)

// Gesamt
const mucTotal = emptyBucket()
const bocTotal = emptyBucket()
for (const [total, h, a] of [[mucTotal, mucHome, mucAway], [bocTotal, bocHome, bocAway]] as const) {
  total.matches = h.matches + a.matches
  total.goalsFor = h.goalsFor + a.goalsFor
  total.goalsAgainst = h.goalsAgainst + a.goalsAgainst
  total.wins = h.wins + a.wins
  total.draws = h.draws + a.draws
  total.losses = h.losses + a.losses
  total.openPlayGoals = h.openPlayGoals + a.openPlayGoals
  total.penaltyGoals = h.penaltyGoals + a.penaltyGoals
  total.throughBallGoals = h.throughBallGoals + a.throughBallGoals
  total.shortPassGoals = h.shortPassGoals + a.shortPassGoals
  total.longBallGoals = h.longBallGoals + a.longBallGoals
  total.crossGoals = h.crossGoals + a.crossGoals
  total.soloGoals = h.soloGoals + a.soloGoals
}

console.log('\n\n══════ GESAMTBILANZ (200 Matches) ══════')
printBucket(`${MUC.name} (Gesamt)`, mucTotal)
printBucket(`${BOC.name} (Gesamt)`, bocTotal)

// Reality-Check
console.log('\n\n══════ REALITY-CHECK ══════')
const mucAvgGoals = mucTotal.goalsFor / mucTotal.matches
const bocAvgGoals = bocTotal.goalsFor / bocTotal.matches
const mucWinRate = (mucTotal.wins / mucTotal.matches * 100).toFixed(0)
const bocWinRate = (bocTotal.wins / bocTotal.matches * 100).toFixed(0)
console.log(`Bayern-Win-Rate vs Bochum: ${mucWinRate}% (real: ~85-90%)`)
console.log(`Bochum-Win-Rate vs Bayern: ${bocWinRate}% (real: ~3-5%)`)
console.log(`Durchschnittstore: MUC ${mucAvgGoals.toFixed(2)} vs BOC ${bocAvgGoals.toFixed(2)}`)
console.log(`(Erwartung für Top-vs-Schlusslicht: ~3.0 : 0.5)`)
