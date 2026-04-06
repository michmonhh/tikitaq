import { useEffect, useRef } from 'react'
import { useGameStore } from '../stores/gameStore'
import { useUIStore } from '../stores/uiStore'
import { useGameLoop } from '../hooks/useGameLoop'
import { GameSidebar } from '../components/GameSidebar'
import { getTeamById } from '../data/teams'
import styles from './MatchScreen.module.css'

export function MatchScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { matchConfig } = useUIStore()
  const { initGame, endCurrentTurn, executeAI, reset, state, isVsAI } = useGameStore()
  const goBack = useUIStore(s => s.goBack)

  const team1 = matchConfig ? getTeamById(matchConfig.team1Id) : null
  const team2 = matchConfig ? getTeamById(matchConfig.team2Id) : null

  // Initialize game
  useEffect(() => {
    if (!matchConfig || !team1 || !team2) return
    initGame(team1.levels, team2.levels, matchConfig.isVsAI)
    return () => reset()
  }, [matchConfig, team1, team2, initGame, reset])

  // Connect game loop
  useGameLoop(canvasRef, containerRef)

  // AI turn execution
  useEffect(() => {
    if (!state || !isVsAI || state.currentTurn !== 2) return
    if (state.phase !== 'playing' && state.phase !== 'kickoff') return

    const timer = setTimeout(() => {
      executeAI()
    }, 800)

    return () => clearTimeout(timer)
  }, [state?.currentTurn, state?.phase, isVsAI, executeAI])

  const handleBack = () => {
    reset()
    goBack()
  }

  return (
    <div className={styles.container}>
      <div className={styles.canvasWrapper} ref={containerRef}>
        <canvas ref={canvasRef} className={styles.canvas} />
      </div>
      <GameSidebar
        team1Name={team1?.shortName ?? 'Team 1'}
        team2Name={team2?.shortName ?? 'Team 2'}
        team1Color={team1?.color ?? '#eada1e'}
        team2Color={team2?.color ?? '#e32221'}
        onBack={handleBack}
        onEndTurn={endCurrentTurn}
      />
    </div>
  )
}
