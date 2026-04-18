import { create } from 'zustand'

export type Screen =
  | 'intro'
  | 'auth'
  | 'main-menu'
  | 'quick-game'
  | 'duel'
  | 'perfect-run'
  | 'match'

export interface MatchConfig {
  team1Id: number
  team2Id: number
  isVsAI: boolean
  isDuel: boolean
  matchId?: string
  // Perfect Run: when set, MatchScreen finalizes the campaign on full_time
  campaignId?: string
  // Wenn true, muss das Spiel entschieden werden — bei Gleichstand nach 90min
  // Verlängerung + ggf. Elfmeterschießen. Default false → Remis ist möglich.
  mustDecide?: boolean
}

interface UIStore {
  screen: Screen
  matchConfig: MatchConfig | null

  navigate: (screen: Screen) => void
  startMatch: (config: MatchConfig) => void
  goBack: () => void
}

export const useUIStore = create<UIStore>((set, get) => ({
  screen: 'intro',
  matchConfig: null,

  navigate: (screen) => set({ screen }),

  startMatch: (config) => set({ screen: 'match', matchConfig: config }),

  goBack: () => {
    const { screen, matchConfig } = get()
    switch (screen) {
      case 'match': {
        // Perfect Run matches return to the campaign menu, not main menu
        const next: Screen = matchConfig?.campaignId ? 'perfect-run' : 'main-menu'
        set({ screen: next, matchConfig: null })
        break
      }
      case 'quick-game':
      case 'duel':
      case 'perfect-run':
        set({ screen: 'main-menu' })
        break
      case 'main-menu':
        set({ screen: 'intro' })
        break
      default:
        set({ screen: 'intro' })
    }
  },
}))
