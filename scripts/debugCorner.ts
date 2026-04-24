/**
 * Debug-Script: nutzt runAIMatch mit record=true und durchsucht das Replay
 * nach Corner-Events. Zeigt für den ersten gefundenen Corner die umliegenden
 * Frames.
 */
import { runAIMatch } from '../src/engine/simulation/runAIMatch'

let found = false
for (let matchNum = 0; matchNum < 20 && !found; matchNum++) {
  const home = matchNum % 18
  const away = (matchNum + 7) % 18
  if (home === away) continue
  const result = await runAIMatch(home, away, { record: true })
  const snapshots = result.replay?.snapshots ?? []

  // Scan alle Snapshots für corner-Events oder corner-Phase
  const cornerFrames: number[] = []
  for (let i = 0; i < snapshots.length; i++) {
    const s = snapshots[i].state
    if (s.phase === 'corner' || s.lastEvent?.type === 'corner') {
      cornerFrames.push(i)
    }
  }
  if (cornerFrames.length === 0) continue

  console.log(`\n=== Match ${matchNum} (teams ${home} vs ${away}): ${cornerFrames.length} corner frames ===`)
  console.log(`corners in stats: home=${result.stats.team1.corners}, away=${result.stats.team2.corners}`)

  // Dump die ersten 12 Frames rund um den ersten corner
  const cornerFrame = cornerFrames[0]
  const from = Math.max(0, cornerFrame - 2)
  const to = Math.min(snapshots.length - 1, cornerFrame + 10)
  for (let i = from; i <= to; i++) {
    const snap = snapshots[i]
    const s = snap.state
    const carrier = s.players.find(p => p.id === s.ball.ownerId)
    const ev = s.lastEvent
    const evStr = ev ? `${ev.type}${ev.passKind ? `[${ev.passKind}]` : ''}` : '-'
    console.log(`  frame ${i} (min ${s.gameTime.toFixed(1)}) phase=${s.phase.padEnd(10)} turn=T${s.currentTurn} mustPass=${s.mustPass ? 'Y' : 'n'} lastSP=${s.lastSetPiece ?? '-'} carrier=${carrier?.positionLabel ?? '-'}${carrier?.lastName ?? ''} ev=${evStr}`)
  }
  found = true
}

if (!found) console.log('No corner event observed in any match.')
