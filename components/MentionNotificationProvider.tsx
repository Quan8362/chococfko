'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type MentionNotif = {
  id: string
  senderName: string
  senderAvatar: string | null
  messagePreview: string
  roomName: string
  roomUrl: string
  entering: boolean
}

const AUTO_MS = 6000
const MAX_NOTIFS = 3

function fireOsNotification(
  title: string,
  body: string,
  icon: string | null,
  tag: string,
  onClick: () => void,
) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const n = new Notification(title, {
    body,
    icon: icon ?? '/logo-nav.png',
    badge: '/logo-nav.png',
    tag,
    requireInteraction: false,
  })
  n.onclick = () => { onClick(); n.close() }
}

export default function MentionNotificationProvider() {
  const router = useRouter()
  // Store router in ref so the Realtime async callback always has the latest instance
  const routerRef = useRef(router)
  useEffect(() => { routerRef.current = router }, [router])

  const [userId, setUserId] = useState<string | null>(null)
  const [notifs, setNotifs] = useState<MentionNotif[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Auth state
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUserId(session?.user?.id ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Ask for OS notification permission when user logs in
  useEffect(() => {
    if (!userId) return
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [userId])

  // Realtime subscription to community_chat_mentions
  useEffect(() => {
    if (!userId) return
    const supabase = createClient()

    const channel = supabase
      .channel(`mention-popup-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'community_chat_mentions',
          filter: `mentioned_user_id=eq.${userId}`,
        },
        async (payload) => {
          const { id: mentionId, message_id, room_id } = payload.new as {
            id: string
            message_id: string
            room_id: string | null
          }
          if (!room_id) return

          const [{ data: msg }, { data: room }] = await Promise.all([
            supabase
              .from('community_chat_messages')
              .select('display_name, avatar_url, message')
              .eq('id', message_id)
              .single(),
            supabase
              .from('community_chat_rooms')
              .select('key, name')
              .eq('id', room_id)
              .single(),
          ])
          if (!msg || !room) return

          // Suppress if user is already viewing this exact room
          const params = new URLSearchParams(window.location.search)
          if (
            window.location.pathname.includes('/cong-dong/chat') &&
            params.get('room') === room.key
          ) return

          const preview = (msg.message ?? '')
            .replace(/<[^>]+>/g, '')
            .trim()
            .slice(0, 60)
          const roomUrl = `/cong-dong/chat?room=${room.key}`

          // Browser is backgrounded / tab not focused → OS system notification
          if (document.hidden || !document.hasFocus()) {
            fireOsNotification(
              `${msg.display_name ?? '?'} đề cập đến bạn`,
              `${room.name}: ${preview}${preview.length >= 60 ? '…' : ''}`,
              msg.avatar_url ?? null,
              mentionId,
              () => {
                window.focus()
                routerRef.current.push(roomUrl)
              },
            )
            return
          }

          // Tab is active → in-app popup
          const notif: MentionNotif = {
            id: mentionId,
            senderName: msg.display_name ?? '???',
            senderAvatar: msg.avatar_url ?? null,
            messagePreview: preview,
            roomName: room.name,
            roomUrl,
            entering: false,
          }

          setNotifs(prev => [notif, ...prev].slice(0, MAX_NOTIFS))

          // Double rAF ensures element is in DOM before CSS transition starts
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              setNotifs(prev =>
                prev.map(n => (n.id === mentionId ? { ...n, entering: true } : n))
              )
            )
          )

          const t = setTimeout(() => dismiss(mentionId), AUTO_MS)
          timers.current.set(mentionId, t)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  function dismiss(id: string) {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setNotifs(prev => prev.map(n => (n.id === id ? { ...n, entering: false } : n)))
    setTimeout(() => setNotifs(prev => prev.filter(n => n.id !== id)), 320)
  }

  if (!userId || notifs.length === 0) return null

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-3 items-end pointer-events-none">
      {notifs.map(notif => (
        <div
          key={notif.id}
          className={`pointer-events-auto w-[320px] bg-white rounded-2xl shadow-[0_8px_32px_-6px_rgba(36,26,23,0.2)] border border-line overflow-hidden transition-all duration-300 ease-out ${
            notif.entering
              ? 'opacity-100 translate-x-0'
              : 'opacity-0 translate-x-10'
          }`}
        >
          {/* Countdown progress bar */}
          {notif.entering && (
            <div className="h-[3px] bg-rose/15">
              <div className="h-full bg-rose animate-mention-shrink" />
            </div>
          )}

          <div className="p-3.5">
            <div className="flex items-start gap-2.5">
              {/* Sender avatar */}
              {notif.senderAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={notif.senderAvatar}
                  alt={notif.senderName}
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                  className="w-8 h-8 rounded-full object-cover ring-2 ring-white flex-none"
                />
              ) : (
                <div className="w-8 h-8 rounded-full flex-none grid place-items-center text-[12px] font-bold ring-2 ring-white bg-gradient-to-br from-rose/40 to-teal/40 text-ink">
                  {notif.senderName[0]?.toUpperCase() ?? '?'}
                </div>
              )}

              {/* Message info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10.5px] font-bold text-rose">@ đề cập</span>
                  <span className="text-muted/40 text-[10px]">·</span>
                  <span className="text-[10.5px] text-muted truncate">{notif.roomName}</span>
                </div>
                <p className="text-[13px] font-semibold text-ink leading-tight truncate">
                  {notif.senderName}
                </p>
                <p className="text-[12px] text-muted mt-0.5 leading-snug line-clamp-2">
                  {notif.messagePreview}
                  {notif.messagePreview.length >= 60 ? '…' : ''}
                </p>
              </div>

              {/* Dismiss button */}
              <button
                onClick={() => dismiss(notif.id)}
                className="flex-none text-muted/40 hover:text-muted transition-colors mt-0.5 p-0.5"
                aria-label="Đóng"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* View button */}
            <div className="mt-2.5 flex justify-end">
              <Link
                href={notif.roomUrl}
                onClick={() => dismiss(notif.id)}
                className="text-[12px] font-semibold px-4 py-1.5 rounded-lg bg-rose text-white hover:bg-rose-deep transition-colors"
              >
                Xem ngay →
              </Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
