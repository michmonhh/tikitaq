import { useEffect } from 'react'
import { useUIStore } from './stores/uiStore'
import { useAuthStore } from './stores/authStore'
import { IntroScreen } from './screens/IntroScreen'
import { MainMenuScreen } from './screens/MainMenuScreen'
import { QuickGameScreen } from './screens/QuickGameScreen'
import { DuelScreen } from './screens/DuelScreen'
import { PerfectRunScreen } from './screens/PerfectRunScreen'
import { SeasonScreen } from './screens/SeasonScreen'
import { ArenaScreen } from './screens/ArenaScreen'
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

  let content: React.ReactNode
  switch (screen) {
    case 'intro':
      content = <IntroScreen />; break
    case 'auth':
      content = <AuthScreen />; break
    case 'main-menu':
      content = <MainMenuScreen />; break
    case 'quick-game':
      content = <QuickGameScreen />; break
    case 'duel':
      content = <DuelScreen />; break
    case 'perfect-run':
      content = <PerfectRunScreen />; break
    case 'season':
      content = <SeasonScreen />; break
    case 'arena':
      content = <ArenaScreen />; break
    case 'replay':
      // Replay-Screen folgt als nächstes — erstmal zurück zur Arena.
      content = <ArenaScreen />; break
    case 'match':
      content = <MatchScreen />; break
    default:
      content = <IntroScreen />
  }

  return <>{content}</>

}
