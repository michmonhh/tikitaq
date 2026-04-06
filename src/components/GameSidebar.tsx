import { useGameStore } from '../stores/gameStore'
import { Button } from './Button'
import styles from './GameSidebar.module.css'

interface GameSidebarProps {
  team1Name: string
  team2Name: string
  team1Color: string
  team2Color: string
  onBack: () => void
  onEndTurn: () => void
}

export function GameSidebar({ team1Name, team2Name, team1Color, team2Color, onBack, onEndTurn }: GameSidebarProps) {
  const state = useGameStore(s => s.state)
  if (!state) return null

  const isTeam1Turn = state.currentTurn === 1

  return (
    <div className={styles.sidebar}>
      <button className={styles.backBtn} onClick={onBack}>
        &larr; Back
      </button>

      <div className={styles.scoreboard}>
        <div className={`${styles.team} ${isTeam1Turn ? styles.activeTurn : ''}`}>
          <div className={styles.teamDot} style={{ background: team1Color }} />
          <span className={styles.teamName}>{team1Name}</span>
          <span className={styles.score}>{state.score.team1}</span>
        </div>

        <div className={styles.divider}>
          <span className={styles.time}>{state.gameTime}'</span>
          <span className={styles.half}>{state.half === 1 ? '1st' : '2nd'} Half</span>
        </div>

        <div className={`${styles.team} ${!isTeam1Turn ? styles.activeTurn : ''}`}>
          <div className={styles.teamDot} style={{ background: team2Color }} />
          <span className={styles.teamName}>{team2Name}</span>
          <span className={styles.score}>{state.score.team2}</span>
        </div>
      </div>

      <div className={styles.turnInfo}>
        <div
          className={styles.turnBadge}
          style={{ background: isTeam1Turn ? team1Color : team2Color }}
        >
          {isTeam1Turn ? team1Name : team2Name}'s Turn
        </div>
      </div>

      <div className={styles.actions}>
        <Button variant="primary" fullWidth onClick={onEndTurn}>
          End Turn
        </Button>
      </div>

      {state.phase === 'full_time' && (
        <div className={styles.gameOver}>
          <h3>Full Time</h3>
          <p>{state.score.team1} - {state.score.team2}</p>
          <Button variant="secondary" onClick={onBack}>
            Back to Menu
          </Button>
        </div>
      )}
    </div>
  )
}
