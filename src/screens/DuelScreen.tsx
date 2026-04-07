import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useUIStore } from '../stores/uiStore'
import { supabase } from '../lib/supabase'
import { Button } from '../components/Button'
import { TeamSelector } from '../components/TeamSelector'
import { Modal } from '../components/Modal'
import { TEAMS, getTeamById } from '../data/teams'
import styles from './DuelScreen.module.css'

interface Invitation {
  id: string
  from_user_id: string
  from_username: string
  team1_id: number
  team2_id: number
  created_at: string
}

interface ActiveMatch {
  id: string
  player1_id: string
  player2_id: string
  current_turn_id: string
  team1_abbr: string
  team2_abbr: string
  status: string
}

export function DuelScreen() {
  const navigate = useUIStore(s => s.navigate)
  const startMatch = useUIStore(s => s.startMatch)
  const { user, username } = useAuthStore()

  const [searchUsername, setSearchUsername] = useState('')
  const [inviteTeamId, setInviteTeamId] = useState(1)
  const [showTeamSelect, setShowTeamSelect] = useState(false)
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [activeMatches, setActiveMatches] = useState<ActiveMatch[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmQuit, setConfirmQuit] = useState<ActiveMatch | null>(null)

  // Load invitations and active matches
  useEffect(() => {
    if (!user) return

    const loadData = async () => {
      const { data: invites } = await supabase
        .from('invitations')
        .select('*')
        .eq('to_user_id', user.id)
        .eq('status', 'pending')

      if (invites) setInvitations(invites)

      const { data: matches } = await supabase
        .from('matches')
        .select('*')
        .eq('status', 'active')
        .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)

      if (matches) setActiveMatches(matches)
    }

    loadData()

    const inviteChannel = supabase
      .channel('invitations')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'invitations',
        filter: `to_user_id=eq.${user.id}`,
      }, () => loadData())
      .subscribe()

    const matchChannel = supabase
      .channel('matches')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'matches',
      }, () => loadData())
      .subscribe()

    return () => {
      inviteChannel.unsubscribe()
      matchChannel.unsubscribe()
    }
  }, [user])

  const sendInvite = async () => {
    if (!user || !searchUsername.trim()) return
    setSending(true)
    setError(null)

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', searchUsername.trim())
      .single()

    if (!profile) {
      setError('User not found')
      setSending(false)
      return
    }

    const { error: insertError } = await supabase
      .from('invitations')
      .insert({
        from_user_id: user.id,
        to_user_id: profile.id,
        from_username: username,
        team1_id: inviteTeamId,
        status: 'pending',
      })

    if (insertError) setError(insertError.message)
    else setSearchUsername('')

    setSending(false)
  }

  const acceptInvite = async (invite: Invitation) => {
    if (!user) return

    const team1 = getTeamById(invite.team1_id)
    const { error: matchError } = await supabase
      .from('matches')
      .insert({
        player1_id: invite.from_user_id,
        player2_id: user.id,
        current_turn_id: invite.from_user_id,
        team1_abbr: team1?.shortName ?? 'T1',
        team2_abbr: 'T2',
        status: 'active',
      })

    if (!matchError) {
      await supabase.from('invitations').delete().eq('id', invite.id)
    }
  }

  const declineInvite = async (invite: Invitation) => {
    await supabase.from('invitations').delete().eq('id', invite.id)
  }

  const quitMatch = async () => {
    if (!confirmQuit) return

    await supabase
      .from('matches')
      .update({ status: 'abandoned' })
      .eq('id', confirmQuit.id)

    setActiveMatches(prev => prev.filter(m => m.id !== confirmQuit.id))
    setConfirmQuit(null)
  }

  const openMatch = (match: ActiveMatch) => {
    const team1 = TEAMS.find(t => t.shortName === match.team1_abbr)
    const team2 = TEAMS.find(t => t.shortName === match.team2_abbr)

    startMatch({
      team1Id: team1?.id ?? 0,
      team2Id: team2?.id ?? 1,
      isVsAI: false,
      isDuel: true,
      matchId: match.id,
    })
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('main-menu')}>
          &larr; Back
        </button>
        <h1 className={styles.title}>Duel Mode</h1>
      </div>

      <div className={styles.sections}>
        {/* Invite Section */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Invite Player</h2>
          <div className={styles.inviteForm}>
            <input
              type="text"
              value={searchUsername}
              onChange={e => setSearchUsername(e.target.value)}
              placeholder="Enter username..."
              className={styles.input}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowTeamSelect(true)}
            >
              {getTeamById(inviteTeamId)?.shortName ?? 'Team'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={sendInvite}
              disabled={sending || !searchUsername.trim()}
            >
              Send
            </Button>
          </div>
          {error && <p className={styles.error}>{error}</p>}
        </section>

        {/* Invitations */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Invitations ({invitations.length})</h2>
          {invitations.length === 0 && <p className={styles.empty}>No pending invitations</p>}
          {invitations.map(inv => (
            <div key={inv.id} className={styles.inviteItem}>
              <span className={styles.inviteFrom}>{inv.from_username}</span>
              <span className={styles.inviteTeam}>{getTeamById(inv.team1_id)?.shortName}</span>
              <div className={styles.inviteActions}>
                <Button variant="primary" size="sm" onClick={() => acceptInvite(inv)}>Accept</Button>
                <Button variant="ghost" size="sm" onClick={() => declineInvite(inv)}>Decline</Button>
              </div>
            </div>
          ))}
        </section>

        {/* Active Matches */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Active Matches ({activeMatches.length})</h2>
          {activeMatches.length === 0 && <p className={styles.empty}>No active matches</p>}
          {activeMatches.map(match => {
            const isMyTurn = match.current_turn_id === user?.id
            return (
              <div key={match.id} className={styles.matchItem}>
                <div className={styles.matchInfo} onClick={() => openMatch(match)}>
                  <span className={styles.matchTeams}>
                    {match.team1_abbr} vs {match.team2_abbr}
                  </span>
                  <span className={`${styles.turnBadge} ${isMyTurn ? styles.myTurn : ''}`}>
                    {isMyTurn ? 'YOUR TURN' : 'WAITING'}
                  </span>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); setConfirmQuit(match) }}
                >
                  Quit
                </Button>
              </div>
            )
          })}
        </section>
      </div>

      {/* Team Selection Modal */}
      <Modal
        open={showTeamSelect}
        onClose={() => setShowTeamSelect(false)}
        title="Select Your Team"
      >
        <TeamSelector
          selectedId={inviteTeamId}
          onSelect={(id) => { setInviteTeamId(id); setShowTeamSelect(false) }}
        />
      </Modal>

      {/* Quit Confirmation Modal */}
      <Modal
        open={confirmQuit !== null}
        onClose={() => setConfirmQuit(null)}
        title="Quit Match?"
      >
        <div className={styles.confirmContent}>
          <p>
            Are you sure you want to quit <strong>{confirmQuit?.team1_abbr} vs {confirmQuit?.team2_abbr}</strong>?
          </p>
          <p className={styles.confirmWarning}>This will end the match for both players. This action cannot be undone.</p>
          <div className={styles.confirmActions}>
            <Button variant="ghost" onClick={() => setConfirmQuit(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={quitMatch}>
              Quit Match
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
