import { useGameStore } from '../../stores/gameStore'
import type { GameStore } from '../../stores/gameStore/types'
import styles from '../GameSidebar.module.css'

function RuleToggle({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div className={styles.ruleRow}>
      <div className={styles.ruleInfo}>
        <span className={styles.ruleLabel}>{label}</span>
        <span className={styles.ruleDesc}>{description}</span>
      </div>
      <button
        className={`${styles.ruleToggle} ${checked ? styles.ruleToggleOn : ''}`}
        onClick={() => onChange(!checked)}
        aria-checked={checked}
        role="switch"
      >
        <span className={styles.ruleToggleThumb} />
      </button>
    </div>
  )
}

type TackleMode = GameStore['gameSettings']['showTackleRadii']
const TACKLE_MODES: readonly TackleMode[] = ['off', 'dragging', 'always'] as const
const TACKLE_LABELS: Record<TackleMode, string> = {
  off: 'Aus',
  dragging: 'Beim Zug',
  always: 'Immer',
}

function RuleCycleTackle({ label, description, value, onChange }: {
  label: string; description: string; value: TackleMode; onChange: (v: TackleMode) => void
}) {
  const idx = TACKLE_MODES.indexOf(value)
  const next = TACKLE_MODES[(idx + 1) % TACKLE_MODES.length]
  return (
    <div className={styles.ruleRow}>
      <div className={styles.ruleInfo}>
        <span className={styles.ruleLabel}>{label}</span>
        <span className={styles.ruleDesc}>{description}</span>
      </div>
      <button
        className={`${styles.ruleCycle} ${value !== 'off' ? styles.ruleCycleOn : ''}`}
        onClick={() => onChange(next)}
      >
        {TACKLE_LABELS[value]}
      </button>
    </div>
  )
}

export function RulesPanel() {
  const gameSettings = useGameStore(s => s.gameSettings)
  const setGameSetting = useGameStore(s => s.setGameSetting)

  return (
    <div className={styles.rulesPanel}>
      <RuleToggle
        label="1 Tackling / Zug"
        description="Nur ein Tackling-Versuch pro Spielzug erlaubt."
        checked={gameSettings.oneTacklePerTurn}
        onChange={(v) => setGameSetting('oneTacklePerTurn', v)}
      />
      <RuleToggle
        label="Doppelpass"
        description="Zwei Pässe pro Spielzug erlauben."
        checked={gameSettings.allowDoublePass}
        onChange={(v) => setGameSetting('allowDoublePass', v)}
      />
      <RuleToggle
        label="Tackling-Sperre"
        description="Getackelter Spieler kann sich im nächsten Zug nicht bewegen."
        checked={gameSettings.tacklingLock}
        onChange={(v) => setGameSetting('tacklingLock', v)}
      />
      <RuleToggle
        label="Bewegungsradien"
        description="Reichweite aller Spieler anzeigen, wenn gezogen wird."
        checked={gameSettings.showMovementRadii}
        onChange={(v) => setGameSetting('showMovementRadii', v)}
      />
      <RuleCycleTackle
        label="Abwehrradien"
        description="Tackle-Reichweite der Gegner (Aus / Beim Zug / Immer)."
        value={gameSettings.showTackleRadii}
        onChange={(v) => setGameSetting('showTackleRadii', v)}
      />
    </div>
  )
}
