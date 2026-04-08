import { useEffect } from 'react'
import { useUIStore } from './stores/uiStore'
import { useAuthStore } from './stores/authStore'
import { IntroScreen } from './screens/IntroScreen'
import { MainMenuScreen } from './screens/MainMenuScreen'
import { QuickGameScreen } from './screens/QuickGameScreen'
import { DuelScreen } from './screens/DuelScreen'
import { AuthScreen } from './screens/AuthScreen'
import { MatchScreen } from './screens/MatchScreen'

const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

export default function App() {
  const screen = useUIStore(s => s.screen)
  const navigate = useUIStore(s => s.navigate)
  const { initialize, loading, user } = useAuthStore()

  useEffect(() => {
    initialize()
  }, [initialize])

  // After successful login, go to main menu
  useEffect(() => {
    if (user && screen === 'auth') {
      navigate('main-menu')
    }
  }, [user, screen, navigate])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
      </div>
    )
  }

  // Auth gate: require login for everything unless on localhost
  if (!user && !isLocalhost) {
    return <AuthScreen />
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
