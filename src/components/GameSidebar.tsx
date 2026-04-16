import { useState } from 'react'
import { useGameStore } from '../stores/gameStore'
import styles from './GameSidebar.module.css'
import { PlayerPanel } from './GameSidebar/PlayerPanel'
import { StatsPanel } from './GameSidebar/StatsPanel'
import { TickerPanel } from './GameSidebar/TickerPanel'
import { BenchPanel } from './GameSidebar/BenchPanel'
import { RulesPanel } from './GameSidebar/RulesPanel'

type SidebarTab = 'stats' | 'ticker' | 'bench' | 'rules'

interface GameSidebarProps {
  team1Name: string
  team2Name: string
  team1Color: string
  team2Color: string
  onBack: () => void
}

export function GameSidebar({ team1Name, team2Name, team1Color, team2Color, onBack }: GameSidebarProps) {
  const state = useGameStore(s => s.state)
  const selectedPlayerId = useGameStore(s => s.selectedPlayerId)
  const isDuel = useGameStore(s => s.isDuel)
  const localTeam = useGameStore(s => s.localTeam)
  const [activeTab, setActiveTab] = useState<SidebarTab>('stats')
  const [mobileOpen, setMobileOpen] = useState(false)

  if (!state) return null

  const isTeam1Turn = state.currentTurn === 1
  const isKickoff = state.phase === 'kickoff'
  const isFreeKick = state.phase === 'free_kick'
  const isCorner = state.phase === 'corner'
  const isThrowIn = state.phase === 'throw_in'

  const selectedPlayer = selectedPlayerId
    ? state.players.find(p => p.id === selectedPlayerId)
    : null

  // Scoreboard order: local team on top (mirrors the pitch perspective)
  const mirrored = localTeam === 2
  const topName  = mirrored ? team2Name  : team1Name
  const topColor = mirrored ? team2Color : team1Color
  const topScore = mirrored ? state.score.team2 : state.score.team1
  const topTurn  = mirrored ? !isTeam1Turn : isTeam1Turn
  const botName  = mirrored ? team1Name  : team2Name
  const botColor = mirrored ? team1Color : team2Color
  const botScore = mirrored ? state.score.team1 : state.score.team2
  const botTurn  = mirrored ? isTeam1Turn : !isTeam1Turn

  const turnLabel = isKickoff ? 'Kickoff' : isFreeKick ? 'Free Kick' : isCorner ? 'Corner' : isThrowIn ? 'Throw In' : `${isTeam1Turn ? team1Name : team2Name}'s Turn`
  const turnColor = isTeam1Turn ? team1Color : team2Color

  return (
    <div className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ''}`}>
      {/* Mobile: collapsed scorebar — tap to expand */}
      <div className={styles.mobileScorebar} onClick={() => setMobileOpen(!mobileOpen)}>
        <div className={styles.scorebarTeam}>
          <div className={styles.teamDot} style={{ background: topColor }} />
          <span className={styles.scorebarName}>{topName}</span>
          <span className={styles.scorebarScore}>{topScore}</span>
        </div>
        <div className={styles.scorebarCenter}>
          <span className={styles.scorebarTime}>{state.gameTime}'</span>
          <span className={styles.scorebarTurn} style={{ background: turnColor }}>{turnLabel}</span>
        </div>
        <div className={styles.scorebarTeam}>
          <span className={styles.scorebarScore}>{botScore}</span>
          <span className={styles.scorebarName}>{botName}</span>
          <div className={styles.teamDot} style={{ background: botColor }} />
        </div>
        <div className={`${styles.scorebarChevron} ${mobileOpen ? styles.scorebarChevronOpen : ''}`}>▲</div>
      </div>

      {/* Desktop: always visible / Mobile: only when expanded */}
      <div className={styles.sidebarBody}>
        <button className={styles.backBtn} onClick={onBack}>&larr; Back</button>

        {/* Scoreboard */}
        <div className={styles.scoreboard}>
          <div className={`${styles.team} ${topTurn ? styles.activeTurn : ''}`}>
            <div className={styles.teamDot} style={{ background: topColor }} />
            <span className={styles.teamName}>{topName}</span>
            <span className={styles.score}>{topScore}</span>
          </div>
          <div className={styles.divider}>
            <span className={styles.time}>{state.gameTime}'</span>
            <span className={styles.half}>{state.half === 1 ? '1st' : '2nd'} Half</span>
          </div>
          <div className={`${styles.team} ${botTurn ? styles.activeTurn : ''}`}>
            <div className={styles.teamDot} style={{ background: botColor }} />
            <span className={styles.teamName}>{botName}</span>
            <span className={styles.score}>{botScore}</span>
          </div>
        </div>

        <div className={styles.turnInfo}>
          <div className={styles.turnBadge} style={{ background: turnColor }}>
            {turnLabel}
          </div>
        </div>

        {/* Content area */}
        {selectedPlayer ? (
          <PlayerPanel player={selectedPlayer} />
        ) : (
          <>
            <div className={styles.tabs}>
              <button className={`${styles.tab} ${activeTab === 'stats' ? styles.activeTab : ''}`} onClick={() => setActiveTab('stats')}>Stats</button>
              <button className={`${styles.tab} ${activeTab === 'ticker' ? styles.activeTab : ''}`} onClick={() => setActiveTab('ticker')}>Ticker</button>
              <button className={`${styles.tab} ${activeTab === 'bench' ? styles.activeTab : ''}`} onClick={() => setActiveTab('bench')}>Bench</button>
              {!isDuel && <button className={`${styles.tab} ${activeTab === 'rules' ? styles.activeTab : ''}`} onClick={() => setActiveTab('rules')}>Rules</button>}
            </div>
            <div className={styles.tabContent}>
              {activeTab === 'stats' && (
                <StatsPanel
                  stats1={mirrored ? state.matchStats.team2 : state.matchStats.team1}
                  stats2={mirrored ? state.matchStats.team1 : state.matchStats.team2}
                  team1Name={topName}
                  team2Name={botName}
                  team1Color={topColor}
                  team2Color={botColor}
                  turns1={mirrored ? state.totalTurns.team2 : state.totalTurns.team1}
                  turns2={mirrored ? state.totalTurns.team1 : state.totalTurns.team2}
                />
              )}
              {activeTab === 'ticker' && <TickerPanel ticker={state.ticker} />}
              {activeTab === 'bench' && <BenchPanel />}
              {!isDuel && activeTab === 'rules' && <RulesPanel />}
            </div>
          </>
        )}

        {state.phase === 'full_time' && (
          <div className={styles.gameOver}>
            <h3>Full Time</h3>
            <p>{topScore} - {botScore}</p>
          </div>
        )}
      </div>

      {/* Mobile backdrop */}
      {mobileOpen && <div className={styles.mobileBackdrop} onClick={() => setMobileOpen(false)} />}
    </div>
  )
}
