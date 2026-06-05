'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { fetchWaitingRooms, joinRoomFromLobby, type WaitingRoom } from './actions'

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

export default function CaroWaitingRooms({ initialRooms, userId }: Props) {
  const t = useTranslations('games.caro')
  const router = useRouter()
  const [rooms, setRooms] = useState<WaitingRoom[]>(initialRooms)
  const [error, setError] = useState<string | null>(null)
  const [joiningRoom, setJoiningRoom] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Realtime: refresh on any caro_rooms change (new room, player joins, etc.)
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('caro_lobby')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'caro_rooms' }, async () => {
        const updated = await fetchWaitingRooms()
        setRooms(updated)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // Polling fallback: catch rooms that went stale without a DB change event
  useEffect(() => {
    const interval = setInterval(async () => {
      const updated = await fetchWaitingRooms()
      setRooms(updated)
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  const handleJoin = (roomCode: string) => {
    setError(null)
    setJoiningRoom(roomCode)
    startTransition(async () => {
      const result = await joinRoomFromLobby(roomCode)
      if (result?.error) {
        const msg =
          result.error === 'full' ? t('lobby_room_full') :
          result.error === 'stale' ? t('lobby_room_stale') :
          result.error === 'not_logged_in' ? t('lobby_login_required') :
          t('lobby_join_error')
        setError(msg)
        setJoiningRoom(null)
      } else {
        router.push(`/games/caro/${roomCode}`)
      }
    })
  }

  return (
    <div className="mt-10">
      <h2 className="font-serif font-bold text-[20px] text-ink mb-1 flex items-center gap-2">
        ⏳ {t('lobby_title')}
      </h2>
      <p className="text-[13.5px] text-muted mb-4 leading-relaxed">{t('lobby_section_desc')}</p>

      {error && (
        <p className="text-[13px] text-red-600 bg-red-50 px-4 py-2.5 rounded-xl border border-red-100 text-center mb-4">
          {error}
        </p>
      )}

      {rooms.length === 0 ? (
        <div className="bg-paper border border-line rounded-2xl px-5 py-10 text-center text-[13.5px] text-muted/60 leading-relaxed">
          {t('lobby_empty')}
        </div>
      ) : (
        <div className="space-y-2.5">
          {rooms.map(room => (
            <div
              key={room.id}
              className="flex items-center gap-4 px-4 py-3.5 rounded-xl border border-line bg-paper hover:border-rose/30 transition-colors group"
            >
              {/* Symbol indicator */}
              <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200/70 flex items-center justify-center flex-none">
                <span className="font-black text-[18px] text-blue-600 leading-none">✕</span>
              </div>

              {/* Room info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="font-mono font-black text-[16px] text-ink tracking-[0.15em]">
                    {room.room_code}
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 flex-none">
                    {t('lobby_waiting_badge')}
                  </span>
                </div>
                <p className="text-[12.5px] text-muted/70 truncate">
                  <span className="text-muted/50">{t('lobby_host')}: </span>
                  <span className="font-medium">{room.player_x_name || t('waiting_player')}</span>
                </p>
                <p className="text-[11px] text-muted/40 mt-0.5">
                  {timeAgo(room.updated_at, t('just_created'))}
                </p>
              </div>

              {/* Action button */}
              {userId ? (
                <button
                  onClick={() => handleJoin(room.room_code)}
                  disabled={isPending && joiningRoom === room.room_code}
                  className="flex-none text-[13px] font-semibold px-4 py-2.5 rounded-xl bg-rose text-white hover:bg-rose-deep transition-all disabled:opacity-50 shadow-sm whitespace-nowrap"
                >
                  {isPending && joiningRoom === room.room_code ? '…' : t('lobby_join_btn')}
                </button>
              ) : (
                <a
                  href="/dang-nhap"
                  className="flex-none text-[12.5px] font-semibold px-4 py-2.5 rounded-xl border border-rose/30 text-rose hover:bg-rose/5 transition-all whitespace-nowrap"
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
