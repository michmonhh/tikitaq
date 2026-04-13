/**
 * TEAM EDITOR — Development/Admin tool
 * This entire file can be safely deleted to remove the editor.
 * Also remove the button in MainMenuScreen that opens it.
 */
import { useState, useEffect } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'
import { TEAMS } from '../data/teams'
import { TEAM_ROSTERS, type PlayerTemplate } from '../data/players'
import type { PlayerStats } from '../engine/types'
import type { CustomTeamData } from '../data/teamOverrides'
import styles from './TeamEditor.module.css'

const STORAGE_KEY = 'tikitaq_custom_teams'

function loadCustomTeams(): Record<number, CustomTeamData> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return {}
}

function saveCustomTeams(data: Record<number, CustomTeamData>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

const STAT_KEYS: { key: keyof PlayerStats; label: string }[] = [
  { key: 'pacing', label: 'PAC' },
  { key: 'finishing', label: 'FIN' },
  { key: 'shortPassing', label: 'SPA' },
  { key: 'highPassing', label: 'HPA' },
  { key: 'tackling', label: 'TAC' },
  { key: 'defensiveRadius', label: 'DEF' },
  { key: 'ballShielding', label: 'SHI' },
  { key: 'quality', label: 'QUA' },
]

interface TeamEditorProps {
  open: boolean
  onClose: () => void
}

export function TeamEditor({ open, onClose }: TeamEditorProps) {
  const [selectedTeamId, setSelectedTeamId] = useState(0)
  const [color, setColor] = useState('#dc052d')
  const [roster, setRoster] = useState<PlayerTemplate[]>([])
  const [saved, setSaved] = useState(false)

  // Load team data when selection changes
  useEffect(() => {
    const custom = loadCustomTeams()
    const team = TEAMS.find(t => t.id === selectedTeamId)
    const customData = custom[selectedTeamId]

    setColor(customData?.color ?? team?.color ?? '#888888')
    setRoster(customData?.roster ?? TEAM_ROSTERS[selectedTeamId] ?? [])
    setSaved(false)
  }, [selectedTeamId])

  const updatePlayer = (index: number, field: string, value: string | number) => {
    setRoster(prev => prev.map((p, i) => {
      if (i !== index) return p
      if (field === 'firstName') return { ...p, firstName: value as string }
      if (field === 'lastName') return { ...p, lastName: value as string }
      // Stat field
      return { ...p, stats: { ...p.stats, [field]: Math.max(1, Math.min(99, Number(value))) } }
    }))
    setSaved(false)
  }

  const handleSave = () => {
    const all = loadCustomTeams()
    all[selectedTeamId] = { color, roster }
    saveCustomTeams(all)
    setSaved(true)
  }

  const handleReset = () => {
    const all = loadCustomTeams()
    delete all[selectedTeamId]
    saveCustomTeams(all)

    const team = TEAMS.find(t => t.id === selectedTeamId)
    setColor(team?.color ?? '#888888')
    setRoster(TEAM_ROSTERS[selectedTeamId] ?? [])
    setSaved(true)
  }

  return (
    <Modal open={open} onClose={onClose} title="Team Editor">
      <div className={styles.editor}>
        {/* Team selector */}
        <div className={styles.teamSelect}>
          <select
            value={selectedTeamId}
            onChange={e => setSelectedTeamId(Number(e.target.value))}
            className={styles.select}
          >
            {TEAMS.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>

          <div className={styles.colorPicker}>
            <label className={styles.colorLabel}>Disc Color</label>
            <input
              type="color"
              value={color}
              onChange={e => { setColor(e.target.value); setSaved(false) }}
              className={styles.colorInput}
            />
          </div>
        </div>

        {/* Player list */}
        <div className={styles.playerList}>
          <div className={styles.headerRow}>
            <span className={styles.colPos}>Pos</span>
            <span className={styles.colName}>First Name</span>
            <span className={styles.colName}>Last Name</span>
            {STAT_KEYS.map(s => (
              <span key={s.key} className={styles.colStat}>{s.label}</span>
            ))}
          </div>

          {roster.map((player, idx) => (
            <div key={idx} className={styles.playerRow}>
              <span className={styles.colPos}>{player.positionLabel}</span>
              <input
                className={styles.nameInput}
                value={player.firstName}
                onChange={e => updatePlayer(idx, 'firstName', e.target.value)}
              />
              <input
                className={styles.nameInput}
                value={player.lastName}
                onChange={e => updatePlayer(idx, 'lastName', e.target.value)}
              />
              {STAT_KEYS.map(s => (
                <input
                  key={s.key}
                  type="number"
                  min={1}
                  max={99}
                  className={styles.statInput}
                  value={player.stats[s.key]}
                  onChange={e => updatePlayer(idx, s.key, e.target.value)}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className={styles.actions}>
          <Button variant="ghost" size="sm" onClick={handleReset}>
            Reset to Default
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave}>
            {saved ? 'Saved!' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
