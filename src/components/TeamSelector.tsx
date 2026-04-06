import { TEAMS } from '../data/teams'
import { TeamCard } from './TeamCard'
import styles from './TeamSelector.module.css'

interface TeamSelectorProps {
  selectedId: number | null
  onSelect: (teamId: number) => void
  disabledId?: number | null
}

export function TeamSelector({ selectedId, onSelect, disabledId }: TeamSelectorProps) {
  return (
    <div className={styles.grid}>
      {TEAMS.map(team => (
        <TeamCard
          key={team.id}
          team={team}
          selected={team.id === selectedId}
          onClick={() => {
            if (team.id !== disabledId) onSelect(team.id)
          }}
        />
      ))}
    </div>
  )
}
