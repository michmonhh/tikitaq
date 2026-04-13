import { useEffect, useRef } from 'react'
import { useGameStore } from '../stores/gameStore'
import { repositionForSetPiece } from '../engine/ai/setPiece'
import type { TeamSide } from '../engine/types'
import { useUIStore } from '../stores/uiStore'
import { useGameLoop } from '../hooks/useGameLoop'
import { GameSidebar } from '../components/GameSidebar'
import { Button } from '../components/Button'
import { getTeamById } from '../data/teams'
import { getEffectiveColor } from '../data/teamOverrides'
import styles from './MatchScreen.module.css'

export function MatchScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { matchConfig } = useUIStore()
  const { initGame, endCurrentTurn, confirmKickoff, executeAIAnimated, reset, state, isVsAI, aiRunning, penaltyState, confirmPenaltyDefense } = useGameStore()
  const goBack = useUIStore(s => s.goBack)

  const team1 = matchConfig ? getTeamById(matchConfig.team1Id) : null
  const team2 = matchConfig ? getTeamById(matchConfig.team2Id) : null

  useEffect(() => {
    if (!matchConfig || !team1 || !team2) return
    initGame(matchConfig.team1Id, matchConfig.team2Id, matchConfig.isVsAI)
    return () => reset()
  }, [matchConfig, team1, team2, initGame, reset])

  const team1Color = matchConfig ? getEffectiveColor(matchConfig.team1Id) : '#eada1e'
  const team2Color = matchConfig ? getEffectiveColor(matchConfig.team2Id) : '#e32221'
  useGameLoop(canvasRef, containerRef, { team1: team1Color, team2: team2Color })

  useEffect(() => {
    if (!state || !isVsAI || state.currentTurn !== 2) return
    if (aiRunning) return

    if (state.phase === 'playing') {
      // Normal AI turn
      const timer = setTimeout(() => {
        executeAIAnimated()
      }, 1500)
      return () => clearTimeout(timer)
    }

    // AI has a set piece — reposition then auto-confirm for player to see
    if (state.phase === 'free_kick' || state.phase === 'corner' || state.phase === 'throw_in') {
      const timer = setTimeout(() => {
        // AI repositions its players for the set piece
        const aiActions = repositionForSetPiece(state, 2, state.phase as 'free_kick' | 'corner' | 'throw_in')
        let updatedPlayers = [...state.players]
        for (const action of aiActions) {
          if (action.type === 'move') {
            updatedPlayers = updatedPlayers.map(p =>
              p.id === action.playerId
                ? { ...p, position: { ...action.target }, origin: { ...action.target } }
                : p
            )
          }
        }
        // Update state with AI positions, keep set piece phase for player to reposition
        useGameStore.setState({
          state: { ...state, players: updatedPlayers, currentTurn: 1 as TeamSide },
        })
      }, 800)
      return () => clearTimeout(timer)
    }
  }, [state?.currentTurn, state?.phase, isVsAI, aiRunning, executeAIAnimated])

  const handleBack = () => {
    reset()
    goBack()
  }

  const isKickoff = state?.phase === 'kickoff'
  const isFreeKick = state?.phase === 'free_kick'
  const isCorner = state?.phase === 'corner'
  const isThrowIn = state?.phase === 'throw_in'
  const isPenalty = state?.phase === 'penalty'
  const isSetupPhase = isKickoff || isFreeKick || isCorner || isThrowIn
  const isFullTime = state?.phase === 'full_time'
  const isPlayerTurn = state && state.currentTurn === 1 && state.phase === 'playing'

  // Penalty: determine if player is the shooter or keeper
  const localTeam = useGameStore(s => s.localTeam)
  const isShooter = isPenalty && penaltyState?.shooterTeam === localTeam
  const isPenaltyKeeper = isPenalty && penaltyState && !isShooter

  // Determine if player has made any moves this turn
  const hasMoved = state ? state.players.some(p => p.team === 1 && p.hasMoved) : false

  return (
    <div className={styles.container}>
      <div className={styles.canvasWrapper} ref={containerRef}>
        <canvas ref={canvasRef} className={styles.canvas} />

        {/* AI thinking indicator */}
        {aiRunning && (
          <div className={styles.aiOverlay}>
            <div className={styles.aiDots}>
              <div className={styles.aiDot} />
              <div className={styles.aiDot} />
              <div className={styles.aiDot} />
            </div>
            <span className={styles.aiText}>AI Thinking</span>
          </div>
        )}

        {/* Action button overlay on the canvas area */}
        {state && !isFullTime && !aiRunning && (
          <div className={styles.actionOverlay}>
            {isPenaltyKeeper ? (
              <Button variant="primaryPulse" onClick={confirmPenaltyDefense} className={styles.actionBtn}>
                Bereit
              </Button>
            ) : isPenalty ? null : isSetupPhase ? (
              <Button variant="primaryPulse" onClick={confirmKickoff} className={styles.actionBtn}>
                {isKickoff ? 'Kickoff' : isFreeKick ? 'Free Kick' : isCorner ? 'Corner' : 'Throw In'}
              </Button>
            ) : isPlayerTurn ? (
              <Button
                variant={hasMoved ? 'ready' : 'waiting'}
                onClick={endCurrentTurn}
                className={styles.actionBtn}
              >
                End Turn
              </Button>
            ) : null}
          </div>
        )}

        {isFullTime && (
          <div className={styles.actionOverlay}>
            <Button variant="secondary" onClick={handleBack} className={styles.actionBtn}>
              Back to Menu
            </Button>
          </div>
        )}
      </div>

      <GameSidebar
        team1Name={team1?.shortName ?? 'Team 1'}
        team2Name={team2?.shortName ?? 'Team 2'}
        team1Color={team1Color}
        team2Color={team2Color}
        onBack={handleBack}
      />
    </div>
  )
}
