import type { TickerEntry } from '../../engine/types'
import styles from '../GameSidebar.module.css'

/** Map event types to highlight CSS classes */
function getTickerHighlightClass(type: string): string {
  switch (type) {
    case 'shot_scored':
    case 'penalty_scored':
      return styles.tickerGoal
    case 'penalty':
    case 'penalty_saved':
    case 'penalty_missed':
      return styles.tickerPenalty
    case 'yellow_card':
      return styles.tickerYellow
    case 'red_card':
      return styles.tickerRed
    case 'tactic_change':
      return styles.tickerTactic
    case 'kickoff':
    case 'half_time':
      return styles.tickerKickoff
    default:
      return ''
  }
}

export function TickerPanel({ ticker }: { ticker: TickerEntry[] }) {
  return (
    <div className={styles.tickerPanel}>
      {ticker.length === 0 && <span className={styles.emptyText}>No events yet</span>}
      {[...ticker].reverse().map((entry, i) => (
        <div key={i} className={`${styles.tickerEntry} ${getTickerHighlightClass(entry.type)}`}>
          <span className={styles.tickerMinute}>{entry.minute}'</span>
          <span className={styles.tickerMessage}>{entry.message}</span>
        </div>
      ))}
    </div>
  )
}
