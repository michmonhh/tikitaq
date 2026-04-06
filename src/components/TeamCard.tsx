import type { Team } from '../engine/types'
import styles from './TeamCard.module.css'

interface TeamCardProps {
  team: Team
  selected?: boolean
  onClick: () => void
}

export function TeamCard({ team, selected, onClick }: TeamCardProps) {
  const logoPath = `/${team.shortName.toLowerCase()}.svg`
  const avg = Math.round((team.levels.att + team.levels.mid + team.levels.def + team.levels.tw) / 4)

  return (
    <button
      className={`${styles.card} ${selected ? styles.selected : ''}`}
      onClick={onClick}
      style={{ '--team-color': team.color } as React.CSSProperties}
    >
      <div className={styles.logo}>
        <img src={logoPath} alt={team.name} width={40} height={40} />
      </div>
      <span className={styles.name}>{team.name}</span>
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>ATT</span>
          <span className={styles.statValue}>{team.levels.att}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>MID</span>
          <span className={styles.statValue}>{team.levels.mid}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>DEF</span>
          <span className={styles.statValue}>{team.levels.def}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>TW</span>
          <span className={styles.statValue}>{team.levels.tw}</span>
        </div>
      </div>
      <div className={styles.overall}>{avg}</div>
    </button>
  )
}
