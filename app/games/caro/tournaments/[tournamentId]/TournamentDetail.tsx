'use client'

import { useState, useEffect, useTransition, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { joinTournament, leaveTournament, getTournamentById, checkIn } from '../actions'
import type {
  CaroTournament, TournamentParticipant, TournamentMatch,
  TournamentGroup, TournamentGroupMember,
} from '../actions'

// ── Color maps ────────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-muted/10 text-muted border-muted/20',
  registration_open: 'bg-teal/10 text-teal border-teal/20',
  registration_closed: 'bg-amber-100 text-amber-700 border-amber-200',
  in_progress: 'bg-rose/10 text-rose border-rose/20',
  finished: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-100 text-red-600 border-red-200',
}

const MATCH_STATUS_COLOR: Record<string, string> = {
  pending: 'text-muted/60 bg-cream border-line',
  ready: 'text-teal bg-teal/10 border-teal/20',
  playing: 'text-rose bg-rose/10 border-rose/20',
  finished: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  cancelled: 'text-red-600 bg-red-50 border-red-200',
  walkover: 'text-amber-700 bg-amber-50 border-amber-200',
}

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

function getRoundLabel(t: (k: string, v?: Record<string, unknown>) => string, round: number, totalRounds: number) {
  const fromEnd = totalRounds - round
  if (fromEnd === 0) return t('match_final')
  if (fromEnd === 1) return t('match_semifinal')
  if (fromEnd === 2) return t('match_quarterfinal')
  return t('match_round_label', { round })
}

