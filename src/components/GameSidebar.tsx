import { useState } from 'react'
import { useGameStore } from '../stores/gameStore'
import type { TeamMatchStats } from '../engine/types'
import styles from './GameSidebar.module.css'

type SidebarTab = 'stats' | 'ticker' | 'bench' | 'rules'

interface GameSidebarProps {
  team1Name: string
  team2Name: string
  team1Color: string
  team2Color: string
  onBack: () => void
}

// Real pitch: 105m x 68m. Game coords: 100x100. 1 game unit ≈ 1.05m (length) / 0.68m (width). Average ≈ 0.865m
const GAME_UNIT_TO_METERS = 0.865

export function GameSidebar({ team1Name, team2Name, team1Color, team2Color, onBack }: GameSidebarProps) {
  const state = useGameStore(s => s.state)
  const selectedPlayerId = useGameStore(s => s.selectedPlayerId)
  const isDuel = useGameStore(s => s.isDuel)
  const localTeam = useGameStore(s => s.localTeam)
  const [activeTab, setActiveTab] = useState<SidebarTab>('stats')

  if (!state) return null

  const isTeam1Turn = state.currentTurn === 1
  const isKickoff = state.phase === 'kickoff'
  const isFreeKick = state.phase === 'free_kick'
  const isCorner = state.phase === 'corner'
  const isThrowIn = state.phase === 'throw_in'
  const isSetupPhase = isKickoff || isFreeKick || isCorner || isThrowIn

  const selectedPlayer = selectedPlayerId
    ? state.players.find(p => p.id === selectedPlayerId)
    : null

  // Scoreboard order: local team on top (mirrors the pitch perspective)
  const mirrored = localTeam === 2
  const topName  = mirrored ? team2Name  : team1Name
  const topColor = mirrored ? team2Color : team1Color
  const topScore = mirrored ? state.score.team2 : state.score.team1
  const topTurn  = mirrored ? !isTeam1Turn : isTeam1Turn
  const botName  = mirrored ? team1Name  : team2Name
  const botColor = mirrored ? team1Color : team2Color
  const botScore = mirrored ? state.score.team1 : state.score.team2
  const botTurn  = mirrored ? isTeam1Turn : !isTeam1Turn

  return (
    <div className={styles.sidebar}>
      <button className={styles.backBtn} onClick={onBack}>&larr; Back</button>

      {/* Scoreboard */}
      <div className={styles.scoreboard}>
        <div className={`${styles.team} ${topTurn ? styles.activeTurn : ''}`}>
          <div className={styles.teamDot} style={{ background: topColor }} />
          <span className={styles.teamName}>{topName}</span>
          <span className={styles.score}>{topScore}</span>
        </div>
        <div className={styles.divider}>
          <span className={styles.time}>{state.gameTime}'</span>
          <span className={styles.half}>{state.half === 1 ? '1st' : '2nd'} Half</span>
        </div>
        <div className={`${styles.team} ${botTurn ? styles.activeTurn : ''}`}>
          <div className={styles.teamDot} style={{ background: botColor }} />
          <span className={styles.teamName}>{botName}</span>
          <span className={styles.score}>{botScore}</span>
        </div>
      </div>

      <div className={styles.turnInfo}>
        <div className={styles.turnBadge} style={{ background: isTeam1Turn ? team1Color : team2Color }}>
          {isKickoff ? 'Kickoff' : isFreeKick ? 'Free Kick' : isCorner ? 'Corner' : isThrowIn ? 'Throw In' : `${isTeam1Turn ? team1Name : team2Name}'s Turn`}
        </div>
      </div>

      {/* Content area */}
      {selectedPlayer ? (
        <PlayerPanel player={selectedPlayer} />
      ) : (
        <>
          <div className={styles.tabs}>
            <button className={`${styles.tab} ${activeTab === 'stats' ? styles.activeTab : ''}`} onClick={() => setActiveTab('stats')}>Stats</button>
            <button className={`${styles.tab} ${activeTab === 'ticker' ? styles.activeTab : ''}`} onClick={() => setActiveTab('ticker')}>Ticker</button>
            <button className={`${styles.tab} ${activeTab === 'bench' ? styles.activeTab : ''}`} onClick={() => setActiveTab('bench')}>Bench</button>
            {!isDuel && <button className={`${styles.tab} ${activeTab === 'rules' ? styles.activeTab : ''}`} onClick={() => setActiveTab('rules')}>Rules</button>}
          </div>
          <div className={styles.tabContent}>
            {activeTab === 'stats' && (
              <StatsPanel
                stats1={mirrored ? state.matchStats.team2 : state.matchStats.team1}
                stats2={mirrored ? state.matchStats.team1 : state.matchStats.team2}
                team1Name={topName}
                team2Name={botName}
                team1Color={topColor}
                team2Color={botColor}
                turns1={mirrored ? state.totalTurns.team2 : state.totalTurns.team1}
                turns2={mirrored ? state.totalTurns.team1 : state.totalTurns.team2}
              />
            )}
            {activeTab === 'ticker' && <TickerPanel ticker={state.ticker} />}
            {activeTab === 'bench' && <BenchPanel />}
            {!isDuel && activeTab === 'rules' && <RulesPanel />}
          </div>
        </>
      )}

      {state.phase === 'full_time' && (
        <div className={styles.gameOver}>
          <h3>Full Time</h3>
          <p>{topScore} - {botScore}</p>
        </div>
      )}
    </div>
  )
}

