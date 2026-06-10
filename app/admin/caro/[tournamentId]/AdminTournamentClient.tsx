'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  updateTournamentStatus,
  generateBracket,
  generateGroupStage,
  generateKnockout,
  createMatchRoom,
  setWalkover,
} from '../actions'
import type {
  CaroTournament, TournamentParticipant, TournamentMatch,
  TournamentGroup, TournamentGroupMember, TournamentStatus,
} from '../actions'

// ── Helpers ───────────────────────────────────────────────────────────────────
type Standing = {
  user_id: string; played: number; wins: number; draws: number; losses: number; points: number
}

function computeGroupStandings(
  groupId: string,
  groupMembers: TournamentGroupMember[],
  matches: TournamentMatch[],
): Standing[] {
  const members = groupMembers.filter(m => m.group_id === groupId)
  const stats: Record<string, Standing> = {}
  for (const m of members) {
    stats[m.user_id] = { user_id: m.user_id, played: 0, wins: 0, draws: 0, losses: 0, points: 0 }
  }

  const finished = matches.filter(
    m => m.group_id === groupId && (m.status === 'finished' || m.status === 'walkover'),
  )

  for (const match of finished) {
    if (!match.player_x_id || !match.player_o_id) continue
    if (!match.winner_user_id) {
      if (stats[match.player_x_id]) { stats[match.player_x_id].played++; stats[match.player_x_id].draws++; stats[match.player_x_id].points++ }
      if (stats[match.player_o_id]) { stats[match.player_o_id].played++; stats[match.player_o_id].draws++; stats[match.player_o_id].points++ }
    } else {
      if (stats[match.winner_user_id]) { stats[match.winner_user_id].played++; stats[match.winner_user_id].wins++; stats[match.winner_user_id].points += 3 }
      if (match.loser_user_id && stats[match.loser_user_id]) { stats[match.loser_user_id].played++; stats[match.loser_user_id].losses++ }
    }
  }

  return Object.values(stats).sort((a, b) =>
    b.points !== a.points ? b.points - a.points : b.wins - a.wins,
  )
}

// ── Constants ─────────────────────────────────────────────────────────────────
const MATCH_STATUS_COLOR: Record<string, string> = {
  pending: 'text-muted/60 bg-cream border-line',
  ready: 'text-teal bg-teal/10 border-teal/20',
  playing: 'text-rose bg-rose/10 border-rose/20',
  finished: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  cancelled: 'text-red-600 bg-red-50 border-red-200',
  walkover: 'text-amber-700 bg-amber-50 border-amber-200',
}

// ── Props ─────────────────────────────────────────────────────────────────────
type Props = {
  tournament: CaroTournament
  participants: TournamentParticipant[]
  matches: TournamentMatch[]
  groups: TournamentGroup[]
  groupMembers: TournamentGroupMember[]
  nameMap: Record<string, string>
}

