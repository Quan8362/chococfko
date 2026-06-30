'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import {
  refetchRoomState, toggleReady, startGame, leaveTable, heartbeatRoom,
  addBot, removeBot, kickSeat, pruneStaleLobbySeats,
  type TlmnRoomState, type TlmnSeat,
} from '../actions'
import TlmnRulesPanel from './TlmnRulesPanel'
import TlmnTable from './TlmnTable'
import UserAvatar from '@/components/UserAvatar'
import { BotAvatar } from './TlmnCard'
import { botThemeIndex } from '@/lib/games/tlmn/avatar'
import { useTlmnSound } from './useTlmnSound'
import {
  TlmnInvite, TlmnShare, TlmnBot, TlmnCrown, TlmnCheck, TlmnSeat as TlmnSeatIcon, TlmnWave, TlmnSuits,
} from '../icons'

const MAX_SEATS = 4
const MIN_READY_TO_START = 2

// ── Activity toasts ────────────────────────────────────────────────────────────
type Toast = { id: number; text: string; name: string; avatar: string | null }
// Per-seat snapshot used to diff lobby changes into "X đã vào phòng"-style toasts.
type SeatSnap = { userId: string | null; name: string; avatar: string | null; isBot: boolean; isReady: boolean }
function snapshot(s: TlmnRoomState): { seats: Map<number, SeatSnap>; host: number } {
  const seats = new Map<number, SeatSnap>()
  for (const seat of s.seats) {
    seats.set(seat.seat_index, {
      userId: seat.user_id, name: seat.display_name, avatar: seat.avatar_url,
      isBot: seat.is_bot, isReady: seat.is_ready,
    })
  }
  return { seats, host: s.room.host_seat }
}

type Props = {
  initialState: TlmnRoomState
  userId: string | null
  // Why the visitor isn't seated (from seatIntoRoom): the room is already playing or
  // the entry-gate (coins) blocked them — surfaced as a spectator banner. null = seated.
  joinError?: string | null
}

