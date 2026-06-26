'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import {
  refetchRoomState, toggleReady, startGame, leaveSeat, updateSettings, heartbeatRoom,
  type TlmnRoomState, type TlmnSeat,
} from '../actions'

const MAX_SEATS = 4
const MIN_READY_TO_START = 2
const RULES_PRESETS = ['classic', 'no_two_chop', 'instant_win'] as const

type Props = {
  initialState: TlmnRoomState
  userId: string | null
}

export default function TlmnRoom({ initialState, userId }: Props) {
  const t = useTranslations('games.tlmn')
  const router = useRouter()
  const [state, setState] = useState<TlmnRoomState>(initialState)
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [connState, setConnState] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting')
  const mountedRef = useRef(true)

  const { room, seats } = state
  const seatByIndex = (i: number): TlmnSeat | undefined => seats.find(s => s.seat_index === i)
  const mySeat = userId ? seats.find(s => s.user_id === userId) : undefined
  const isHost = !!mySeat && mySeat.seat_index === room.host_seat
  const readyCount = seats.filter(s => s.is_ready).length
  const canStart = isHost && room.status === 'lobby' && readyCount >= MIN_READY_TO_START

  const inviteUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/games/tlmn/${room.invite_code}`
    : ''
  const currentRules = room.settings?.rules ?? 'classic'

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
      .subscribe(status => {
        if (!mountedRef.current) return
        if (status === 'SUBSCRIBED') {
          setConnState('connected')
          reconcile()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnState('reconnecting')
        }
      })

    return () => { sb.removeChannel(ch) }
  }, [room.id])

  // ── Heartbeat: keep my seat marked connected ────────────────────────────────
  useEffect(() => {
    if (!mySeat) return
    heartbeatRoom(room.id)
    const interval = setInterval(() => heartbeatRoom(room.id), 25000)
    return () => clearInterval(interval)
  }, [room.id, mySeat])

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

  const handleReady = () => {
    startTransition(async () => { await toggleReady(room.id) })
  }

  const handleStart = () => {
    startTransition(async () => { await startGame(room.id) })
  }

  const handleLeave = () => {
    startTransition(async () => {
      await leaveSeat(room.id)
      router.push('/games/tlmn')
    })
  }

  const handleRules = (rules: string) => {
    startTransition(async () => { await updateSettings(room.id, { rules }) })
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5">

      {/* Room code banner */}
      <div className="w-full bg-gradient-to-r from-ink to-[#3a2d22] rounded-2xl px-5 py-4 flex items-center justify-between gap-3 shadow-lg">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[2px] text-white/50 mb-0.5">{t('room_code_label')}</p>
          <p className="font-mono font-black text-[28px] text-white tracking-[0.2em] leading-none">
            {room.invite_code}
          </p>
        </div>
        <button
          onClick={copyLink}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all border border-white/15"
        >
          {copied ? (
            <><svg className="w-3.5 h-3.5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>{t('copied')}</>
          ) : (
            <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>{t('copy_link')}</>
          )}
        </button>
      </div>

      {/* Status line */}
      <div className={`rounded-xl px-4 py-3 text-center border text-[13.5px] font-semibold ${
        room.status === 'playing'
          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
          : 'bg-cream border-line text-ink'
      }`}>
        {room.status === 'playing'
          ? t('status_playing')
          : t('status_lobby', { ready: readyCount, total: seats.length })}
      </div>

      {connState === 'reconnecting' && (
        <p className="text-[13px] text-amber-700 bg-amber-50 px-4 py-2 rounded-xl border border-amber-200 w-full text-center flex items-center justify-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          {t('reconnecting')}
        </p>
      )}

      {/* Seats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Array.from({ length: MAX_SEATS }, (_, i) => {
          const seat = seatByIndex(i)
          const isMe = !!seat && !!userId && seat.user_id === userId
          const isSeatHost = seat && seat.seat_index === room.host_seat
          return (
            <div
              key={i}
              className={`rounded-2xl border p-4 flex items-center gap-3 min-h-[78px] transition-all ${
                seat
                  ? isMe ? 'border-rose/40 bg-rose/5' : 'border-line bg-paper'
                  : 'border-dashed border-line bg-cream/40'
              }`}
            >
              {seat ? (
                <>
                  <Avatar name={seat.display_name} url={seat.avatar_url} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-[14px] font-semibold text-ink truncate max-w-[150px]">
                        {seat.display_name || t('player_fallback', { n: i + 1 })}
                      </p>
                      {isSeatHost && (
                        <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-gold/15 text-gold flex-none">
                          👑 {t('host_badge')}
                        </span>
                      )}
                      {isMe && (
                        <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-rose/10 text-rose flex-none">
                          {t('you_badge')}
                        </span>
                      )}
                      {seat.is_bot && (
                        <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-ink/10 text-ink/70 flex-none">
                          🤖 {t('bot_badge')}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted/60 mt-0.5">
                      {t('seat_label', { n: i + 1 })}
                    </p>
                  </div>
                  <span className={`text-[10.5px] font-bold px-2.5 py-1 rounded-full flex-none ${
                    seat.is_ready ? 'bg-emerald-100 text-emerald-700' : 'bg-line text-muted'
                  }`}>
                    {seat.is_ready ? `✓ ${t('ready')}` : t('not_ready')}
                  </span>
                </>
              ) : (
                <>
                  <div className="w-11 h-11 rounded-full border-2 border-dashed border-line flex items-center justify-center text-muted/30 text-[20px] flex-none">
                    +
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] text-muted/70 leading-snug">{t('empty_seat')}</p>
                    {/* Add-Bot button is a Phase-1 stub; becomes functional in Phase 5. */}
                    <button
                      type="button"
                      disabled
                      title={t('add_bot_soon')}
                      className="mt-1 text-[11.5px] font-semibold text-muted/50 border border-line rounded-lg px-2.5 py-1 cursor-not-allowed"
                    >
                      🤖 {t('add_bot')}
                    </button>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Room settings stub */}
      <div className="bg-paper border border-line rounded-2xl p-4">
        <p className="text-[11px] font-bold text-muted uppercase tracking-[1.5px] mb-2.5">
          ⚙️ {t('settings_heading')}
        </p>
        <div className="flex flex-wrap gap-2">
          {RULES_PRESETS.map(preset => {
            const active = currentRules === preset
            return (
              <button
                key={preset}
                type="button"
                disabled={!isHost || room.status !== 'lobby' || isPending}
                onClick={() => handleRules(preset)}
                className={`text-[12.5px] font-semibold px-3.5 py-1.5 rounded-xl border transition-all disabled:cursor-not-allowed ${
                  active
                    ? 'border-rose/50 bg-rose/5 text-rose'
                    : 'border-line text-muted hover:border-rose/30 disabled:hover:border-line'
                }`}
              >
                {t(`rules_${preset}` as Parameters<typeof t>[0])}
              </button>
            )
          })}
        </div>
        {!isHost && (
          <p className="text-[11.5px] text-muted/60 mt-2">{t('settings_host_only')}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        {mySeat && room.status === 'lobby' && (
          <button
            onClick={handleReady}
            disabled={isPending}
            className={`flex-1 font-semibold text-[14px] px-6 py-3 rounded-xl transition-all disabled:opacity-60 ${
              mySeat.is_ready
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                : 'bg-ink text-white hover:bg-ink/85'
            }`}
          >
            {mySeat.is_ready ? `✓ ${t('unready_btn')}` : t('ready_btn')}
          </button>
        )}

        {isHost && room.status === 'lobby' && (
          <button
            onClick={handleStart}
            disabled={!canStart || isPending}
            className="flex-1 font-semibold text-[14px] px-6 py-3 rounded-xl bg-rose text-white hover:bg-rose-deep transition-all disabled:opacity-50 disabled:hover:bg-rose shadow-[0_4px_18px_-4px_rgba(194,24,91,0.45)]"
          >
            {canStart ? t('start_btn') : t('start_btn_need_ready', { n: MIN_READY_TO_START })}
          </button>
        )}

        <button
          onClick={handleLeave}
          disabled={isPending}
          className="flex-none font-medium text-[13px] px-5 py-3 rounded-xl border border-line text-muted hover:bg-line transition-all disabled:opacity-60"
        >
          {t('leave_btn')}
        </button>
      </div>

      <Link
        href="/games/tlmn"
        className="text-[12.5px] text-muted/70 hover:text-rose transition-colors text-center"
      >
        ← {t('back_lobby')}
      </Link>
    </div>
  )
}

// ── Avatar ──────────────────────────────────────────────────────────────────────
function Avatar({ name, url }: { name: string; url: string | null }) {
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase()
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className="w-11 h-11 rounded-full object-cover flex-none border border-line" />
  }
  return (
    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-rose/20 to-gold/10 flex items-center justify-center font-serif font-bold text-[18px] text-rose flex-none">
      {initial}
    </div>
  )
}
