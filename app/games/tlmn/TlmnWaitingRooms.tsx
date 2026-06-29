'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { fetchWaitingRooms, joinRoomFromLobby, type WaitingRoom } from './actions'
import { TlmnHourglass, TlmnTwoCards } from './icons'

const MAX_SEATS = 4

type Props = {
  initialRooms: WaitingRoom[]
  userId: string | null
}

function timeAgo(iso: string, justNow: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diff < 1) return justNow
  if (diff < 60) return `${diff}m`
  const hrs = Math.floor(diff / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

// Public "Phòng chờ" list — mirrors Cờ Caro's CaroWaitingRooms: a postgres_changes
// channel over tlmn_rooms + tlmn_seats re-fetches the authoritative list on any change
// (room created / player or bot joins / room fills or starts / host goes offline), with
// a slow poll as a safety net. Only MODE-B waiting rooms appear (see fetchWaitingRooms).
export default function TlmnWaitingRooms({ initialRooms, userId }: Props) {
  const t = useTranslations('games.tlmn')
  const router = useRouter()
  const [rooms, setRooms] = useState<WaitingRoom[]>(initialRooms)
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    const supabase = createClient()
    const refresh = async () => setRooms(await fetchWaitingRooms())
    const channel = supabase
      .channel('tlmn_lobby')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tlmn_rooms' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tlmn_seats' }, refresh)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // Poll fallback: catch rooms that went stale (host closed tab) without a DB event.
  useEffect(() => {
    const id = setInterval(async () => setRooms(await fetchWaitingRooms()), 30000)
    return () => clearInterval(id)
  }, [])

  const handleJoin = (code: string) => {
    setError(null)
    setJoining(code)
    startTransition(async () => {
      const res = await joinRoomFromLobby(code)
      if (res?.error) {
        const msg =
          res.error === 'full' ? t('lobby_room_full') :
          res.error === 'in_progress' ? t('lobby_room_started') :
          res.error === 'not_found' ? t('lobby_room_gone') :
          res.error === 'insufficient_coins' ? t('lobby_join_insufficient') :
          res.error === 'not_logged_in' ? t('lobby_login_to_join') :
          t('lobby_join_error')
        setError(msg)
        setJoining(null)
      } else {
        router.push(`/games/tlmn/${code}`)
      }
    })
  }

  return (
    <div className="mt-8">
      <h2 className="font-serif font-bold text-[20px] tl-section-title mb-1 flex items-center gap-2.5">
        <TlmnHourglass className="flex-none w-[22px] h-[22px] text-[var(--tl-red)]" />
        {t('lobby_title')}
      </h2>
      <p className="text-[13.5px] tl-section-sub mb-4 leading-relaxed">{t('lobby_section_desc')}</p>

      {error && (
        <p className="text-[13px] text-white bg-[var(--tl-red-bright)]/90 px-4 py-2.5 rounded-xl border border-[var(--tl-gold)]/30 text-center mb-4">
          {error}
        </p>
      )}

      {rooms.length === 0 ? (
        <div className="tl-panel px-5 py-10 text-center relative overflow-hidden">
          <TlmnTwoCards variant="empty" className="w-8 h-8 sm:w-9 sm:h-9 mx-auto mb-3.5" />
          <p className="text-[13.5px] text-[var(--tl-text-soft)] leading-relaxed max-w-[360px] mx-auto">
            {t('lobby_empty')}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {rooms.map(room => (
            <div
              key={room.id}
              className="tl-panel flex items-center gap-4 px-4 py-3.5 hover:border-[var(--tl-red)]/40 transition-colors"
            >
              <Avatar name={room.host_name} url={room.host_avatar} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="font-mono font-black text-[16px] text-[var(--tl-text)] tracking-[0.15em]">
                    {room.invite_code}
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--tl-gold)]/15 text-[var(--tl-gold-deep)] border border-[var(--tl-gold)]/40 flex-none">
                    {t('lobby_waiting_badge')}
                  </span>
                  <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-[var(--tl-red)]/8 border border-[var(--tl-red)]/20 text-[var(--tl-red)] flex-none">
                    {t('lobby_seat_count', { count: room.seat_count, max: MAX_SEATS })}
                  </span>
                </div>
                <p className="text-[12.5px] text-[var(--tl-text-soft)] truncate">
                  <span className="text-[var(--tl-text-soft)]/70">{t('lobby_host')}: </span>
                  <span className="font-medium text-[var(--tl-text)]">{room.host_name || t('player_fallback', { n: 1 })}</span>
                </p>
                <p className="text-[11px] text-[var(--tl-text-soft)]/60 mt-0.5">
                  {timeAgo(room.updated_at, t('just_created'))}
                </p>
              </div>

              {userId ? (
                <button
                  onClick={() => handleJoin(room.invite_code)}
                  disabled={isPending && joining === room.invite_code}
                  className="tl-btn-primary flex-none text-[13px] px-5 py-2.5 disabled:opacity-50 whitespace-nowrap"
                >
                  {isPending && joining === room.invite_code ? '…' : t('lobby_join_btn')}
                </button>
              ) : (
                <a
                  href="/login"
                  className="tl-btn-ghost flex-none text-[12.5px] px-4 py-2.5 whitespace-nowrap"
                >
                  {t('lobby_login_to_join')}
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase()
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="tl-avatar-ring w-11 h-11 rounded-full object-cover flex-none" />
  }
  return (
    <div className="tl-avatar-ring w-11 h-11 rounded-full bg-gradient-to-br from-[var(--tl-red)]/15 to-[var(--tl-gold)]/15 flex items-center justify-center font-serif font-bold text-[16px] text-[var(--tl-red)] flex-none">
      {initial}
    </div>
  )
}