export default function TlmnRoom({ initialState, userId, joinError = null }: Props) {
  const t = useTranslations('games.tlmn')
  const router = useRouter()
  const [state, setState] = useState<TlmnRoomState>(initialState)
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()
  // Bot add/remove (and kick) gets its own pending flag so it never dims Ready/Start.
  const [isBotPending, startBotTransition] = useTransition()
  const [connState, setConnState] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting')
  const [kicked, setKicked] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const mountedRef = useRef(true)
  const leavingRef = useRef(false)
  const hadSeatRef = useRef(!!(userId && initialState.seats.some(s => s.user_id === userId)))
  // Toast plumbing: a channel handle (to broadcast kick labels on the SAME channel),
  // the previous lobby snapshot (to diff), a recent-kick map (seatIndex→ts, to label a
  // departure as a kick rather than a leave), a monotonic toast id, and reduced-motion.
  const channelRef = useRef<RealtimeChannel | null>(null)
  const prevSnapRef = useRef(snapshot(initialState))
  const kickedRef = useRef<Map<number, number>>(new Map())
  const toastSeq = useRef(0)
  const reducedRef = useRef(false)
  const mutedRef = useRef(false)
  const { play: playSound, muted: soundMuted } = useTlmnSound()
  mutedRef.current = soundMuted

  const { room, seats } = state
  const seatByIndex = (i: number): TlmnSeat | undefined => seats.find(s => s.seat_index === i)
  const mySeat = userId ? seats.find(s => s.user_id === userId) : undefined
  const isHost = !!mySeat && mySeat.seat_index === room.host_seat
  // The host is always a participant (never needs to self-ready); everyone else
  // counts only when ready. Used for the counter, seat badges, and the start gate.
  const seatReady = (s: TlmnSeat) => s.is_ready || s.seat_index === room.host_seat
  const readyCount = seats.filter(seatReady).length
  const canStart = isHost && room.status === 'lobby' && readyCount >= MIN_READY_TO_START

  const inviteUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/games/tlmn/${room.invite_code}`
    : ''
  const isPlaying = room.status === 'playing'
  // The server reaper finalizes a match stranded in 'playing' after every human left
  // (no live client to drive the bots) → 'abandoned'. A reconnecting player must see this
  // authoritative ended state instead of a frozen table; the room-row UPDATE arrives over
  // the same realtime channel, so this flips live without a refresh.
  const isAbandoned = room.status === 'abandoned'

  // ── Realtime: room + seats ──────────────────────────────────────────────────
  // Mirrors the caro/chess layer: one postgres_changes channel per room. The room
  // row is merged in place; any seat change refetches the authoritative state (low
  // volume — joins/leaves/ready toggles only). On every (re)subscribe we reconcile.
  useEffect(() => {
    const roomId = room.id
    const sb = createClient()

    const reconcile = () => {
      refetchRoomState(roomId)
        .then(fresh => {
          if (!fresh || !mountedRef.current) return
          setState(fresh)
        })
        .catch(() => { /* transient — next reconnect retries */ })
    }

    const ch = sb
      .channel(`tlmn:${roomId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'tlmn_rooms', filter: `id=eq.${roomId}`,
      }, payload => {
        if (!mountedRef.current) return
        setState(prev => ({ ...prev, room: { ...prev.room, ...(payload.new as TlmnRoomState['room']) } }))
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tlmn_seats', filter: `room_id=eq.${roomId}`,
      }, () => {
        if (!mountedRef.current) return
        reconcile()
      })
      // Kick label: the host broadcasts the kicked seat on the SAME channel so a
      // departure can be shown as "đã bị mời ra" instead of the generic "đã rời phòng".
      .on('broadcast', { event: 'tlmn_kick' }, ({ payload }) => {
        const idx = (payload as { seatIndex?: number })?.seatIndex
        if (typeof idx === 'number') kickedRef.current.set(idx, Date.now())
      })
      .subscribe(status => {
        if (!mountedRef.current) return
        if (status === 'SUBSCRIBED') {
          setConnState('connected')
          reconcile()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnState('reconnecting')
        }
      })

    channelRef.current = ch
    return () => { channelRef.current = null; sb.removeChannel(ch) }
  }, [room.id])

  // Respect prefers-reduced-motion (gates the optional join/ready SFX).
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedRef.current = mq.matches
    const onChange = () => { reducedRef.current = mq.matches }
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])

  // ── Activity toasts: diff the lobby snapshot → join/leave/ready/host events ──────
  const enqueueToast = useCallback((item: { text: string; name: string; avatar: string | null; chime?: 'turn' | 'play' }) => {
    const id = ++toastSeq.current
    setToasts(prev => [...prev, { id, text: item.text, name: item.name, avatar: item.avatar }].slice(-4))
    window.setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 2500)
    if (item.chime && !mutedRef.current && !reducedRef.current) playSound(item.chime)
  }, [playSound])

  useEffect(() => {
    const prev = prevSnapRef.current
    const cur = snapshot(state)
    // Only narrate the waiting room — in-play seat churn (AFK takeover, leave→bot) must
    // not spam toasts. prevSnapRef is still advanced so we never replay a stale burst.
    if (state.room.status === 'lobby') {
      for (const [idx, c] of Array.from(cur.seats.entries())) {
        const p = prev.seats.get(idx)
        if (!p) {
          if (c.isBot) enqueueToast({ text: t('toast_bot_add', { name: c.name }), name: c.name, avatar: null })
          else if (c.userId !== userId) enqueueToast({ text: t('toast_join', { name: c.name }), name: c.name, avatar: c.avatar, chime: 'turn' })
        } else if (p.isReady !== c.isReady && !c.isBot && c.userId !== userId) {
          enqueueToast({
            text: t(c.isReady ? 'toast_ready' : 'toast_unready', { name: c.name }),
            name: c.name, avatar: c.avatar, chime: c.isReady ? 'play' : undefined,
          })
        }
      }
      for (const [idx, p] of Array.from(prev.seats.entries())) {
        if (cur.seats.has(idx) || p.userId === userId) continue // still here, or it's me
        const kickedAt = kickedRef.current.get(idx)
        const isKick = kickedAt != null && Date.now() - kickedAt < 5000
        if (!p.isBot || isKick) {
          enqueueToast({
            text: t(isKick ? 'toast_kick' : 'toast_leave', { name: p.name }),
            name: p.name, avatar: p.avatar,
          })
        }
        kickedRef.current.delete(idx)
      }
      if (prev.host !== cur.host) {
        const nh = cur.seats.get(cur.host)
        if (nh) enqueueToast({ text: t('toast_host', { name: nh.name }), name: nh.name, avatar: nh.avatar })
      }
    }
    prevSnapRef.current = cur
  }, [state, userId, enqueueToast, t])

  // ── Heartbeat: keep my seat marked connected + prune dead lobby seats ────────
  // While seated I ping last_seen so others see me as present. In the LOBBY I also
  // nudge the seat reaper: every connected client does this, so a player who closed
  // their tab (heartbeat stops) has their seat freed live for everyone — the parity
  // analog of caro's stale-room reaper, at the seat level. (Self is always fresh.)
  const seated = !!mySeat
  const inLobby = room.status === 'lobby'
  useEffect(() => {
    if (!seated) return
    const tick = () => {
      heartbeatRoom(room.id)
      if (inLobby) pruneStaleLobbySeats(room.id).catch(() => {})
    }
    tick()
    const interval = setInterval(tick, 15000)
    return () => clearInterval(interval)
  }, [room.id, seated, inLobby])

  // ── Kicked / removed detection ──────────────────────────────────────────────
  // If I held a seat and it's gone while the room still exists in the lobby, the host
  // kicked me (or the reaper pruned my tab) — show a graceful notice instead of a
  // silent spectator view. Skipped when I'm the one leaving (handled by navigation).
  useEffect(() => {
    if (mySeat) { hadSeatRef.current = true; return }
    if (hadSeatRef.current && userId && !leavingRef.current && state.room.status === 'lobby') {
      setKicked(true)
    }
  }, [mySeat, userId, state.room.status])

  // ── Track mount + leave the seat when the tab closes ────────────────────────
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const copyLink = () => {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // Native share sheet where available (mobile), otherwise fall back to copy.
  const shareLink = () => {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined
    if (nav?.share) {
      nav.share({ title: t('title'), text: t('share_text', { code: room.invite_code }), url: inviteUrl })
        .catch(() => {})
    } else {
      copyLink()
    }
  }

  // Pull authoritative state right after a mutation instead of waiting for the
  // realtime event — a missed/delayed tlmn_seats broadcast otherwise leaves the
  // lobby stale (e.g. an added bot or the ready/start buttons not appearing until
  // a manual reload).
  const reconcileNow = () => {
    refetchRoomState(room.id)
      .then(fresh => { if (fresh && mountedRef.current) setState(fresh) })
      .catch(() => {})
  }

  const handleReady = () => {
    startTransition(async () => { await toggleReady(room.id); reconcileNow() })
  }

  const handleStart = () => {
    startTransition(async () => { await startGame(room.id); reconcileNow() })
  }

  // Lobby leave button: never a forfeit (no live round) — leaveTable settles nothing and
  // just frees the seat, then we navigate. The in-game table owns its own forfeit-confirm
  // flow and calls leaveTable itself, so its onLeave only needs to navigate away.
  const handleLeave = () => {
    leavingRef.current = true
    startTransition(async () => {
      await leaveTable(room.id)
      router.push('/games/tlmn')
    })
  }

  const handleLeaveNavigate = () => {
    leavingRef.current = true
    router.push('/games/tlmn')
  }

  const handleAddBot = () => {
    startBotTransition(async () => {
      const res = await addBot(room.id)
      if (res.state && mountedRef.current) setState(res.state)
    })
  }

  const handleRemoveBot = (seatIndex: number) => {
    startBotTransition(async () => {
      const res = await removeBot(room.id, seatIndex)
      if (res.state && mountedRef.current) setState(res.state)
    })
  }

  const handleKick = (seatIndex: number) => {
    startBotTransition(async () => {
      const res = await kickSeat(room.id, seatIndex)
      if (res.error) return
      // Mark locally (so the host's own diff labels it a kick) + broadcast so everyone
      // else's departure toast reads "đã bị mời ra" rather than "đã rời phòng".
      kickedRef.current.set(seatIndex, Date.now())
      channelRef.current?.send({ type: 'broadcast', event: 'tlmn_kick', payload: { seatIndex } })
      if (res.state && mountedRef.current) setState(res.state)
    })
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  if (isAbandoned) {
    return (
      <div className="tlmn-lobby flex flex-col items-center text-center gap-4">
        <span className="w-16 h-16 rounded-2xl bg-[var(--tl-red)]/8 text-[var(--tl-red)] flex items-center justify-center ring-1 ring-[var(--tl-red)]/15" aria-hidden>
          <TlmnWave className="w-9 h-9" />
        </span>
        <h2 className="font-serif font-bold text-[20px] text-[var(--tl-red)]">{t('abandoned_title')}</h2>
        <p className="text-[13.5px] tl-section-sub leading-relaxed max-w-[420px]">{t('abandoned_desc')}</p>
        <Link
          href="/games/tlmn"
          className="tl-btn-secondary mt-1 inline-flex items-center justify-center gap-2 text-[14px] px-6 py-3"
        >
          {t('abandoned_back_btn')}
        </Link>
      </div>
    )
  }

  if (kicked) {
    return (
      <div className="tlmn-lobby flex flex-col items-center text-center gap-4">
        <span className="w-16 h-16 rounded-2xl bg-[var(--tl-red)]/8 text-[var(--tl-red)] flex items-center justify-center ring-1 ring-[var(--tl-red)]/15" aria-hidden>
          <TlmnWave className="w-9 h-9" />
        </span>
        <h2 className="font-serif font-bold text-[20px] text-[var(--tl-red)]">{t('kicked_title')}</h2>
        <p className="text-[13.5px] tl-section-sub leading-relaxed max-w-[420px]">{t('kicked_desc')}</p>
        <Link
          href="/games/tlmn"
          className="tl-btn-secondary mt-1 inline-flex items-center justify-center gap-2 text-[14px] px-6 py-3"
        >
          {t('kicked_back_btn')}
        </Link>
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-5 ${isPlaying ? '' : 'tlmn-lobby'}`}>

      {/* ── Activity toasts (live presence: join / leave / ready / kick / host) ── */}
      {toasts.length > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] flex flex-col items-center gap-2 pointer-events-none w-[calc(100%-2rem)] max-w-[360px]">
          <style>{`@keyframes tlmnToastIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:no-preference){.tlmn-toast-in{animation:tlmnToastIn .2s ease-out}}`}</style>
          {toasts.map(toast => (
            <div
              key={toast.id}
              className="tlmn-toast-in w-full flex items-center gap-2.5 bg-paper/95 backdrop-blur border border-rose/20 shadow-lg rounded-2xl px-3.5 py-2.5"
            >
              <ToastAvatar name={toast.name} url={toast.avatar} />
              <p className="text-[13px] font-semibold text-ink leading-snug truncate">{toast.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* Room code banner (lobby only — the immersive table carries its own chrome) */}
      {!isPlaying && (
      <div className="tl-panel-dark w-full px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <TlmnSuits className="absolute right-2 -top-2 w-24 h-24 text-[var(--tl-gold-bright)] opacity-[0.08] pointer-events-none rotate-6" />
        <div className="relative">
          <p className="text-[11px] font-bold uppercase tracking-[2px] text-[#fdeedd]/85 mb-1">{t('room_code_label')}</p>
          <p className="font-mono font-black text-[30px] text-[var(--tl-gold-bright)] tracking-[0.2em] leading-none [text-shadow:0_2px_10px_rgba(0,0,0,0.4)]">
            {room.invite_code}
          </p>
        </div>
        <div className="relative flex items-center gap-2 flex-none">
          <button
            onClick={copyLink}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-4 py-2.5 rounded-xl bg-[var(--tl-gold)]/12 hover:bg-[var(--tl-gold)]/22 text-[var(--tl-gold-bright)] transition-all border border-[var(--tl-gold)]/30"
          >
            {copied ? (
              <><TlmnCheck className="w-3.5 h-3.5 text-emerald-300" />{t('copied')}</>
            ) : (
              <><TlmnInvite className="w-4 h-4" />{t('copy_link')}</>
            )}
          </button>
          <button
            onClick={shareLink}
            aria-label={t('share_link')}
            className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[var(--tl-gold)]/12 hover:bg-[var(--tl-gold)]/22 text-[var(--tl-gold-bright)] transition-all border border-[var(--tl-gold)]/30"
          >
            <TlmnShare className="w-4 h-4" />
          </button>
        </div>
      </div>
      )}

      {/* Spectator banner — visitor couldn't take a seat (game in progress / out of xu). */}
      {!isPlaying && !mySeat && joinError && (joinError === 'in_progress' || joinError === 'insufficient_coins') && (
        <div className="rounded-xl px-4 py-3 text-center border text-[13px] font-semibold bg-amber-50 border-amber-200 text-amber-800">
          {t(joinError === 'in_progress' ? 'spectator_started' : 'spectator_insufficient')}
        </div>
      )}
      {isPlaying && !mySeat && (
        <div className="rounded-xl px-4 py-3 text-center border text-[13px] font-semibold bg-amber-50 border-amber-200 text-amber-800">
          {t(joinError === 'insufficient_coins' ? 'spectator_insufficient' : 'spectator_started')}
        </div>
      )}

      {/* Status line (lobby only — the table shows its own status when playing) */}
      {!isPlaying && (
        <div className="rounded-xl px-4 py-2.5 flex items-center justify-center gap-3 text-[13.5px] font-semibold bg-[var(--tl-surface-muted)] border border-[var(--tl-border)] text-[var(--tl-text)]">
          <span className="flex-1 max-w-[160px] h-2 rounded-full bg-[var(--tl-red)]/12 overflow-hidden">
            <span
              className="block h-full rounded-full bg-[var(--tl-red)] transition-[width] duration-300"
              style={{ width: `${Math.min(100, (readyCount / Math.max(MIN_READY_TO_START, seats.length || 1)) * 100)}%` }}
            />
          </span>
          <span className="whitespace-nowrap">{t('status_lobby', { ready: readyCount, total: seats.length })}</span>
        </div>
      )}

      {connState === 'reconnecting' && (
        <p className="text-[13px] text-amber-700 bg-amber-50 px-4 py-2 rounded-xl border border-amber-200 w-full text-center flex items-center justify-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          {t('reconnecting')}
        </p>
      )}

      {/* ── Playing: the server-authoritative play surface ── */}
      {isPlaying && (
        <TlmnTable
          roomId={room.id}
          seats={seats}
          mySeat={mySeat ? mySeat.seat_index : null}
          isHost={isHost}
          inviteCode={room.invite_code}
          onLeave={handleLeaveNavigate}
        />
      )}

      {/* ── Lobby: seats + rule config + ready/start ── */}
      {!isPlaying && (
      <>
      {/* Seats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Array.from({ length: MAX_SEATS }, (_, i) => {
          const seat = seatByIndex(i)
          const isMe = !!seat && !!userId && seat.user_id === userId
          const isSeatHost = seat && seat.seat_index === room.host_seat
          return (
            <div
              key={i}
              className={`p-4 flex items-center gap-3 min-h-[82px] ${
                seat ? (isMe ? 'tl-seat tl-seat--me' : 'tl-seat') : 'tl-seat tl-seat--empty'
              }`}
            >
              {seat ? (
                <>
                  <Avatar name={seat.display_name} url={seat.avatar_url} host={!!isSeatHost} isBot={seat.is_bot} seatIndex={seat.seat_index} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-[14px] font-semibold text-[var(--tl-text)] truncate max-w-[150px]">
                        {seat.display_name || t('player_fallback', { n: i + 1 })}
                      </p>
                      {isSeatHost && (
                        <span className="inline-flex items-center gap-0.5 text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--tl-gold)]/20 text-[var(--tl-gold-deep)] border border-[var(--tl-gold)]/40 flex-none">
                          <TlmnCrown className="w-3 h-3" /> {t('host_badge')}
                        </span>
                      )}
                      {isMe && (
                        <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--tl-red)]/10 text-[var(--tl-red)] flex-none">
                          {t('you_badge')}
                        </span>
                      )}
                      {seat.is_bot && (
                        <span className="inline-flex items-center gap-0.5 text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--tl-ink)]/10 text-[var(--tl-text-soft)] flex-none">
                          <TlmnBot className="w-3 h-3" /> {t('bot_badge')}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--tl-text-soft)]/70 mt-0.5">
                      {t('seat_label', { n: i + 1 })}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-none">
                    <span className={`inline-flex items-center gap-1 text-[10.5px] font-bold px-2.5 py-1 rounded-full ${
                      seatReady(seat) ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300/60' : 'bg-[var(--tl-text-soft)]/15 text-[var(--tl-text-soft)]'
                    }`}>
                      {seatReady(seat) ? <><TlmnCheck className="w-3 h-3" /> {t('ready')}</> : t('not_ready')}
                    </span>
                    {isHost && seat.is_bot && (
                      <button
                        type="button"
                        onClick={() => handleRemoveBot(seat.seat_index)}
                        disabled={isBotPending}
                        className="text-[10.5px] font-semibold text-[var(--tl-red)] hover:text-[var(--tl-red-deep)] border border-[var(--tl-red)]/30 rounded-lg px-2 py-0.5 transition-colors disabled:opacity-50"
                      >
                        {t('remove_bot')}
                      </button>
                    )}
                    {isHost && !seat.is_bot && !isMe && seat.seat_index !== room.host_seat && (
                      <button
                        type="button"
                        onClick={() => handleKick(seat.seat_index)}
                        disabled={isBotPending}
                        className="text-[10.5px] font-semibold text-[var(--tl-red)] hover:text-[var(--tl-red-deep)] border border-[var(--tl-red)]/30 rounded-lg px-2 py-0.5 transition-colors disabled:opacity-50"
                      >
                        {t('kick')}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full border-2 border-dashed border-[var(--tl-border-strong)] flex items-center justify-center text-[var(--tl-text-soft)]/60 flex-none">
                    <TlmnSeatIcon className="w-6 h-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] text-[var(--tl-text-soft)] leading-snug font-medium">{t('empty_seat')}</p>
                    {isHost ? (
                      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                        {/* PRIMARY: invite a real player. SECONDARY: fill with a bot. */}
                        <button
                          type="button"
                          onClick={copyLink}
                          className="tl-btn-primary inline-flex items-center gap-1 text-[11.5px] px-2.5 py-1.5"
                        >
                          {copied ? (
                            <><TlmnCheck className="w-3 h-3" />{t('copied')}</>
                          ) : <><TlmnInvite className="w-3.5 h-3.5" /> {t('invite_friends')}</>}
                        </button>
                        <button
                          type="button"
                          onClick={handleAddBot}
                          disabled={isBotPending}
                          className="tl-btn-secondary inline-flex items-center gap-1 text-[11.5px] px-2.5 py-1.5 disabled:opacity-50"
                        >
                          <TlmnBot className="w-3.5 h-3.5" /> {t('add_bot')}
                        </button>
                      </div>
                    ) : (
                      <p className="mt-1 text-[11px] text-[var(--tl-text-soft)]/70">{t('waiting_players')}</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Host rule-config panel (read-only & live-synced for non-hosts) */}
      <TlmnRulesPanel
        roomId={room.id}
        isHost={isHost}
        override={room.settings?.rules}
        disabled={room.status !== 'lobby'}
      />

      {/* Lobby actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        {mySeat && !isHost && (
          <button
            onClick={handleReady}
            data-testid="tlmn-ready"
            disabled={isPending}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 font-bold text-[14px] px-6 py-3.5 rounded-2xl transition-all disabled:opacity-60 ${
              mySeat.is_ready
                ? 'bg-emerald-50 border border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                : 'tl-btn-primary'
            }`}
          >
            {mySeat.is_ready ? <><TlmnCheck className="w-4 h-4" /> {t('unready_btn')}</> : t('ready_btn')}
          </button>
        )}

        {isHost && (
          <button
            onClick={handleStart}
            data-testid="tlmn-start"
            disabled={!canStart || isPending}
            className="tl-btn-primary flex-1 text-[15px] px-6 py-3.5 disabled:opacity-50"
          >
            {t('start_btn')}
          </button>
        )}
      </div>

      {/* Disabled-start hint as a friendly note (host can't start yet) */}
      {isHost && !canStart && (
        <div className="-mt-1 flex items-start justify-center gap-2 rounded-xl bg-[var(--tl-surface-muted)] border border-[var(--tl-border)] px-4 py-2.5 text-[12px] font-medium text-[var(--tl-text-soft)] text-center">
          <TlmnSuits className="w-4 h-4 mt-px text-[var(--tl-red)]/50 flex-none" />
          <span>{t('start_btn_need_ready', { n: MIN_READY_TO_START })}</span>
        </div>
      )}
      </>
      )}

      {/* Leave + back (lobby only — the immersive table carries its own chrome) */}
      {!isPlaying && (
        <>
          <button
            onClick={handleLeave}
            disabled={isPending}
            className="self-center font-medium text-[13px] px-5 py-2.5 rounded-xl border border-[var(--tl-border-strong)] text-[var(--tl-text-soft)] hover:bg-[var(--tl-surface-muted)] hover:text-[var(--tl-red)] transition-all disabled:opacity-60"
          >
            {t('leave_btn')}
          </button>

          <Link
            href="/games/tlmn"
            className="text-[12.5px] text-[var(--tl-text-soft)]/80 hover:text-[var(--tl-red)] transition-colors text-center"
          >
            ← {t('back_lobby')}
          </Link>
        </>
      )}
    </div>
  )
}

// ── Avatar ──────────────────────────────────────────────────────────────────────
// Real-player avatar via the canonical site renderer (provider-proxy + retina + safe
// initials fallback). The host keeps its gold ring; the wrapper carries the ring so the
// circle clipping stays perfect at every size.
function Avatar({
  name, url, host = false, isBot = false, seatIndex = 0,
}: { name: string; url: string | null; host?: boolean; isBot?: boolean; seatIndex?: number }) {
  const ring = host ? 'tl-avatar-ring' : 'border-2 border-[var(--tl-cream-line)]'
  return (
    <span className={`inline-flex rounded-full flex-none overflow-hidden ${ring}`}>
      {isBot
        ? <BotAvatar seed={botThemeIndex(name, seatIndex)} size={48} />
        : <UserAvatar src={url} name={name} size={48} />}
    </span>
  )
}

// ── ToastAvatar (compact, for the activity toasts) ──────────────────────────────
function ToastAvatar({ name, url }: { name: string; url: string | null }) {
  return (
    <span className="inline-flex rounded-full flex-none border border-line overflow-hidden">
      <UserAvatar src={url} name={name} size={32} />
    </span>
  )
}
