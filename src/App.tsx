import { useEffect } from 'react'
import { useUIStore } from './stores/uiStore'
import { useAuthStore } from './stores/authStore'
import { IntroScreen } from './screens/IntroScreen'
import { MainMenuScreen } from './screens/MainMenuScreen'
import { QuickGameScreen } from './screens/QuickGameScreen'
import { DuelScreen } from './screens/DuelScreen'
import { AuthScreen } from './screens/AuthScreen'
import { MatchScreen } from './screens/MatchScreen'

export default function App() {
  const screen = useUIStore(s => s.screen)
  const { initialize, loading } = useAuthStore()

  useEffect(() => {
    initialize()
  }, [initialize])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
      </div>
    )
  }

  switch (screen) {
    case 'intro':
      return <IntroScreen />
    case 'auth':
      return <AuthScreen />
    case 'main-menu':
      return <MainMenuScreen />
    case 'quick-game':
      return <QuickGameScreen />
    case 'duel':
      return <DuelScreen />
    case 'match':
      return <MatchScreen />
    default:
      return <IntroScreen />
  }
}
