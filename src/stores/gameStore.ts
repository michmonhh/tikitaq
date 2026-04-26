import { create } from 'zustand'
import { createFormation } from '../engine/formation'
import { createInitialGameState } from '../engine/turn'
import { resetOpponentModel, initAIPlan } from '../engine/ai'
import { getTeamDefaultFormation } from '../data/teams'
import type { FormationType } from '../engine/types'
import { addTicker } from './gameStore/helpers'
import type { GameStore } from './gameStore/types'
import { makeMovePlayer } from './gameStore/move'
import { makePassBall } from './gameStore/pass'
import { makeShootBall } from './gameStore/shoot'
import { makeEndCurrentTurn, makeConfirmKickoff, makeConfirmSetPieceReady } from './gameStore/turn'
import { makeConfirmPenaltyDefense } from './gameStore/penalty'
import { makeExecuteAI, makeExecuteAIAnimated } from './gameStore/ai'

export const useGameStore = create<GameStore>((set, get) => ({
  state: null,
  isVsAI: false,
  isDuel: false,
  aiRunning: false,
  localTeam: null,
  aiReasoning: new Map(),

  drag: {
    activePlayerId: null,
    isDraggingBall: false,
    dragPosition: null,
  },

  selectedPlayerId: null,

  eventMessage: null,
  eventTimeout: null,
  overlayLabel: null,
  overlayColor: null,
  pendingAIOverlay: null,

  penaltyState: null,

  gameSettings: {
    oneTacklePerTurn: false,
    allowDoublePass: true,
    tacklingLock: false,
    showMovementRadii: true,
    showTackleRadii: 'dragging',
  },

  setGameSetting: (key, value) => set(s => ({
    gameSettings: { ...s.gameSettings, [key]: value },
  })),

  selectPlayer: (playerId) => set({ selectedPlayerId: playerId }),

  initGame: (team1Id, team2Id, isVsAI = true, mustDecide = false, formation1, formation2) => {
    resetOpponentModel() // Clear opponent learning data for new match
    // Wenn keine Formations übergeben wurden: aus den TEAMS-Defaults ziehen.
    // (User-Override aus MatchPlanningScreen kommt explizit über die Args.)
    const f1: FormationType = formation1 ?? (team1Id !== undefined ? getTeamDefaultFormation(team1Id) : '4-3-3')
    const f2: FormationType = formation2 ?? (team2Id !== undefined ? getTeamDefaultFormation(team2Id) : '4-3-3')
    const players = createFormation(team1Id, team2Id, f1, f2)
    let state = createInitialGameState(players, mustDecide)
    // Anstoß-Ticker
    state = addTicker(state, 'Anpfiff – 1. Halbzeit', 'kickoff')
    if (isVsAI) {
      initAIPlan(players, 2) // AI spielt als Team 2
    }
    set({ state, isVsAI, isDuel: false, localTeam: 1 })
  },

  setActivePlayer: (playerId) => {
    set(s => ({ drag: { ...s.drag, activePlayerId: playerId } }))
  },

  setDragBall: (isDragging, pos) => {
    set(s => ({
      drag: { ...s.drag, isDraggingBall: isDragging, dragPosition: pos ?? s.drag.dragPosition },
    }))
  },

  updateDragPosition: (pos) => {
    set(s => ({ drag: { ...s.drag, dragPosition: pos } }))
  },

  movePlayer: makeMovePlayer(set, get),
  passBall: makePassBall(set, get),
  shootBall: makeShootBall(set, get),
  endCurrentTurn: makeEndCurrentTurn(set, get),
  confirmKickoff: makeConfirmKickoff(set, get),
  confirmSetPieceReady: makeConfirmSetPieceReady(set, get),
  confirmPenaltyDefense: makeConfirmPenaltyDefense(set, get),
  executeAI: makeExecuteAI(set, get),
  executeAIAnimated: makeExecuteAIAnimated(set, get),

  showEvent: (message, durationMs = 2000, eventType?) => {
    const prev = get().eventTimeout
    if (prev) clearTimeout(prev)

    const OVERLAY_MAP: Record<string, { label: string; color: string }> = {
      shot_scored:      { label: 'TOR!',           color: '#4caf50' },
      shot_saved:       { label: 'GEHALTEN',       color: '#ffffff' },
      shot_missed:      { label: 'VORBEI',         color: '#ffffff' },
      penalty_scored:   { label: 'TOR!',           color: '#4caf50' },
      penalty_saved:    { label: 'GEHALTEN',       color: '#ffffff' },
      penalty_missed:   { label: 'VORBEI',         color: '#ffffff' },
      foul:             { label: 'FOUL',           color: '#ff9800' },
      yellow_card:      { label: 'GELBE KARTE',    color: '#ffeb3b' },
      red_card:         { label: 'ROTE KARTE',     color: '#f44336' },
      penalty:          { label: 'ELFMETER',       color: '#ff9800' },
      pass_intercepted: { label: 'FEHLPASS',       color: '#ffffff' },
      pass_lost:        { label: 'FEHLPASS',       color: '#ffffff' },
      corner:           { label: 'ECKE',           color: '#ffffff' },
      throw_in:         { label: 'EINWURF',        color: '#ffffff' },
      offside:          { label: 'ABSEITS',        color: '#ffffff' },
      tackle_won:       { label: 'BALLEROBERUNG',  color: '#ffffff' },
      tackle_lost:      { label: 'ABGEWEHRT',      color: '#ffffff' },
      rule_tackle:      { label: '1 TACKLING / ZUG', color: '#ff9800' },
      rule_pass:        { label: '1 PASS / ZUG',     color: '#ff9800' },
      rule_tacklelock:  { label: 'TACKLING-SPERRE',  color: '#ff9800' },
    }

    // eventType direkt übergeben (State ist ggf. noch nicht aktualisiert)
    let overlay = eventType ? OVERLAY_MAP[eventType] ?? null : null

    // Fallback: Half Time / Full Time
    if (!overlay) {
      if (message.includes('Half Time')) overlay = { label: 'HALBZEIT', color: '#ffffff' }
      else if (message.includes('Full Time')) overlay = { label: 'ABPFIFF', color: '#ffffff' }
    }

    // Während eines animierten KI-Zugs: Overlay puffern statt sofort zeigen.
    // Andernfalls flackert "FOUL"/"TOR" vor der eigentlichen Ball-Animation auf.
    // flushAIOverlay() im finishTurn löst die Anzeige nachträglich aus.
    if (get().aiRunning) {
      set({
        eventMessage: message,
        eventTimeout: null,
        overlayLabel: null,
        overlayColor: null,
        pendingAIOverlay: { message, durationMs, eventType },
      })
      return
    }

    const timeout = setTimeout(() => {
      set({ eventMessage: null, eventTimeout: null, overlayLabel: null, overlayColor: null })
    }, durationMs)

    set({
      eventMessage: message,
      eventTimeout: timeout,
      overlayLabel: overlay?.label ?? null,
      overlayColor: overlay?.color ?? null,
      pendingAIOverlay: null,
    })
  },

  clearEvent: () => {
    const prev = get().eventTimeout
    if (prev) clearTimeout(prev)
    set({ eventMessage: null, eventTimeout: null, overlayLabel: null, overlayColor: null, pendingAIOverlay: null })
  },

  flushAIOverlay: () => {
    const pending = get().pendingAIOverlay
    if (!pending) return
    set({ pendingAIOverlay: null })
    get().showEvent(pending.message, pending.durationMs, pending.eventType)
  },

  setState: (state) => set({ state }),
  setLocalTeam: (team) => set({ localTeam: team }),
  setDuel: (isDuel) => set({ isDuel }),

  reset: () => set({
    state: null,
    penaltyState: null,
    drag: { activePlayerId: null, isDraggingBall: false, dragPosition: null },
    eventMessage: null,
    overlayLabel: null,
    overlayColor: null,
    pendingAIOverlay: null,
  }),
}))
