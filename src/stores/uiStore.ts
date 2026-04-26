import { create } from 'zustand'
import type { FormationType } from '../engine/types'
import type { CustomLineup } from '../engine/formation'

export type Screen =
  | 'intro'
  | 'auth'
  | 'main-menu'
  | 'quick-game'
  | 'duel'
  | 'perfect-run'
  | 'season'
  | 'arena'
  | 'replay'
  | 'match-planning'
  | 'match'

export interface MatchConfig {
  team1Id: number
  team2Id: number
  isVsAI: boolean
  isDuel: boolean
  matchId?: string
  // Perfect Run: when set, MatchScreen finalizes the campaign on full_time
  campaignId?: string
  // Saison-Modus: wenn gesetzt, wird das Ergebnis beim full_time in den Season-Store
  // geschrieben und die übrigen Matchday-Spiele simuliert.
  seasonMatchId?: string
  // Wenn true, muss das Spiel entschieden werden — bei Gleichstand nach 90min
  // Verlängerung + ggf. Elfmeterschießen. Default false → Remis ist möglich.
  mustDecide?: boolean
  // Formationen pro Team. Default = team's preferredFormation. Werden im
  // MatchPlanningScreen vom User für seine Mannschaft überschrieben.
  formation1?: FormationType
  formation2?: FormationType
  // User-Override der Aufstellung (Drag&Drop im Planning-Screen). Pro
  // Slot der Roster-Index aus TEAM_ROSTERS. Wenn nicht gesetzt: auto-Wahl.
  customLineup1?: CustomLineup
  customLineup2?: CustomLineup
  // Zurück-Navigation aus dem Planning-Screen — wo kam der User her?
  // (relevant z.B. für Saison-Modus, wo der Back-Button zur Saison-Übersicht
  // führen soll, nicht ins Hauptmenü.)
  planningOrigin?: Screen
}

interface UIStore {
  screen: Screen
  matchConfig: MatchConfig | null

  navigate: (screen: Screen) => void
  /** Direkt ins Match (überspringt Planning). */
  startMatch: (config: MatchConfig) => void
  /** Geht erst in den MatchPlanningScreen, dann ins Match. */
  startPlanning: (config: MatchConfig) => void
  /** Vom Planning aus ins Match — übernimmt die im Planning gewählte Formation
   *  und (optional) die per Drag&Drop angepasste Aufstellung. */
  confirmPlanningAndStart: (
    formation1: FormationType,
    formation2: FormationType,
    customLineup1?: CustomLineup,
    customLineup2?: CustomLineup,
  ) => void
  goBack: () => void
}

export const useUIStore = create<UIStore>((set, get) => ({
  screen: 'intro',
  matchConfig: null,

  navigate: (screen) => set({ screen }),

  startMatch: (config) => set({ screen: 'match', matchConfig: config }),

  startPlanning: (config) => set({
    screen: 'match-planning',
    matchConfig: { ...config, planningOrigin: get().screen },
  }),

  confirmPlanningAndStart: (formation1, formation2, customLineup1, customLineup2) => {
    const cfg = get().matchConfig
    if (!cfg) return
    set({
      screen: 'match',
      matchConfig: { ...cfg, formation1, formation2, customLineup1, customLineup2 },
    })
  },

  goBack: () => {
    const { screen, matchConfig } = get()
    switch (screen) {
      case 'match': {
        // Perfect Run matches return to the campaign menu, not main menu
        const next: Screen = matchConfig?.campaignId ? 'perfect-run' : 'main-menu'
        set({ screen: next, matchConfig: null })
        break
      }
      case 'match-planning': {
        // Zurück woher der User kam (QuickGame, Arena, Saison, etc.)
        const next: Screen = matchConfig?.planningOrigin ?? 'main-menu'
        set({ screen: next })
        break
      }
      case 'quick-game':
      case 'duel':
      case 'perfect-run':
      case 'season':
      case 'arena':
        set({ screen: 'main-menu' })
        break
      case 'replay':
        set({ screen: 'arena' })
        break
      case 'main-menu':
        set({ screen: 'intro' })
        break
      default:
        set({ screen: 'intro' })
    }
  },
}))