export default function AdminTournamentClient({
  tournament, participants, matches, groups, groupMembers, nameMap,
}: Props) {
  const t = useTranslations('games.caro')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<string | null>(null)

  const activeParticipants = participants.filter(p => p.status !== 'withdrawn')
  const checkedInCount = activeParticipants.filter(p => p.status === 'checked_in').length
  const groupMatches = matches.filter(m => m.round_number === 0)
  const knockoutMatches = matches.filter(m => m.round_number >= 1)
  const rounds = Array.from(new Set(knockoutMatches.map(m => m.round_number))).sort((a, b) => a - b)

  const isGroupStage = tournament.type === 'group_stage'
  const hasGroups = groups.length > 0
  const allGroupMatchesDone = groupMatches.length > 0 && groupMatches.every(m => m.status === 'finished' || m.status === 'walkover')
  const hasKnockout = knockoutMatches.length > 0

  const [feedbackError, setFeedbackError] = useState(false)

  function showFeedback(msg: string, isError = false) {
    setFeedback(msg)
    setFeedbackError(isError)
    setTimeout(() => setFeedback(null), 4000)
  }

  async function doAction(fn: () => Promise<{ error: string } | { success: true } | null>) {
    startTransition(async () => {
      const result = await fn()
      if (result && 'error' in result) {
        showFeedback(`${t('admin_action_error_prefix')}${result.error}`, true)
      } else {
        showFeedback(t('admin_action_success'))
        router.refresh()
      }
    })
  }

  function changeStatus(newStatus: TournamentStatus, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return
    doAction(() => updateTournamentStatus(tournament.id, newStatus))
  }

  function handleGenerateBracket() {
    if (!window.confirm(t('admin_confirm_bracket'))) return
    doAction(() => generateBracket(tournament.id))
  }

  function handleGenerateGroups() {
    if (!window.confirm(t('admin_confirm_groups'))) return
    doAction(() => generateGroupStage(tournament.id))
  }

  function handleGenerateKnockout() {
    const apg = tournament.advance_per_group ?? 1
    if (!window.confirm(t('admin_confirm_knockout', { n: apg }))) return
    doAction(() => generateKnockout(tournament.id, apg))
  }

  function handleCreateRoom(matchId: string) {
    doAction(() => createMatchRoom(matchId))
  }

  function handleWalkover(matchId: string, match: TournamentMatch) {
    if (!match.player_x_id && !match.player_o_id) { showFeedback(t('admin_no_players'), true); return }
    const pxName = match.player_x_id ? (nameMap[match.player_x_id] ?? t('admin_player_x')) : null
    const poName = match.player_o_id ? (nameMap[match.player_o_id] ?? t('admin_player_o')) : null
    const choice = pxName && poName
      ? window.prompt(t('admin_walkover_prompt', { x: pxName, o: poName }))
      : null
    if (choice !== '1' && choice !== '2') return
    const winnerId = choice === '1' ? match.player_x_id! : match.player_o_id!
    if (!window.confirm(t('admin_walkover_confirm'))) return
    doAction(() => setWalkover(matchId, winnerId))
  }

  // ── Match card (shared between group + knockout) ──────────────────────────
  function MatchCard({ match }: { match: TournamentMatch }) {
    const pxName = match.player_x_id ? (nameMap[match.player_x_id] ?? match.player_x_id.slice(0, 8)) : '?'
    const poName = match.player_o_id ? (nameMap[match.player_o_id] ?? match.player_o_id.slice(0, 8)) : '?'
    const isFinished = match.status === 'finished' || match.status === 'walkover'
    const canCreateRoom = !match.room_code && match.player_x_id && match.player_o_id && !isFinished
    const canWalkover = !isFinished && (match.player_x_id || match.player_o_id)

    return (
      <div className="bg-paper border border-line rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
        <span className="text-[11px] font-mono text-muted/40 flex-none">#{match.match_number}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-medium text-ink">
            <span className={match.winner_user_id === match.player_x_id ? 'font-bold text-emerald-700' : ''}>{pxName}</span>
            <span className="text-muted/40 mx-1.5">vs</span>
            <span className={match.winner_user_id === match.player_o_id ? 'font-bold text-emerald-700' : ''}>{poName}</span>
          </p>
          {match.room_code && (
            <Link href={`/games/caro/${match.room_code}`} className="text-[11px] text-teal hover:underline">
              {t('admin_room_prefix')}{match.room_code}
            </Link>
          )}
        </div>
        <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full border flex-none ${MATCH_STATUS_COLOR[match.status] ?? MATCH_STATUS_COLOR.pending}`}>
          {t(`match_status_${match.status}` as Parameters<typeof t>[0])}
        </span>
        <div className="flex gap-1.5 flex-none flex-wrap">
          {canCreateRoom && (
            <button onClick={() => handleCreateRoom(match.id)} disabled={isPending}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-rose text-white hover:bg-rose-deep disabled:opacity-60 transition-all">
              {t('admin_create_room_btn')}
            </button>
          )}
          {canWalkover && (
            <button onClick={() => handleWalkover(match.id, match)} disabled={isPending}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-60 transition-all">
              {t('admin_walkover_btn')}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {feedback && (
        <div className={`px-4 py-3 rounded-xl text-[13px] font-medium ${feedbackError ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
          {feedback}
        </div>
      )}

      {/* ── Status + action buttons ────────────────────────────────────────── */}
      <div className="bg-paper border border-line rounded-2xl p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div>
            <p className="text-[11px] text-muted/50 mb-0.5">{t('admin_status_label_prefix')}{isGroupStage ? t('admin_type_group_short') : t('admin_type_single_short')}</p>
            <p className="text-[15px] font-bold text-ink">{t(`tournament_status_${tournament.status}` as Parameters<typeof t>[0])}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {tournament.status === 'draft' && (
              <button onClick={() => changeStatus('registration_open')} disabled={isPending}
                className="text-[12.5px] font-semibold px-4 py-2 rounded-xl bg-teal text-white hover:bg-teal/85 transition-all disabled:opacity-60">
                {t('admin_open_registration_btn')}
              </button>
            )}
            {tournament.status === 'registration_open' && (
              <button onClick={() => changeStatus('registration_closed', t('admin_confirm_close_reg'))} disabled={isPending}
                className="text-[12.5px] font-semibold px-4 py-2 rounded-xl bg-amber-500 text-white hover:bg-amber-600 transition-all disabled:opacity-60">
                {t('admin_close_registration_btn')}
              </button>
            )}
            {/* Single elimination: generate bracket */}
            {!isGroupStage && tournament.status === 'registration_closed' && matches.length === 0 && (
              <button onClick={handleGenerateBracket} disabled={isPending}
                className="text-[12.5px] font-semibold px-4 py-2 rounded-xl bg-rose text-white hover:bg-rose-deep transition-all disabled:opacity-60">
                {t('admin_generate_bracket_btn')}
              </button>
            )}
            {/* Group stage: generate groups */}
            {isGroupStage && tournament.status === 'registration_closed' && !hasGroups && (
              <button onClick={handleGenerateGroups} disabled={isPending}
                className="text-[12.5px] font-semibold px-4 py-2 rounded-xl bg-rose text-white hover:bg-rose-deep transition-all disabled:opacity-60">
                {t('admin_generate_groups_btn')}
              </button>
            )}
            {/* Group stage: generate knockout after group stage done */}
            {isGroupStage && hasGroups && allGroupMatchesDone && !hasKnockout && (
              <button onClick={handleGenerateKnockout} disabled={isPending}
                className="text-[12.5px] font-semibold px-4 py-2 rounded-xl bg-teal text-white hover:bg-teal/85 transition-all disabled:opacity-60">
                {t('admin_generate_knockout_btn')}
              </button>
            )}
            {!['finished', 'cancelled'].includes(tournament.status) && (
              <button onClick={() => changeStatus('cancelled', t('admin_confirm_cancel'))} disabled={isPending}
                className="text-[12.5px] font-semibold px-4 py-2 rounded-xl border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-all disabled:opacity-60">
                {t('admin_cancel_tournament_btn')}
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
          <div className="bg-cream rounded-xl p-3">
            <p className="text-[11px] text-muted/50">{t('admin_stat_participants')}</p>
            <p className="text-[22px] font-bold text-ink">{activeParticipants.length}<span className="text-[13px] font-normal text-muted/40">/{tournament.max_players}</span></p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <p className="text-[11px] text-emerald-700/70">{t('admin_stat_checked_in')}</p>
            <p className="text-[22px] font-bold text-emerald-700">{checkedInCount}<span className="text-[13px] font-normal text-emerald-600/50">/{activeParticipants.length}</span></p>
          </div>
          {isGroupStage ? (
            <>
              <div className="bg-cream rounded-xl p-3">
                <p className="text-[11px] text-muted/50">{t('admin_stat_num_groups')}</p>
                <p className="text-[22px] font-bold text-ink">{groups.length || tournament.num_groups || '—'}</p>
              </div>
              <div className="bg-cream rounded-xl p-3">
                <p className="text-[11px] text-muted/50">{t('admin_stat_group_matches')}</p>
                <p className="text-[22px] font-bold text-ink">{groupMatches.length}</p>
              </div>
              <div className="bg-cream rounded-xl p-3">
                <p className="text-[11px] text-muted/50">{t('admin_stat_finished')}</p>
                <p className="text-[22px] font-bold text-ink">{groupMatches.filter(m => m.status === 'finished' || m.status === 'walkover').length}</p>
              </div>
            </>
          ) : (
            <>
              <div className="bg-cream rounded-xl p-3">
                <p className="text-[11px] text-muted/50">{t('admin_stat_rounds')}</p>
                <p className="text-[22px] font-bold text-ink">{rounds.length}</p>
              </div>
              <div className="bg-cream rounded-xl p-3">
                <p className="text-[11px] text-muted/50">{t('admin_stat_matches_created')}</p>
                <p className="text-[22px] font-bold text-ink">{matches.length}</p>
              </div>
              <div className="bg-cream rounded-xl p-3">
                <p className="text-[11px] text-muted/50">{t('admin_stat_matches_finished')}</p>
                <p className="text-[22px] font-bold text-ink">{matches.filter(m => m.status === 'finished' || m.status === 'walkover').length}</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Participants ───────────────────────────────────────────────────── */}
      <div>
        <h2 className="font-serif font-bold text-[18px] text-ink mb-3">
          {t('admin_participants_heading', { count: activeParticipants.length })}
        </h2>
        {activeParticipants.length === 0 ? (
          <p className="text-[13px] text-muted/60 text-center py-8 bg-cream/50 border border-dashed border-line rounded-xl">{t('admin_no_participants')}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {activeParticipants.map((p, idx) => (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 bg-paper border border-line rounded-xl">
                <span className="text-[12px] font-mono text-muted/40 w-5">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-ink truncate">{p.display_name}</p>
                  <p className="text-[11px] text-muted/50">{p.user_id.slice(0, 8)}</p>
                </div>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  p.status === 'champion' ? 'bg-amber-100 text-amber-700' :
                  p.status === 'eliminated' ? 'bg-red-100 text-red-500' :
                  p.status === 'checked_in' ? 'bg-emerald-100 text-emerald-700' :
                  'bg-cream text-muted/60'
                }`}>
                  {p.status === 'checked_in' ? t('admin_ready_badge') : p.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Group stage: groups + standings + matches ──────────────────────── */}
      {isGroupStage && hasGroups && (
        <div className="space-y-8">
          <h2 className="font-serif font-bold text-[18px] text-ink">{t('admin_group_stage_heading')}</h2>
          {groups.map(group => {
            const members = groupMembers.filter(m => m.group_id === group.id)
            const gMatches = matches.filter(m => m.group_id === group.id)
            const standings = computeGroupStandings(group.id, groupMembers, matches)

            return (
              <div key={group.id} className="bg-paper border border-line rounded-2xl overflow-hidden">
                <div className="px-5 py-3.5 bg-cream/70 border-b border-line">
                  <h3 className="font-bold text-[15px] text-ink">{group.name}</h3>
                  <p className="text-[11.5px] text-muted/60">{t('admin_group_meta', { members: members.length, matches: gMatches.length })}</p>
                </div>

                {/* Standings table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-[12.5px] min-w-[420px]">
                    <thead>
                      <tr className="border-b border-line bg-cream/40">
                        <th className="text-left px-4 py-2 font-semibold text-muted/60">#</th>
                        <th className="text-left px-4 py-2 font-semibold text-muted/60">{t('admin_col_player')}</th>
                        <th className="text-center px-2 py-2 font-semibold text-muted/60">{t('admin_col_played')}</th>
                        <th className="text-center px-2 py-2 font-semibold text-muted/60">{t('admin_col_wins')}</th>
                        <th className="text-center px-2 py-2 font-semibold text-muted/60">{t('admin_col_draws')}</th>
                        <th className="text-center px-2 py-2 font-semibold text-muted/60">{t('admin_col_losses')}</th>
                        <th className="text-center px-2 py-2 font-bold text-ink">{t('admin_col_points')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((s, i) => (
                        <tr key={s.user_id} className={`border-b border-line/50 ${i === 0 ? 'bg-amber-50/50' : ''}`}>
                          <td className="px-4 py-2.5 text-muted/40 font-mono">{i + 1}</td>
                          <td className="px-4 py-2.5 font-semibold text-ink truncate max-w-[140px]">{nameMap[s.user_id] ?? s.user_id.slice(0, 8)}</td>
                          <td className="text-center px-2 py-2.5 text-muted">{s.played}</td>
                          <td className="text-center px-2 py-2.5 text-emerald-700 font-medium">{s.wins}</td>
                          <td className="text-center px-2 py-2.5 text-amber-600">{s.draws}</td>
                          <td className="text-center px-2 py-2.5 text-red-500">{s.losses}</td>
                          <td className="text-center px-2 py-2.5 font-bold text-ink">{s.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Group matches */}
                {gMatches.length > 0 && (
                  <div className="px-4 py-4 space-y-2 border-t border-line/50">
                    <p className="text-[11.5px] font-bold text-muted/50 uppercase tracking-widest mb-3">{t('admin_match_results')}</p>
                    {gMatches.map(match => <MatchCard key={match.id} match={match} />)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Knockout rounds (single_elimination OR after group stage) ─────── */}
      {knockoutMatches.length > 0 && (
        <div>
          <h2 className="font-serif font-bold text-[18px] text-ink mb-4">
            {isGroupStage ? t('admin_knockout_heading') : t('admin_matches_heading')}
          </h2>
          <div className="space-y-6">
            {rounds.map(round => {
              const roundMatches = knockoutMatches.filter(m => m.round_number === round)
              return (
                <div key={round}>
                  <h3 className="text-[12px] font-bold uppercase tracking-widest text-muted/50 mb-2 flex items-center gap-2">
                    <span className="h-px flex-1 bg-line" />{t('admin_round_label', { n: round })}<span className="h-px flex-1 bg-line" />
                  </h3>
                  <div className="space-y-2">
                    {roundMatches.map(match => <MatchCard key={match.id} match={match} />)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Single elimination matches (no groups) ────────────────────────── */}
      {!isGroupStage && matches.length > 0 && rounds.length === 0 && (
        <div>
          <h2 className="font-serif font-bold text-[18px] text-ink mb-4">{t('admin_matches_heading')}</h2>
          <div className="space-y-2">
            {matches.map(match => <MatchCard key={match.id} match={match} />)}
          </div>
        </div>
      )}
    </div>
  )
}