// --- Player Info Panel ---
function PlayerPanel({ player }: { player: import('../engine/types').PlayerData }) {
  const aiReasoning = useGameStore(s => s.aiReasoning)
  const reasoning = aiReasoning.get(player.id)

  const STAT_KEYS = [
    { key: 'pacing' as const, label: 'PAC' },
    { key: 'finishing' as const, label: 'FIN' },
    { key: 'shortPassing' as const, label: 'SPA' },
    { key: 'highPassing' as const, label: 'HPA' },
    { key: 'tackling' as const, label: 'TAC' },
    { key: 'defensiveRadius' as const, label: 'DEF' },
    { key: 'ballShielding' as const, label: 'SHI' },
    { key: 'quality' as const, label: 'QUA' },
  ]

  return (
    <div className={styles.playerInfo}>
      <div className={styles.playerHeader}>
        <span className={styles.playerPosition}>{player.positionLabel}</span>
        <span className={styles.playerName}>{player.firstName} {player.lastName}</span>
      </div>
      {reasoning && (
        <div className={styles.aiReasoning}>
          <span className={styles.aiReasoningLabel}>KI-Entscheidung</span>
          <span className={styles.aiReasoningText}>{reasoning}</span>
        </div>
      )}
      <StatBar label="FIT" value={Math.round(player.fitness)} />
      <StatBar label="CONF" value={Math.round(player.confidence)} />
      <div className={styles.statsGrid}>
        {STAT_KEYS.map(s => (
          <StatBar key={s.key} label={s.label} value={player.stats[s.key]} />
        ))}
      </div>
      <div className={styles.matchStatsCompact}>
        <MiniStat label="Goals" value={player.gameStats.goalsScored} />
        <MiniStat label="Passes" value={player.gameStats.passes} />
        <MiniStat label="Tackles" value={player.gameStats.tacklesWon} />
        <MiniStat label="Saves" value={player.gameStats.saves} />
      </div>
    </div>
  )
}

