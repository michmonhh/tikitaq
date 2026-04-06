import { useUIStore } from '../stores/uiStore'
import { useAuthStore } from '../stores/authStore'
import { Button } from '../components/Button'
import styles from './MainMenuScreen.module.css'

export function MainMenuScreen() {
  const navigate = useUIStore(s => s.navigate)
  const { user, username, signOut } = useAuthStore()

  const menuItems = [
    { label: 'QUICK GAME', screen: 'quick-game' as const, description: 'Play vs AI' },
    { label: 'DUEL', screen: 'duel' as const, description: 'Play vs Friends' },
    { label: 'SEASON', screen: 'main-menu' as const, description: 'Coming Soon', disabled: true },
    { label: 'WORLD LEAGUE', screen: 'main-menu' as const, description: 'Coming Soon', disabled: true },
  ]

  const handleLogout = async () => {
    await signOut()
    navigate('intro')
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <img src="/tikitaq.svg" alt="TIKITAQ" className={styles.logo} />
      </div>

      <nav className={styles.menu}>
        {menuItems.map(item => (
          <button
            key={item.label}
            className={`${styles.menuItem} ${item.disabled ? styles.disabled : ''}`}
            onClick={() => !item.disabled && navigate(item.screen)}
            disabled={item.disabled}
          >
            <span className={styles.menuLabel}>{item.label}</span>
            <span className={styles.menuDesc}>{item.description}</span>
          </button>
        ))}
      </nav>

      {user && (
        <div className={styles.userBar}>
          <span className={styles.username}>{username || user.email}</span>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      )}
    </div>
  )
}
