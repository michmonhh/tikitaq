import { create } from 'zustand'

export type Screen =
  | 'intro'
  | 'auth'
  | 'main-menu'
  | 'quick-game'
  | 'duel'
  | 'match'

export interface MatchConfig {
  team1Id: number
  team2Id: number
  isVsAI: boolean
  isDuel: boolean
  matchId?: string
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
    const { screen } = get()
    switch (screen) {
      case 'match':
        set({ screen: 'main-menu', matchConfig: null })
        break
      case 'quick-game':
      case 'duel':
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