function LiveDot() {
  return (
    <span className="relative inline-flex h-2 w-2 flex-none ml-1.5" title="Cập nhật realtime">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
    </span>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────
type Props = {
  tournament: CaroTournament
  participants: TournamentParticipant[]
  matches: TournamentMatch[]
  groups: TournamentGroup[]
  groupMembers: TournamentGroupMember[]
  nameMap: Record<string, string>
  userId: string | null
  myParticipation: TournamentParticipant | null
  isAdmin: boolean
}

export default function TournamentDetail({
  tournament: initialTournament,
  participants: initialParticipants,
  matches: initialMatches,
  groups: initialGroups,
  groupMembers: initialGroupMembers,
  nameMap: initialNameMap,
  userId,
  myParticipation: ssrMyParticipation,
  isAdmin,
}: Props) {
  const t = useTranslations('games.caro')
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<string | null>(null)

  // ── Live state ───────────────────────────────────────────────────────────
  const [tournament, setTournament] = useState<CaroTournament>(initialTournament)
  const [participants, setParticipants] = useState<TournamentParticipant[]>(initialParticipants)
  const [matches, setMatches] = useState<TournamentMatch[]>(initialMatches)
  const [groups, setGroups] = useState<TournamentGroup[]>(initialGroups)
  const [groupMembers, setGroupMembers] = useState<TournamentGroupMember[]>(initialGroupMembers)
  const [nameMap, setNameMap] = useState<Record<string, string>>(initialNameMap)
  const [isLive, setIsLive] = useState(false)

  const myParticipation = userId
    ? (participants.find(p => p.user_id === userId && p.status !== 'withdrawn') ?? null)
    : ssrMyParticipation

  // ── Stable refetch ───────────────────────────────────────────────────────
  const mountedRef = useRef(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tournamentIdRef = useRef(initialTournament.id)

  const refetch = useCallback(async () => {
    if (!mountedRef.current) return
    try {
      const data = await getTournamentById(tournamentIdRef.current)
      if (!mountedRef.current) return
      if (data.tournament) {
        setTournament(data.tournament)
        setParticipants(data.participants)
        setMatches(data.matches)
        setGroups(data.groups)
        setGroupMembers(data.groupMembers)
        setNameMap(data.nameMap)
      }
    } catch { /* silently ignore */ }
  }, [])

  const scheduleRefetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(refetch, 300)
  }, [refetch])

  // ── Realtime subscription ────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true
    const tournamentId = tournamentIdRef.current
    const supabase = createClient()

    const channel = supabase
      .channel(`tournament_detail:${tournamentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'caro_tournaments', filter: `id=eq.${tournamentId}` }, scheduleRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'caro_tournament_participants', filter: `tournament_id=eq.${tournamentId}` }, scheduleRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'caro_tournament_matches', filter: `tournament_id=eq.${tournamentId}` }, scheduleRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'caro_tournament_groups', filter: `tournament_id=eq.${tournamentId}` }, scheduleRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'caro_tournament_group_members', filter: `tournament_id=eq.${tournamentId}` }, scheduleRefetch)
      .subscribe((status) => { if (status === 'SUBSCRIBED' && mountedRef.current) setIsLive(true) })

    return () => {
      mountedRef.current = false
      if (debounceRef.current) clearTimeout(debounceRef.current)
      supabase.removeChannel(channel)
      setIsLive(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Derived values ───────────────────────────────────────────────────────
  const isGroupStage = tournament.type === 'group_stage'
  const knockoutMatches = matches.filter(m => m.round_number >= 1)
  const knockoutRounds = Array.from(new Set(knockoutMatches.map(m => m.round_number))).sort((a, b) => a - b)
  const totalKORounds = knockoutRounds.length > 0 ? Math.max(...knockoutRounds) : 0

  const activeParticipants = participants.filter(p => p.status !== 'withdrawn')
  const isOpen = tournament.status === 'registration_open'
  const isRegistrationClosed = tournament.status === 'registration_closed'
  const isFinished = tournament.status === 'finished'
  const hasJoined = !!myParticipation
  const isCheckedIn = myParticipation?.status === 'checked_in'
  const isFull = activeParticipants.length >= tournament.max_players

  // Single elimination bracket values
  const seMatches = matches.filter(m => m.round_number >= 1)
  const seRounds = Array.from(new Set(seMatches.map(m => m.round_number))).sort((a, b) => a - b)
  const totalSERounds = seMatches.length > 0 ? Math.max(...seMatches.map(m => m.round_number)) : Math.log2(tournament.max_players)

  // ── Actions ──────────────────────────────────────────────────────────────
  function handleJoin() {
    setFeedback(null)
    startTransition(async () => {
      const result = await joinTournament(tournament.id)
      if (result && 'error' in result) {
        const msgMap: Record<string, string> = {
          not_logged_in: t('tournament_join_login'),
          registration_closed: t('tournament_join_closed'),
          tournament_full: t('tournament_join_full'),
          already_joined: t('tournament_joined_badge'),
        }
        setFeedback(msgMap[result.error] ?? result.error)
      } else {
        setFeedback(t('tournament_join_success'))
        refetch()
      }
    })
  }

  function handleLeave() {
    if (!window.confirm(t('tournament_leave_confirm'))) return
    setFeedback(null)
    startTransition(async () => {
      const result = await leaveTournament(tournament.id)
      if (result && 'error' in result) {
        setFeedback(result.error)
      } else {
        setFeedback(t('tournament_leave_success'))
        refetch()
      }
    })
  }

  function handleCheckIn() {
    setFeedback(null)
    startTransition(async () => {
      const result = await checkIn(tournament.id)
      if (result && 'error' in result) {
        setFeedback(result.error)
      } else {
        setFeedback(t('tournament_checkin_success'))
        refetch()
      }
    })
  }

  // ── Shared match card ────────────────────────────────────────────────────
  function MatchCard({ match, showRoomButton = true }: { match: TournamentMatch; showRoomButton?: boolean }) {
    const pxName = match.player_x_id ? (nameMap[match.player_x_id] ?? match.player_x_id.slice(0, 6)) : t('match_vs_tbd')
    const poName = match.player_o_id ? (nameMap[match.player_o_id] ?? match.player_o_id.slice(0, 6)) : t('match_vs_tbd')
    const isXWinner = match.winner_user_id === match.player_x_id
    const isOWinner = match.winner_user_id === match.player_o_id
    const myMatch = userId && (match.player_x_id === userId || match.player_o_id === userId)
    const canEnter = showRoomButton && myMatch && match.room_code && ['ready', 'playing', 'finished'].includes(match.status)

    return (
      <div className={`bg-paper border rounded-2xl overflow-hidden transition-colors ${myMatch ? 'border-rose/30' : 'border-line'}`}>
        <div className="flex items-center justify-between px-4 py-2.5 bg-cream/60 border-b border-line/50">
          <span className="text-[11px] font-mono text-muted/40">#{match.match_number}</span>
          <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full border ${MATCH_STATUS_COLOR[match.status] ?? MATCH_STATUS_COLOR.pending}`}>
            {t(`match_status_${match.status}` as Parameters<typeof t>[0])}
          </span>
        </div>
        <div className="px-4 py-3 space-y-2">
          <div className={`flex items-center gap-2 ${isXWinner ? 'font-semibold text-blue-700' : isOWinner ? 'text-muted/50' : 'text-ink'}`}>
            <span className="text-[10px] font-black text-blue-500">✕</span>
            <span className="text-[13.5px] flex-1 truncate">{pxName}</span>
            {isXWinner && <span className="text-[14px]">🏆</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-muted/30 w-3.5 text-center">—</span>
            <span className="text-[10px] font-bold text-muted/30">VS</span>
          </div>
          <div className={`flex items-center gap-2 ${isOWinner ? 'font-semibold text-rose' : isXWinner ? 'text-muted/50' : 'text-ink'}`}>
            <span className="text-[10px] font-black text-rose">○</span>
            <span className="text-[13.5px] flex-1 truncate">{poName}</span>
            {isOWinner && <span className="text-[14px]">🏆</span>}
          </div>
        </div>
        {canEnter && match.room_code && (
          <div className="px-4 pb-3">
            <Link href={`/games/caro/${match.room_code}`}
              className="w-full text-center block text-[12.5px] font-semibold py-2 rounded-xl bg-rose text-white hover:bg-rose-deep transition-all">
              {t('match_enter_room')}
            </Link>
          </div>
        )}
        {!myMatch && match.room_code && match.status === 'playing' && (
          <div className="px-4 pb-3">
            <Link href={`/games/caro/${match.room_code}`}
              className="w-full text-center block text-[12px] font-medium py-1.5 rounded-xl border border-line text-muted hover:bg-cream transition-all">
              👁 Xem
            </Link>
          </div>
        )}
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">

      {/* ── Tournament info ───────────────────────────────────────────────── */}
      <div className="bg-paper border border-line rounded-2xl p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center text-[10.5px] font-bold tracking-wide px-2.5 py-1 rounded-full border ${STATUS_COLOR[tournament.status] ?? STATUS_COLOR.draft}`}>
              {t(`tournament_status_${tournament.status}` as Parameters<typeof t>[0])}
            </span>
            <span className="text-[11px] text-muted/60 bg-cream px-2.5 py-1 rounded-full border border-line">
              {isGroupStage ? t('tournament_type_group') : t('tournament_type_single')}
            </span>
            {isLive && <LiveDot />}
          </div>
          {isAdmin && (
            <Link href={`/admin/caro/${tournament.id}`}
              className="text-[12px] font-semibold text-muted hover:text-rose transition-colors flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Admin
            </Link>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div className="bg-cream/60 rounded-xl p-3">
            <p className="text-[11px] text-muted/60 mb-0.5">{t('tournament_detail_participants')}</p>
            <p className="text-[20px] font-bold text-ink">
              {activeParticipants.length}<span className="text-[13px] font-normal text-muted/50">/{tournament.max_players}</span>
            </p>
          </div>
          <div className="bg-cream/60 rounded-xl p-3">
            <p className="text-[11px] text-muted/60 mb-0.5">{t('tournament_detail_matches')}</p>
            <p className="text-[20px] font-bold text-ink">{matches.length}</p>
          </div>
          {tournament.start_at && (
            <div className="bg-cream/60 rounded-xl p-3 col-span-2 sm:col-span-1">
              <p className="text-[11px] text-muted/60 mb-0.5">{t('tournament_detail_start_at')}</p>
              <p className="text-[13px] font-semibold text-ink">
                {new Date(tournament.start_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </p>
            </div>
          )}
          {isFinished && tournament.champion_user_id && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 col-span-2 sm:col-span-1">
              <p className="text-[11px] text-amber-600/80 mb-0.5">{t('tournament_detail_champion')}</p>
              <p className="text-[13px] font-bold text-amber-700 truncate">🏆 {nameMap[tournament.champion_user_id] ?? '—'}</p>
            </div>
          )}
        </div>

        {(tournament.description || tournament.rules || tournament.prize) && (
          <div className="mt-5 space-y-3 border-t border-line pt-5">
            {tournament.description && <p className="text-[14px] text-ink/80 leading-relaxed">{tournament.description}</p>}
            {tournament.rules && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <p className="text-[11.5px] font-bold text-amber-700 mb-1">📋 {t('tournament_detail_rules')}</p>
                <p className="text-[13px] text-amber-800 leading-relaxed whitespace-pre-line">{tournament.rules}</p>
              </div>
            )}
            {tournament.prize && (
              <div className="flex items-center gap-2 text-[13.5px]">
                <span>🎁</span>
                <span className="font-semibold text-gold">{t('tournament_detail_prize')}:</span>
                <span className="text-ink">{tournament.prize}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Join / Check-in / Leave section ──────────────────────────────── */}
      {(isOpen || (isRegistrationClosed && hasJoined)) && (
        <div className="bg-gradient-to-br from-[#fdeef5] to-cream border border-rose/15 rounded-2xl px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            {!userId ? (
              <>
                <p className="text-[14.5px] font-semibold text-ink mb-0.5">{t('tournament_join_btn')}</p>
                <p className="text-[13px] text-muted">{t('tournament_join_login')}</p>
              </>
            ) : isCheckedIn ? (
              <>
                <p className="text-[14.5px] font-semibold text-emerald-700 mb-0.5">✅ {t('tournament_checked_in_badge')}</p>
                <p className="text-[13px] text-muted">{t('tournament_checked_in_desc')}</p>
              </>
            ) : hasJoined ? (
              <>
                <p className="text-[14.5px] font-semibold text-ink mb-0.5">{t('tournament_checkin_title')}</p>
                <p className="text-[13px] text-muted">{t('tournament_checkin_desc')}</p>
              </>
            ) : isFull ? (
              <>
                <p className="text-[14.5px] font-semibold text-ink mb-0.5">{t('tournament_join_full')}</p>
                <p className="text-[13px] text-muted">{t('tournament_participants_count', { count: activeParticipants.length, max: tournament.max_players })}</p>
              </>
            ) : (
              <>
                <p className="text-[14.5px] font-semibold text-ink mb-0.5">{t('tournament_join_btn')}</p>
                <p className="text-[13px] text-muted">
                  {t('tournament_participants_count', { count: activeParticipants.length, max: tournament.max_players })} — Còn chỗ trống!
                </p>
              </>
            )}
          </div>
          <div className="flex gap-2">
            {!userId && isOpen && (
              <Link href="/dang-nhap" className="font-semibold text-[13.5px] px-6 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all shadow-[0_2px_10px_-2px_rgba(194,24,91,0.35)]">
                Đăng nhập
              </Link>
            )}
            {userId && !hasJoined && !isFull && isOpen && (
              <button onClick={handleJoin} disabled={isPending}
                className="font-semibold text-[13.5px] px-6 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all shadow-[0_2px_10px_-2px_rgba(194,24,91,0.35)] disabled:opacity-60">
                {isPending ? '…' : t('tournament_join_btn')}
              </button>
            )}
            {userId && hasJoined && !isCheckedIn && (
              <button onClick={handleCheckIn} disabled={isPending}
                className="font-semibold text-[13.5px] px-6 py-2.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 transition-all shadow-[0_2px_10px_-2px_rgba(5,150,105,0.35)] disabled:opacity-60">
                {isPending ? '…' : t('tournament_checkin_btn')}
              </button>
            )}
            {userId && hasJoined && isOpen && (
              <button onClick={handleLeave} disabled={isPending}
                className="font-semibold text-[13.5px] px-5 py-2.5 rounded-full border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-all disabled:opacity-60">
                {isPending ? '…' : t('tournament_leave_btn')}
              </button>
            )}
          </div>
          {feedback && <p className="w-full text-[12.5px] text-ink/70 mt-1">{feedback}</p>}
        </div>
      )}

      {/* ── Participants list ─────────────────────────────────────────────── */}
      <div>
        <h2 className="font-serif font-bold text-[20px] text-ink mb-4 flex items-center gap-2">
          👥 {t('tournament_detail_participants')}
          <span className="text-[12px] font-normal text-muted/60 font-sans">({activeParticipants.length}/{tournament.max_players})</span>
          {isLive && <LiveDot />}
        </h2>
        {activeParticipants.length === 0 ? (
          <div className="text-center py-10 text-muted/60 text-[14px] bg-cream/50 border border-dashed border-line rounded-2xl">
            {t('tournament_no_participants')}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {activeParticipants.map((p, idx) => {
              const isMe = p.user_id === userId
              const isChampion = p.status === 'champion'
              const isEliminated = p.status === 'eliminated'
              return (
                <div key={p.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                    isChampion ? 'bg-amber-50 border-amber-200' :
                    isEliminated ? 'bg-cream/30 border-line/50 opacity-60' :
                    isMe ? 'bg-rose/5 border-rose/20' :
                    'bg-cream/50 border-line'
                  }`}
                >
                  <span className="text-[13px] font-mono text-muted/40 w-5 flex-none">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13.5px] font-semibold truncate ${isEliminated ? 'line-through text-muted/50' : 'text-ink'}`}>
                      {isChampion && '🏆 '}
                      {p.display_name}
                      {isMe && <span className="ml-1.5 text-[10px] text-rose font-bold">(Bạn)</span>}
                    </p>
                    <p className="text-[11px] text-muted/50">
                      {new Date(p.joined_at).toLocaleDateString('vi-VN')}
                    </p>
                  </div>
                  {p.status === 'checked_in' && !isEliminated && !isChampion && (
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full flex-none">
                      ✓ {t('tournament_participant_ready')}
                    </span>
                  )}
                  {isEliminated && <span className="text-[11px] text-muted/40 flex-none">Bị loại</span>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          GROUP STAGE UI
      ═══════════════════════════════════════════════════════════════════════ */}
      {isGroupStage && groups.length > 0 && (
        <div className="space-y-8">
          <h2 className="font-serif font-bold text-[20px] text-ink flex items-center gap-2">
            📊 {t('tournament_group_stage')}
            {isLive && <LiveDot />}
          </h2>

          {groups.map(group => {
            const members = groupMembers.filter(m => m.group_id === group.id)
            const gMatches = matches.filter(m => m.group_id === group.id)
            const standings = computeGroupStandings(group.id, groupMembers, matches)

            return (
              <div key={group.id} className="bg-paper border border-line rounded-2xl overflow-hidden">
                {/* Group header */}
                <div className="px-5 py-4 bg-gradient-to-r from-ink/5 to-transparent border-b border-line">
                  <h3 className="font-bold text-[16px] text-ink">{group.name}</h3>
                  <p className="text-[11.5px] text-muted/60 mt-0.5">{members.length} {t('tournament_group_members')} · {gMatches.length} {t('tournament_group_matches_label')}</p>
                </div>

                {/* Standings table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-[12.5px] min-w-[380px]">
                    <thead>
                      <tr className="border-b border-line/60 bg-cream/50">
                        <th className="text-left px-4 py-2.5 font-semibold text-muted/60 w-8">#</th>
                        <th className="text-left px-3 py-2.5 font-semibold text-muted/60">{t('tournament_group_player')}</th>
                        <th className="text-center px-2 py-2.5 font-semibold text-muted/60 w-10">{t('tournament_group_played')}</th>
                        <th className="text-center px-2 py-2.5 font-semibold text-emerald-700/70 w-10">{t('tournament_group_wins')}</th>
                        <th className="text-center px-2 py-2.5 font-semibold text-amber-600/70 w-10">{t('tournament_group_draws')}</th>
                        <th className="text-center px-2 py-2.5 font-semibold text-red-500/70 w-10">{t('tournament_group_losses')}</th>
                        <th className="text-center px-2 py-2.5 font-bold text-ink w-12">{t('tournament_group_points')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((s, i) => {
                        const isMe = s.user_id === userId
                        return (
                          <tr key={s.user_id}
                            className={`border-b border-line/40 transition-colors ${
                              i === 0 ? 'bg-amber-50/60' :
                              isMe ? 'bg-rose/5' : 'hover:bg-cream/40'
                            }`}>
                            <td className="px-4 py-3 text-muted/40 font-mono text-[11px]">{i + 1}</td>
                            <td className="px-3 py-3 font-semibold text-ink truncate max-w-[160px]">
                              {nameMap[s.user_id] ?? s.user_id.slice(0, 8)}
                              {isMe && <span className="ml-1.5 text-[10px] text-rose font-bold">(Bạn)</span>}
                              {i === 0 && <span className="ml-1 text-[12px]">🥇</span>}
                            </td>
                            <td className="text-center px-2 py-3 text-muted/70">{s.played}</td>
                            <td className="text-center px-2 py-3 text-emerald-700 font-medium">{s.wins}</td>
                            <td className="text-center px-2 py-3 text-amber-600">{s.draws}</td>
                            <td className="text-center px-2 py-3 text-red-500">{s.losses}</td>
                            <td className="text-center px-2 py-3 font-bold text-ink text-[14px]">{s.points}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Group matches */}
                {gMatches.length > 0 && (
                  <div className="px-4 py-4 border-t border-line/40 space-y-2">
                    <p className="text-[11px] font-bold text-muted/50 uppercase tracking-widest mb-3">
                      {t('tournament_group_matches_label')}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {gMatches.map(match => <MatchCard key={match.id} match={match} />)}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Group stage: knockout rounds ──────────────────────────────────── */}
      {isGroupStage && knockoutMatches.length > 0 && (
        <div>
          <h2 className="font-serif font-bold text-[20px] text-ink mb-5 flex items-center gap-2">
            🏆 {t('tournament_knockout_stage')}
            {isLive && <LiveDot />}
          </h2>
          <div className="space-y-8">
            {knockoutRounds.map(round => {
              const roundMatches = knockoutMatches.filter(m => m.round_number === round)
              const label = getRoundLabel(t as (k: string, v?: Record<string, unknown>) => string, round, totalKORounds)
              return (
                <div key={round}>
                  <h3 className="text-[13px] font-bold uppercase tracking-widest text-muted/50 mb-3 flex items-center gap-2">
                    <span className="h-px flex-1 bg-line" />{label}<span className="h-px flex-1 bg-line" />
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {roundMatches.map(match => <MatchCard key={match.id} match={match} />)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          SINGLE ELIMINATION BRACKET
      ═══════════════════════════════════════════════════════════════════════ */}
      {!isGroupStage && seMatches.length > 0 && (
        <div>
          <h2 className="font-serif font-bold text-[20px] text-ink mb-5 flex items-center gap-2">
            🎯 {t('tournament_detail_bracket')}
            {isLive && <LiveDot />}
          </h2>
          <div className="space-y-8">
            {seRounds.map(round => {
              const roundMatches = seMatches.filter(m => m.round_number === round)
              const label = getRoundLabel(t as (k: string, v?: Record<string, unknown>) => string, round, totalSERounds)
              return (
                <div key={round}>
                  <h3 className="text-[13px] font-bold uppercase tracking-widest text-muted/50 mb-3 flex items-center gap-2">
                    <span className="h-px flex-1 bg-line" />{label}<span className="h-px flex-1 bg-line" />
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {roundMatches.map(match => <MatchCard key={match.id} match={match} />)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── No matches / waiting message ──────────────────────────────────── */}
      {matches.length === 0 && ['registration_closed', 'in_progress'].includes(tournament.status) && (
        <div className="text-center py-10 text-muted/60 text-[14px] bg-cream/50 border border-dashed border-line rounded-2xl">
          {t('tournament_no_matches')}
        </div>
      )}

      {/* ── Champion banner ───────────────────────────────────────────────── */}
      {isFinished && tournament.champion_user_id && (
        <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-300 rounded-2xl px-6 py-8 text-center shadow-[0_4px_24px_-6px_rgba(201,154,61,0.35)]">
          <div className="text-[48px] mb-3">🏆</div>
          <p className="text-[12px] font-bold uppercase tracking-widest text-amber-600 mb-2">{t('tournament_detail_champion')}</p>
          <p className="font-serif font-bold text-[28px] text-amber-800">
            {nameMap[tournament.champion_user_id] ?? '—'}
          </p>
          {tournament.prize && (
            <p className="text-[13.5px] text-amber-700 mt-2 flex items-center justify-center gap-1.5">
              <span>🎁</span> {tournament.prize}
            </p>
          )}
          <div className="mt-5 pt-5 border-t border-amber-200">
            <Link
              href="/games/caro/leaderboard"
              className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-700 hover:text-amber-900 transition-colors"
            >
              🏅 {t('leaderboard_view')}
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
