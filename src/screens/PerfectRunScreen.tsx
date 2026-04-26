import { useEffect, useState } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useAuthStore } from '../stores/authStore'
import { usePerfectRunStore, type Campaign } from '../stores/perfectRunStore'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { TeamSelector } from '../components/TeamSelector'
import { getTeamById } from '../data/teams'
import styles from './PerfectRunScreen.module.css'

export function PerfectRunScreen() {
  const { navigate, startPlanning } = useUIStore()
  const userId = useAuthStore(s => s.user?.id)
  const { xp, campaigns, loading, error, load, startCampaign, deleteActiveCampaign } = usePerfectRunStore()

  const [picking, setPicking] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pendingTeamId, setPendingTeamId] = useState<number | null>(null)

  useEffect(() => {
    if (userId) load(userId)
  }, [userId, load])

  const active = campaigns.find(c => c.status === 'active') ?? null
  const history = campaigns.filter(c => c.status !== 'active')

  const handleStart = async (teamId: number) => {
    if (!userId) return
    setPendingTeamId(teamId)
    const campaign = await startCampaign(userId, teamId)
    setPendingTeamId(null)
    setPicking(false)
    if (campaign) {
      launchNextMatch(campaign)
    }
  }

  const launchNextMatch = (campaign: Campaign) => {
    const opponentId = campaign.opponentOrder[campaign.opponentsBeaten]
    if (opponentId == null) return
    startPlanning({
      team1Id: campaign.teamId,
      team2Id: opponentId,
      isVsAI: true,
      isDuel: false,
      campaignId: campaign.id,
      mustDecide: true,  // Perfect Run braucht ein klares Ergebnis → ET + Elfmeterschießen
    })
  }

  const handleDelete = async () => {
    if (!userId) return
    await deleteActiveCampaign(userId)
    setConfirmDelete(false)
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('main-menu')}>
          &larr; Back
        </button>
        <h1 className={styles.title}>Perfect Run</h1>
        <div className={styles.xp}>
          <span className={styles.xpValue}>{xp}</span>
          <span className={styles.xpLabel}>XP</span>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {loading && !campaigns.length ? (
        <p className={styles.muted}>Loading…</p>
      ) : (
        <div className={styles.content}>
          {active ? (
            <ActiveCampaignCard
              campaign={active}
              onContinue={() => launchNextMatch(active)}
              onDelete={() => setConfirmDelete(true)}
            />
          ) : (
            <div className={styles.startCard}>
              <p className={styles.startIntro}>
                Beat every team in the league, from weakest to strongest. One loss ends the run.
              </p>
              <Button variant="primary" size="lg" onClick={() => setPicking(true)}>
                Start new campaign
              </Button>
            </div>
          )}

          {history.length > 0 && (
            <section className={styles.history}>
              <h2 className={styles.sectionTitle}>History</h2>
              <ul className={styles.historyList}>
                {history.map(c => (
                  <HistoryRow key={c.id} campaign={c} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <Modal open={picking} onClose={() => setPicking(false)} title="Choose your team">
        {pendingTeamId != null ? (
          <p className={styles.muted}>Starting campaign…</p>
        ) : (
          <TeamSelector selectedId={null} onSelect={handleStart} />
        )}
      </Modal>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete campaign?">
        <p className={styles.confirmText}>
          Your current Perfect Run will be discarded. This does not count as a loss and won't appear in history.
        </p>
        <div className={styles.confirmActions}>
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Delete</Button>
        </div>
      </Modal>
    </div>
  )
}

function ActiveCampaignCard({
  campaign,
  onContinue,
  onDelete,
}: {
  campaign: Campaign
  onContinue: () => void
  onDelete: () => void
}) {
  const myTeam = getTeamById(campaign.teamId)
  const total = campaign.opponentOrder.length
  const nextOpponentId = campaign.opponentOrder[campaign.opponentsBeaten]
  const nextOpponent = nextOpponentId != null ? getTeamById(nextOpponentId) : null

  return (
    <div className={styles.activeCard} style={{ '--tc': myTeam?.color } as React.CSSProperties}>
      <div className={styles.activeHeader}>
        {myTeam && (
          <img src={`/${myTeam.shortName.toLowerCase()}.svg`} alt={myTeam.name} className={styles.teamLogo} />
        )}
        <div className={styles.activeMeta}>
          <div className={styles.teamName}>{myTeam?.name ?? '—'}</div>
          <div className={styles.activeLabel}>Active campaign</div>
        </div>
      </div>

      <div className={styles.statsRow}>
        <Stat label="Progress" value={`${campaign.opponentsBeaten}/${total}`} />
        <Stat label="Goals" value={`${campaign.goalsFor}:${campaign.goalsAgainst}`} />
        <Stat label="Next" value={nextOpponent?.shortName ?? '—'} />
      </div>

      <div className={styles.activeActions}>
        <Button variant="primary" size="lg" onClick={onContinue} className={styles.continueBtn}>
          {nextOpponent ? `Continue vs ${nextOpponent.shortName}` : 'Continue'}
        </Button>
        <Button variant="ghost" onClick={onDelete}>Delete</Button>
      </div>
    </div>
  )
}

function HistoryRow({ campaign }: { campaign: Campaign }) {
  const myTeam = getTeamById(campaign.teamId)
  const eliminatedBy = campaign.eliminatedByTeamId != null ? getTeamById(campaign.eliminatedByTeamId) : null
  const total = campaign.opponentOrder.length
  const isCompleted = campaign.status === 'completed'

  return (
    <li className={styles.historyRow} style={{ '--tc': myTeam?.color } as React.CSSProperties}>
      <div className={styles.historyLeft}>
        {myTeam && (
          <img src={`/${myTeam.shortName.toLowerCase()}.svg`} alt={myTeam.name} className={styles.historyLogo} />
        )}
        <div>
          <div className={styles.historyTeam}>{myTeam?.shortName ?? '—'}</div>
          <div className={`${styles.historyStatus} ${isCompleted ? styles.ok : styles.bad}`}>
            {isCompleted ? 'Completed' : eliminatedBy ? `Lost vs ${eliminatedBy.shortName}` : 'Failed'}
          </div>
        </div>
      </div>
      <div className={styles.historyRight}>
        <span>{campaign.opponentsBeaten}/{total}</span>
        <span>{campaign.goalsFor}:{campaign.goalsAgainst}</span>
      </div>
    </li>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  )
}
