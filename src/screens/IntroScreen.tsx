import { useUIStore } from '../stores/uiStore'
import { Button } from '../components/Button'
import styles from './IntroScreen.module.css'

export function IntroScreen() {
  const navigate = useUIStore(s => s.navigate)

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <img src="/logo.svg" alt="TIKITAQ" className={styles.logo} />
        <h1 className={styles.title}>TIKITAQ</h1>
        <p className={styles.subtitle}>Turn-based tactics on grass</p>

        <Button
          variant="primary"
          size="lg"
          onClick={() => navigate('main-menu')}
          className={styles.playBtn}
        >
          PLAY
        </Button>
      </div>

      <div className={styles.bg} />
    </div>
  )
}
