import type { TeamMatchStats } from '../../engine/types'
import styles from '../GameSidebar.module.css'
import { ComparisonRow, ComparisonBar } from './widgets'

// Real pitch: 105m x 68m. Game coords: 100x100. 1 game unit ≈ 1.05m (length) / 0.68m (width). Average ≈ 0.865m
const GAME_UNIT_TO_METERS = 0.865

export function StatsPanel({ stats1, stats2, team1Name, team2Name, team1Color, team2Color, turns1, turns2 }: {
  stats1: TeamMatchStats; stats2: TeamMatchStats
  team1Name: string; team2Name: string
  team1Color: string; team2Color: string
  turns1: number; turns2: number
}) {
  const totalTurns = turns1 + turns2
  const poss1 = totalTurns > 0 ? Math.round((stats1.possession / Math.max(1, totalTurns)) * 100) : 50
  const poss2 = 100 - poss1

  return (
    <div className={styles.statsPanel}>
      <div className={styles.statsPanelHeader}>
        <span style={{ color: team1Color }}>{team1Name}</span>
        <span style={{ color: team2Color }}>{team2Name}</span>
      </div>
      <ComparisonRow label="xG" v1={stats1.xG.toFixed(2)} v2={stats2.xG.toFixed(2)} />
      <ComparisonBar label="Possession" v1={poss1} v2={poss2} c1={team1Color} c2={team2Color} unit="%" />
      <ComparisonRow label="Shots (on)" v1={`${stats1.shotsOnTarget + stats1.shotsOff} (${stats1.shotsOnTarget})`} v2={`${stats2.shotsOnTarget + stats2.shotsOff} (${stats2.shotsOnTarget})`} />
      <ComparisonRow label="Passes" v1={`${stats1.passesCompleted}/${stats1.passesTotal}`} v2={`${stats2.passesCompleted}/${stats2.passesTotal}`} />
      <ComparisonRow label="Tackles won" v1={String(stats1.tacklesWon)} v2={String(stats2.tacklesWon)} />
      <ComparisonRow label="Distance" v1={`${Math.round(stats1.distanceCovered * GAME_UNIT_TO_METERS)}m`} v2={`${Math.round(stats2.distanceCovered * GAME_UNIT_TO_METERS)}m`} />
      <ComparisonRow label="Corners" v1={String(stats1.corners)} v2={String(stats2.corners)} />
      <ComparisonRow label="Fouls" v1={String(stats1.fouls)} v2={String(stats2.fouls)} />
      <ComparisonRow label="Yellow" v1={String(stats1.yellowCards)} v2={String(stats2.yellowCards)} />
      <ComparisonRow label="Red" v1={String(stats1.redCards)} v2={String(stats2.redCards)} />
    </div>
  )
}
