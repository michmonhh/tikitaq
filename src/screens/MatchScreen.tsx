import { useEffect, useRef } from 'react'
import { useGameStore } from '../stores/gameStore'
import { useAuthStore } from '../stores/authStore'
import { repositionForSetPiece } from '../engine/ai/setPiece'
import type { TeamSide } from '../engine/types'
import { useUIStore } from '../stores/uiStore'
import { useMatchSync } from '../hooks/useMatchSync'
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
  const { initGame, endCurrentTurn, confirmKickoff, confirmSetPieceReady, executeAIAnimated, reset, state, isVsAI, aiRunning, penaltyState, confirmPenaltyDefense, setLocalTeam, setDuel } = useGameStore()
  const goBack = useUIStore(s => s.goBack)
  const userId = useAuthStore(s => s.user?.id)

  const team1 = matchConfig ? getTeamById(matchConfig.team1Id) : null
  const team2 = matchConfig ? getTeamById(matchConfig.team2Id) : null

  // Duel match sync
  const duelSync = useMatchSync(
    matchConfig?.isDuel ? matchConfig.matchId : undefined,
    userId
  )

  useEffect(() => {
    if (!matchConfig || !team1 || !team2) return
    initGame(matchConfig.team1Id, matchConfig.team2Id, matchConfig.isVsAI)

    // Duel: determine which team this player controls
    if (matchConfig.isDuel) {
      setDuel(true)
      // player1_id always plays Team 1, player2_id plays Team 2
      if (duelSync.matchDetails && userId) {
        const myTeam: TeamSide = userId === duelSync.matchDetails.player1_id ? 1 : 2
        setLocalTeam(myTeam)
      }
    }

    return () => reset()
  }, [matchConfig, team1, team2, initGame, reset])

  // Update localTeam when matchDetails arrive (may load after initGame)
  useEffect(() => {
    if (!matchConfig?.isDuel || !duelSync.matchDetails || !userId) return
    const myTeam: TeamSide = userId === duelSync.matchDetails.player1_id ? 1 : 2
    setLocalTeam(myTeam)
  }, [duelSync.matchDetails, userId, matchConfig?.isDuel, setLocalTeam])

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

    // AI has a set piece — show setup to player, then let player reposition defenders.
    // Read CURRENT store state at fire time (not the stale React closure) so that
    // any defender repositioning the user already made is not overwritten.
    if (state.phase === 'free_kick' || state.phase === 'corner' || state.phase === 'throw_in') {
      const timer = setTimeout(() => {
        const currentState = useGameStore.getState().state
        if (!currentState) return
        // Bail if phase changed in the meantime (e.g. user already confirmed)
        if (currentState.phase !== 'free_kick' && currentState.phase !== 'corner' && currentState.phase !== 'throw_in') return

        // Apply any remaining AI repositioning on top of the current player positions
        const aiActions = repositionForSetPiece(currentState, 2, currentState.phase as 'free_kick' | 'corner' | 'throw_in')
        let updatedPlayers = [...currentState.players]
        for (const action of aiActions) {
          if (action.type === 'move') {
            updatedPlayers = updatedPlayers.map(p =>
              p.id === action.playerId
                ? { ...p, position: { ...action.target }, origin: { ...action.target } }
                : p
            )
          }
        }
        // Flip currentTurn to 1 so the user can reposition their defenders before clicking Bereit
        useGameStore.setState({
          state: { ...currentState, players: updatedPlayers, currentTurn: 1 as TeamSide },
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
  const isSetPiece = isFreeKick || isCorner || isThrowIn
  const isFullTime = state?.phase === 'full_time'
  const isPlayerTurn = state && state.currentTurn === 1 && state.phase === 'playing'

  // Penalty: determine if player is the shooter or keeper
  const localTeam = useGameStore(s => s.localTeam)
  const isShooter = isPenalty && penaltyState?.shooterTeam === localTeam
  const isPenaltyKeeper = isPenalty && penaltyState && !isShooter

  // Determine if user is attacker in a set piece (owns the ball via their team).
  // When user is attacker the "Free Kick / Corner / Throw In" confirm button is
  // hidden — the user simply drags the ball to pass directly. The button is
  // still shown as "Bereit" when user is defender (to acknowledge the AI's
  // set piece setup) and for the kickoff (both teams).
  const userTeam: TeamSide = localTeam ?? 1
  const ballOwnerTeam = state?.ball.ownerId
    ? state.players.find(p => p.id === state.ball.ownerId)?.team ?? null
    : null
  const userIsSetPieceAttacker = isSetPiece && ballOwnerTeam === userTeam
  // Fall A: Nutzer-Schütze im Freistoß muss "Bereit" klicken → dann repositioniert die KI
  // defensiv, setPieceReady=true. Danach (und bei Ecke/Einwurf) kann er direkt passen.
  const needsFreeKickReady = isFreeKick && userIsSetPieceAttacker && state?.setPieceReady === false
  const showSetPieceButton = isKickoff || (isSetPiece && !userIsSetPieceAttacker) || needsFreeKickReady

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
            ) : isPenalty ? null : showSetPieceButton ? (
              <Button
                variant="primaryPulse"
                onClick={needsFreeKickReady ? confirmSetPieceReady : confirmKickoff}
                className={styles.actionBtn}
              >
                {isKickoff ? 'Kickoff' : 'Bereit'}
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
