import { useUIStore } from '../stores/uiStore'
import styles from './MainMenuScreen.module.css'

export function MainMenuScreen() {
  const navigate = useUIStore(s => s.navigate)

  const menuItems = [
    { label: 'QUICK GAME', screen: 'quick-game' as const, description: 'Play vs AI' },
    { label: 'DUEL', screen: 'duel' as const, description: 'Play vs Friends' },
    { label: 'SEASON', screen: 'main-menu' as const, description: 'Coming Soon', disabled: true },
    { label: 'WORLD LEAGUE', screen: 'main-menu' as const, description: 'Coming Soon', disabled: true },
  ]

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
    </div>
  )
}
