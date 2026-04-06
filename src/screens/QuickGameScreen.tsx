import { useState } from 'react'
import { useUIStore } from '../stores/uiStore'
import { Button } from '../components/Button'
import { TeamSelector } from '../components/TeamSelector'
import { Modal } from '../components/Modal'
import { getTeamById } from '../data/teams'
import styles from './QuickGameScreen.module.css'

export function QuickGameScreen() {
  const { navigate, startMatch } = useUIStore()
  const [team1Id, setTeam1Id] = useState(1)  // Dortmund
  const [team2Id, setTeam2Id] = useState(0)  // München
  const [selecting, setSelecting] = useState<1 | 2 | null>(null)

  const team1 = getTeamById(team1Id)
  const team2 = getTeamById(team2Id)

  const handlePlay = () => {
    startMatch({
      team1Id,
      team2Id,
      isVsAI: true,
      isDuel: false,
    })
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('main-menu')}>
          &larr; Back
        </button>
        <h1 className={styles.title}>Quick Game</h1>
      </div>

      <div className={styles.matchup}>
        <button
          className={styles.teamSlot}
          onClick={() => setSelecting(1)}
          style={{ '--tc': team1?.color } as React.CSSProperties}
        >
          {team1 && (
            <>
              <img src={`/${team1.shortName.toLowerCase()}.svg`} alt={team1.name} className={styles.teamLogo} />
              <span className={styles.teamName}>{team1.name}</span>
              <span className={styles.teamRole}>You</span>
            </>
          )}
        </button>

        <div className={styles.vs}>VS</div>

        <button
          className={styles.teamSlot}
          onClick={() => setSelecting(2)}
          style={{ '--tc': team2?.color } as React.CSSProperties}
        >
          {team2 && (
            <>
              <img src={`/${team2.shortName.toLowerCase()}.svg`} alt={team2.name} className={styles.teamLogo} />
              <span className={styles.teamName}>{team2.name}</span>
              <span className={styles.teamRole}>AI</span>
            </>
          )}
        </button>
      </div>

      <Button variant="primary" size="lg" onClick={handlePlay} className={styles.playBtn}>
        PLAY
      </Button>

      <Modal
        open={selecting !== null}
        onClose={() => setSelecting(null)}
        title={`Select Team ${selecting}`}
      >
        <TeamSelector
          selectedId={selecting === 1 ? team1Id : team2Id}
          disabledId={selecting === 1 ? team2Id : team1Id}
          onSelect={(id) => {
            if (selecting === 1) setTeam1Id(id)
            else setTeam2Id(id)
            setSelecting(null)
          }}
        />
      </Modal>
    </div>
  )
}
