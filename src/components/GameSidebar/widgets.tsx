import styles from '../GameSidebar.module.css'

export function StatBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value))
  const color = pct >= 80 ? '#4caf50' : pct >= 60 ? '#ffc107' : '#f44336'
  return (
    <div className={styles.statBar}>
      <span className={styles.statLabel}>{label}</span>
      <div className={styles.statTrack}>
        <div className={styles.statFill} style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className={styles.statValue}>{value}</span>
    </div>
  )
}

export function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.miniStat}>
      <span className={styles.miniStatValue}>{value}</span>
      <span className={styles.miniStatLabel}>{label}</span>
    </div>
  )
}

export function ComparisonRow({ label, v1, v2 }: { label: string; v1: string; v2: string }) {
  return (
    <div className={styles.compRow}>
      <span className={styles.compValue}>{v1}</span>
      <span className={styles.compLabel}>{label}</span>
      <span className={styles.compValue}>{v2}</span>
    </div>
  )
}

export function ComparisonBar({ label, v1, v2, c1, c2, unit }: { label: string; v1: number; v2: number; c1: string; c2: string; unit?: string }) {
  return (
    <div className={styles.compBarWrap}>
      <div className={styles.compRow}>
        <span className={styles.compValue}>{v1}{unit}</span>
        <span className={styles.compLabel}>{label}</span>
        <span className={styles.compValue}>{v2}{unit}</span>
      </div>
      <div className={styles.compBar}>
        <div className={styles.compBarFill} style={{ width: `${v1}%`, background: c1 }} />
        <div className={styles.compBarFill} style={{ width: `${v2}%`, background: c2 }} />
      </div>
    </div>
  )
}
