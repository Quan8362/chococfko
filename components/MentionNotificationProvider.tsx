'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { avatarSrc } from '@/lib/avatar'

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

export default function MentionNotificationProvider() {
  const tn = useTranslations('notifications')
  const [userId, setUserId] = useState<string | null>(null)
  const [notifs, setNotifs] = useState<MentionNotif[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Register service worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])

  // Auth state
  useEffect(() => {
    const supabase = createClient()
    // getSession() (local + lock-serialized refresh) instead of getUser() (a forced
    // /user network call): we only need the id to scope the realtime subscription —
    // RLS still enforces access — and this avoids an extra refresh racing the
    // middleware refresh on the shared refresh token during a tab resume.
    supabase.auth.getSession().then(({ data: { session } }) => setUserId(session?.user?.id ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUserId(session?.user?.id ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // OS notification permission is requested explicitly via NotificationPermissionBanner
  // (a clear user gesture), so we don't auto-prompt here.

  // Navigate when the service worker asks (after a notification click). Using
  // window.location here always works, unlike SW client.navigate() which fails
  // for windows the SW doesn't control.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMsg = (e: MessageEvent) => {
      const data = e.data as { type?: string; url?: string } | null
      if (data?.type === 'notification-navigate' && data.url) {
        window.location.assign(data.url)
      }
    }
    navigator.serviceWorker.addEventListener('message', onMsg)
    return () => navigator.serviceWorker.removeEventListener('message', onMsg)
  }, [])

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
          const [{ data: msg }, { data: roomData }] = await Promise.all([
            supabase
              .from('community_chat_messages')
              .select('display_name, avatar_url, message')
              .eq('id', message_id)
              .single(),
            room_id
              ? supabase
                  .from('community_chat_rooms')
                  .select('key, name')
                  .eq('id', room_id)
                  .single()
              : Promise.resolve({ data: null }),
          ])
          if (!msg) return

          const room = roomData as { key: string; name: string } | null

          // Tab not focused (background / minimized / closed) → Web Push shows the
          // OS notification via the service worker. Leave it.
          if (document.hidden || !document.hasFocus()) return

          // Focused → the push also fired an OS notification. Close it (user is in
          // the app) and show the in-app toast instead.
          if ('serviceWorker' in navigator) {
            const closeIt = () => navigator.serviceWorker.getRegistration()
              .then(reg => reg?.getNotifications({ tag: `mention-${message_id}` }))
              .then(ns => (ns || []).forEach(n => n.close()))
              .catch(() => {})
            closeIt()
            setTimeout(closeIt, 1500)
          }

          const params = new URLSearchParams(window.location.search)
          const viewingThisRoom =
            window.location.pathname.includes('/community/chat') &&
            room && params.get('room') === room.key
          // Focused & actively viewing this room → they see the message live.
          if (viewingThisRoom) return

          const preview = (msg.message ?? '')
            .replace(/<[^>]+>/g, '')
            .trim()
            .slice(0, 60)
          const roomName = room?.name ?? tn('mention_dm_room')
          const roomUrl = room
            ? `/community/chat?room=${room.key}&msg=${message_id}`
            : `/community/chat?msg=${message_id}`

          // Tab is active → in-app popup
          const notif: MentionNotif = {
            id: mentionId,
            senderName: msg.display_name ?? '???',
            senderAvatar: msg.avatar_url ?? null,
            messagePreview: preview,
            roomName,
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
    <div className="fixed bottom-5 right-5 left-5 sm:left-auto z-[9999] flex flex-col gap-3 items-end pointer-events-none">
      {notifs.map(notif => (
        <div
          key={notif.id}
          className={`pointer-events-auto w-[min(320px,100%)] bg-white rounded-2xl shadow-[0_8px_32px_-6px_rgba(36,26,23,0.2)] border border-line overflow-hidden transition-all duration-300 ease-out ${
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
                  src={avatarSrc(notif.senderAvatar)}
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
                  <span className="text-[10.5px] font-bold text-rose">{tn('mention_badge')}</span>
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
                aria-label={tn('close')}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* View button */}
            <div className="mt-2.5 flex justify-end">
              <a
                href={notif.roomUrl}
                onClick={() => dismiss(notif.id)}
                className="text-[12px] font-semibold px-4 py-1.5 rounded-lg bg-rose text-white hover:bg-rose-deep transition-colors"
              >
                {tn('view_now')}
              </a>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