// --- Match Stats Panel ---
function StatsPanel({ stats1, stats2, team1Name, team2Name, team1Color, team2Color, turns1, turns2 }: {
  stats1: TeamMatchStats; stats2: TeamMatchStats
  team1Name: string; team2Name: string
  team1Color: string; team2Color: string
  turns1: number; turns2: number
}) {
  const totalTurns = turns1 + turns2
  const poss1 = totalTurns > 0 ? Math.round((stats1.possession / Math.max(1, totalTurns)) * 100) : 50
  const poss2 = 100 - poss1

  return (
    <div className={styles.statsPanel}>
      <div className={styles.statsPanelHeader}>
        <span style={{ color: team1Color }}>{team1Name}</span>
        <span style={{ color: team2Color }}>{team2Name}</span>
      </div>
      <ComparisonRow label="xG" v1={stats1.xG.toFixed(2)} v2={stats2.xG.toFixed(2)} />
      <ComparisonBar label="Possession" v1={poss1} v2={poss2} c1={team1Color} c2={team2Color} unit="%" />
      <ComparisonRow label="Shots (on)" v1={`${stats1.shotsOnTarget + stats1.shotsOff} (${stats1.shotsOnTarget})`} v2={`${stats2.shotsOnTarget + stats2.shotsOff} (${stats2.shotsOnTarget})`} />
      <ComparisonRow label="Passes" v1={`${stats1.passesCompleted}/${stats1.passesTotal}`} v2={`${stats2.passesCompleted}/${stats2.passesTotal}`} />
      <ComparisonRow label="Tackles won" v1={String(stats1.tacklesWon)} v2={String(stats2.tacklesWon)} />
      <ComparisonRow label="Distance" v1={`${Math.round(stats1.distanceCovered * GAME_UNIT_TO_METERS)}m`} v2={`${Math.round(stats2.distanceCovered * GAME_UNIT_TO_METERS)}m`} />
      <ComparisonRow label="Corners" v1={String(stats1.corners)} v2={String(stats2.corners)} />
      <ComparisonRow label="Fouls" v1={String(stats1.fouls)} v2={String(stats2.fouls)} />
      <ComparisonRow label="Yellow" v1={String(stats1.yellowCards)} v2={String(stats2.yellowCards)} />
      <ComparisonRow label="Red" v1={String(stats1.redCards)} v2={String(stats2.redCards)} />
    </div>
  )
}

// --- Ticker Panel ---
/** Map event types to highlight CSS classes */
function getTickerHighlightClass(type: string): string {
  switch (type) {
    case 'shot_scored':
    case 'penalty_scored':
      return styles.tickerGoal
    case 'penalty':
    case 'penalty_saved':
    case 'penalty_missed':
      return styles.tickerPenalty
    case 'yellow_card':
      return styles.tickerYellow
    case 'red_card':
      return styles.tickerRed
    case 'tactic_change':
      return styles.tickerTactic
    case 'kickoff':
    case 'half_time':
      return styles.tickerKickoff
    default:
      return ''
  }
}

function TickerPanel({ ticker }: { ticker: import('../engine/types').TickerEntry[] }) {
  return (
    <div className={styles.tickerPanel}>
      {ticker.length === 0 && <span className={styles.emptyText}>No events yet</span>}
      {[...ticker].reverse().map((entry, i) => (
        <div key={i} className={`${styles.tickerEntry} ${getTickerHighlightClass(entry.type)}`}>
          <span className={styles.tickerMinute}>{entry.minute}'</span>
          <span className={styles.tickerMessage}>{entry.message}</span>
        </div>
      ))}
    </div>
  )
}

// --- Bench Panel (placeholder) ---
function BenchPanel() {
  return (
    <div className={styles.benchPanel}>
      <span className={styles.emptyText}>No substitutes available</span>
    </div>
  )
}

// --- Rules Panel ---
function RulesPanel() {
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
    </div>
  )
}

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

// --- UI Components ---
function StatBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value))
  const color = pct >= 80 ? '#4caf50' : pct >= 60 ? '#ffc107' : '#f44336'
  return (
    <div className={styles.statBar}>
      <span className={styles.statLabel}>{label}</span>
      <div className={styles.statTrack}>
        <div className={styles.statFill} style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className={styles.statValue}>{value}</span>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.miniStat}>
      <span className={styles.miniStatValue}>{value}</span>
      <span className={styles.miniStatLabel}>{label}</span>
    </div>
  )
}

function ComparisonRow({ label, v1, v2 }: { label: string; v1: string; v2: string }) {
  return (
    <div className={styles.compRow}>
      <span className={styles.compValue}>{v1}</span>
      <span className={styles.compLabel}>{label}</span>
      <span className={styles.compValue}>{v2}</span>
    </div>
  )
}

function ComparisonBar({ label, v1, v2, c1, c2, unit }: { label: string; v1: number; v2: number; c1: string; c2: string; unit?: string }) {
  return (
    <div className={styles.compBarWrap}>
      <div className={styles.compRow}>
        <span className={styles.compValue}>{v1}{unit}</span>
        <span className={styles.compLabel}>{label}</span>
        <span className={styles.compValue}>{v2}{unit}</span>
      </div>
      <div className={styles.compBar}>
        <div className={styles.compBarFill} style={{ width: `${v1}%`, background: c1 }} />
        <div className={styles.compBarFill} style={{ width: `${v2}%`, background: c2 }} />
      </div>
    </div>
  )
}
