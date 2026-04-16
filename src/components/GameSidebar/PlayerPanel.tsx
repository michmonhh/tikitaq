import { useGameStore } from '../../stores/gameStore'
import type { PlayerData } from '../../engine/types'
import styles from '../GameSidebar.module.css'
import { StatBar, MiniStat } from './widgets'

const STAT_KEYS = [
  { key: 'pacing' as const, label: 'PAC' },
  { key: 'finishing' as const, label: 'FIN' },
  { key: 'shortPassing' as const, label: 'SPA' },
  { key: 'highPassing' as const, label: 'HPA' },
  { key: 'tackling' as const, label: 'TAC' },
  { key: 'defensiveRadius' as const, label: 'DEF' },
  { key: 'ballShielding' as const, label: 'SHI' },
  { key: 'quality' as const, label: 'QUA' },
]

export function PlayerPanel({ player }: { player: PlayerData }) {
  const aiReasoning = useGameStore(s => s.aiReasoning)
  const reasoning = aiReasoning.get(player.id)

  return (
    <div className={styles.playerInfo}>
      <div className={styles.playerHeader}>
        <span className={styles.playerPosition}>{player.positionLabel}</span>
        <span className={styles.playerName}>{player.firstName} {player.lastName}</span>
      </div>
      {reasoning && (
        <div className={styles.aiReasoning}>
          <span className={styles.aiReasoningLabel}>KI-Entscheidung</span>
          <span className={styles.aiReasoningText}>{reasoning}</span>
        </div>
      )}
      <StatBar label="FIT" value={Math.round(player.fitness)} />
      <StatBar label="CONF" value={Math.round(player.confidence)} />
      <div className={styles.statsGrid}>
        {STAT_KEYS.map(s => (
          <StatBar key={s.key} label={s.label} value={player.stats[s.key]} />
        ))}
      </div>
      <div className={styles.matchStatsCompact}>
        <MiniStat label="Goals" value={player.gameStats.goalsScored} />
        <MiniStat label="Passes" value={player.gameStats.passes} />
        <MiniStat label="Tackles" value={player.gameStats.tacklesWon} />
        <MiniStat label="Saves" value={player.gameStats.saves} />
      </div>
    </div>
  )
}
