import styles from '../GameSidebar.module.css'

export function BenchPanel() {
  return (
    <div className={styles.benchPanel}>
      <span className={styles.emptyText}>No substitutes available</span>
    </div>
  )
}
