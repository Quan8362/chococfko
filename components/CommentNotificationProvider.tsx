'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { avatarSrc } from '@/lib/avatar'

type CommentNotif = {
  id: string
  title: string
  avatar: string | null
  url: string | null
  entering: boolean
}

const AUTO_MS = 7000
const MAX_NOTIFS = 3

export default function CommentNotificationProvider() {
  const t = useTranslations('notifications')
  const [userId, setUserId] = useState<string | null>(null)
  const [notifs, setNotifs] = useState<CommentNotif[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  function dismiss(id: string) {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setNotifs(prev => prev.map(n => (n.id === id ? { ...n, entering: false } : n)))
    setTimeout(() => setNotifs(prev => prev.filter(n => n.id !== id)), 320)
  }

  // Auth state
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUserId(session?.user?.id ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Realtime: new community notifications for this user
  useEffect(() => {
    if (!userId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`comment-notif-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'community_notifications',
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const n = payload.new as {
            id: string; target_url: string | null; actor_name: string | null; actor_avatar: string | null
          }
          // Tab not focused → Web Push shows the OS notification. Leave it.
          if (document.hidden || !document.hasFocus()) return
          // Already reading this exact post → no toast needed.
          const targetPath = n.target_url ? n.target_url.split('?')[0] : null
          if (targetPath && window.location.pathname === targetPath) return

          const popup: CommentNotif = {
            id: n.id,
            title: n.actor_name ?? t('comment_notif_someone'),
            avatar: n.actor_avatar,
            url: n.target_url,
            entering: false,
          }
          setNotifs(prev => [popup, ...prev].slice(0, MAX_NOTIFS))
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              setNotifs(prev => prev.map(p => (p.id === n.id ? { ...p, entering: true } : p)))
            )
          )
          const tm = setTimeout(() => dismiss(n.id), AUTO_MS)
          timers.current.set(n.id, tm)
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!userId || notifs.length === 0) return null

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-3 items-end pointer-events-none">
      {notifs.map(notif => (
        <div
          key={notif.id}
          className={`pointer-events-auto w-[320px] bg-white rounded-2xl shadow-[0_8px_32px_-6px_rgba(36,26,23,0.2)] border border-line overflow-hidden transition-all duration-300 ease-out ${
            notif.entering ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-10'
          }`}
        >
          {notif.entering && (
            <div className="h-[3px] bg-rose/15">
              <div className="h-full bg-rose animate-mention-shrink" />
            </div>
          )}
          <div className="p-3.5">
            <div className="flex items-start gap-2.5">
              {notif.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarSrc(notif.avatar)}
                  alt={notif.title}
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-full object-cover ring-2 ring-white flex-none"
                />
              ) : (
                <div className="w-8 h-8 rounded-full flex-none grid place-items-center text-[14px] ring-2 ring-white bg-rose/10">💬</div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10.5px] font-bold text-rose">{t('comment_notif_badge')}</span>
                </div>
                <p className="text-[13px] font-semibold text-ink leading-tight truncate">{notif.title}</p>
                <p className="text-[12px] text-muted mt-0.5 leading-snug line-clamp-2">{t('comment_notif_body')}</p>
              </div>
              <button
                onClick={() => dismiss(notif.id)}
                className="flex-none text-muted/40 hover:text-muted transition-colors mt-0.5 p-0.5"
                aria-label={t('close')}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {notif.url && (
              <div className="mt-2.5 flex justify-end">
                <a
                  href={notif.url}
                  onClick={() => dismiss(notif.id)}
                  className="text-[12px] font-semibold px-4 py-1.5 rounded-lg bg-rose text-white hover:bg-rose-deep transition-colors"
                >
                  {t('view_now')}
                </a>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
