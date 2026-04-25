import { useEffect, useMemo, useRef } from 'react'
import { useGameStore } from '../stores/gameStore'
import { useAuthStore } from '../stores/authStore'
import { usePerfectRunStore } from '../stores/perfectRunStore'
import { useSeasonStore, type GoalEntry } from '../stores/seasonStore'
import { repositionForSetPiece } from '../engine/ai/setPiece'
import type { GameState, TeamSide } from '../engine/types'
import { tally } from '../engine/shootout'
import { useUIStore } from '../stores/uiStore'
import { useMatchSync } from '../hooks/useMatchSync'
import { useGameLoop } from '../hooks/useGameLoop'
import { useAIMode } from '../hooks/useAIMode'
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
  const finalizeMatch = usePerfectRunStore(s => s.finalizeMatch)
  const finishUserMatch = useSeasonStore(s => s.finishUserMatch)
  const simulateRemainingOfMatchday = useSeasonStore(s => s.simulateRemainingOfMatchday)
  const finalizedRef = useRef(false)
  const seasonDoneRef = useRef(false)

  // KI-Modus-Hook lädt persisted Mode beim Mount und aktiviert die Policy
  // (heuristic / bc / rl). Hat keine UI hier — die Wahl wird im Arena- oder
  // Settings-Screen getroffen.
  useAIMode()

  const team1 = matchConfig ? getTeamById(matchConfig.team1Id) : null
  const team2 = matchConfig ? getTeamById(matchConfig.team2Id) : null

  // Duel match sync
  const duelSync = useMatchSync(
    matchConfig?.isDuel ? matchConfig.matchId : undefined,
    userId
  )

  useEffect(() => {
    if (!matchConfig || !team1 || !team2) return
    finalizedRef.current = false
    seasonDoneRef.current = false
    initGame(matchConfig.team1Id, matchConfig.team2Id, matchConfig.isVsAI, matchConfig.mustDecide ?? false)

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
    // Init runs only when matchConfig/team changes. duelSync.matchDetails + userId
    // are handled by the dedicated effect below; re-running init on their arrival
    // would reset the game mid-flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchConfig, team1, team2, initGame, reset])

  // Perfect Run: finalize the campaign row + award XP once per match at full_time.
  useEffect(() => {
    if (state?.phase !== 'full_time') return
    if (!matchConfig?.campaignId || !userId) return
    if (finalizedRef.current) return
    finalizedRef.current = true
    finalizeMatch(
      userId,
      matchConfig.campaignId,
      state.score.team1,
      state.score.team2,
      matchConfig.team2Id,
      state.shootoutState?.decidedWinner ?? null,
    )
  }, [state?.phase, state?.score.team1, state?.score.team2, state?.shootoutState, matchConfig, userId, finalizeMatch])

  // Saison-Modus: Ergebnis + Torschützen speichern und restliche Partien simulieren.
  useEffect(() => {
    if (state?.phase !== 'full_time') return
    if (!matchConfig?.seasonMatchId || !userId) return
    if (seasonDoneRef.current) return
    seasonDoneRef.current = true
    const scorers: GoalEntry[] = state.goalLog.map(g => ({
      team: g.team,  // 1 = team1 (home), 2 = team2 (away) — Match-intern konsistent
      scoringTeamId: g.team === 1 ? matchConfig.team1Id : matchConfig.team2Id,
      playerName: g.playerName,
      minute: g.minute,
      kind: g.kind,
    }))
    const homeGoals = state.score.team1
    const awayGoals = state.score.team2
    // Reihenfolge wichtig: erst User-Ergebnis persistieren, dann Rest simulieren.
    ;(async () => {
      await finishUserMatch(userId, matchConfig.seasonMatchId!, homeGoals, awayGoals, scorers)
      await simulateRemainingOfMatchday(userId)
    })()
  }, [state?.phase, state?.score.team1, state?.score.team2, state?.goalLog, matchConfig, userId, finishUserMatch, simulateRemainingOfMatchday])

  // Update localTeam when matchDetails arrive (may load after initGame)
  useEffect(() => {
    if (!matchConfig?.isDuel || !duelSync.matchDetails || !userId) return
    const myTeam: TeamSide = userId === duelSync.matchDetails.player1_id ? 1 : 2
    setLocalTeam(myTeam)
  }, [duelSync.matchDetails, userId, matchConfig?.isDuel, setLocalTeam])

  const team1Color = matchConfig ? getEffectiveColor(matchConfig.team1Id) : '#eada1e'
  const team2Color = matchConfig ? getEffectiveColor(matchConfig.team2Id) : '#e32221'
  const teamColors = useMemo(() => ({ team1: team1Color, team2: team2Color }), [team1Color, team2Color])
  useGameLoop(canvasRef, containerRef, teamColors)

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
    // Only re-evaluate when turn/phase change — reading full `state` at fire time
    // (via getState) keeps us off the render loop's treadmill.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const isShootoutKick = state?.phase === 'shootout_kick'
  const isSetPiece = isFreeKick || isCorner || isThrowIn
  const isFullTime = state?.phase === 'full_time'
  const isPlayerTurn = state && state.currentTurn === 1 && state.phase === 'playing'

  // Penalty / Shootout kick: determine if player is the shooter or keeper
  const localTeam = useGameStore(s => s.localTeam)
  const isPenaltyLike = isPenalty || isShootoutKick
  const isShooter = isPenaltyLike && penaltyState?.shooterTeam === localTeam
  const isPenaltyKeeper = isPenaltyLike && penaltyState && !isShooter

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

        {/* Shootout score grid */}
        {state?.shootoutState && (state.phase === 'shootout' || isShootoutKick || isFullTime) && (
          <ShootoutOverlay state={state} team1Name={team1?.shortName ?? 'T1'} team2Name={team2?.shortName ?? 'T2'} />
        )}

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
            ) : isPenaltyLike ? null : showSetPieceButton ? (
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

function ShootoutOverlay({ state, team1Name, team2Name }: { state: GameState; team1Name: string; team2Name: string }) {
  const so = state.shootoutState
  if (!so) return null
  const { team1Scored, team2Scored } = tally(so)
  const kicksT1 = so.kicks.filter(k => k.team === 1)
  const kicksT2 = so.kicks.filter(k => k.team === 2)
  // Reservierte Slots: mind. 5 für die reguläre Serie, danach dynamisch
  const slotCount = Math.max(5, Math.max(kicksT1.length, kicksT2.length))
  return (
    <div className={styles.shootoutOverlay}>
      <div className={styles.shootoutTitle}>Elfmeterschießen · Runde {so.round}</div>
      <div className={styles.shootoutRow}>
        <span className={styles.shootoutTeamLabel}>{team1Name}</span>
        <div className={styles.shootoutDots}>
          {Array.from({ length: slotCount }).map((_, i) => {
            const k = kicksT1[i]
            const cls = !k
              ? styles.shootoutDot
              : `${styles.shootoutDot} ${k.scored ? styles.shootoutDotScored : styles.shootoutDotMissed}`
            return <span key={i} className={cls} />
          })}
        </div>
        <span className={styles.shootoutScore}>{team1Scored}</span>
      </div>
      <div className={styles.shootoutRow}>
        <span className={styles.shootoutTeamLabel}>{team2Name}</span>
        <div className={styles.shootoutDots}>
          {Array.from({ length: slotCount }).map((_, i) => {
            const k = kicksT2[i]
            const cls = !k
              ? styles.shootoutDot
              : `${styles.shootoutDot} ${k.scored ? styles.shootoutDotScored : styles.shootoutDotMissed}`
            return <span key={i} className={cls} />
          })}
        </div>
        <span className={styles.shootoutScore}>{team2Scored}</span>
      </div>
    </div>
  )
}
