'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { avatarSrc } from '@/lib/avatar'
import { getActiveDmPartnerId } from '@/lib/chat/activeDm'

type Popup = {
  id: string
  type: string
  actorName: string | null
  avatar: string | null
  url: string | null
  entering: boolean
}

const AUTO_MS = 7000
const MAX_NOTIFS = 3

const TYPE_ICON: Record<string, string> = {
  dm: '✉️', mention: '@', new_listing: '🛒', new_comment: '💬', new_reply: '↩️', auction_outbid: '🔨', auction_won: '🏆',
}

export default function CommunityNotificationProvider() {
  const t = useTranslations('notifications')
  const [userId, setUserId] = useState<string | null>(null)
  const [notifs, setNotifs] = useState<Popup[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  function badge(type: string): string {
    switch (type) {
      case 'dm':          return t('community_notif_badge_dm')
      case 'mention':     return t('community_notif_badge_mention')
      case 'new_listing': return t('community_notif_badge_new_listing')
      case 'new_comment': return t('community_notif_badge_new_comment')
      case 'new_reply':   return t('community_notif_badge_new_reply')
      case 'auction_outbid': return t('community_notif_badge_auction_outbid')
      case 'auction_won':    return t('community_notif_badge_auction_won')
      default:            return t('dropdown_title')
    }
  }
  function body(type: string): string {
    switch (type) {
      case 'dm':          return t('community_notif_title_dm')
      case 'mention':     return t('community_notif_title_mention')
      case 'new_listing': return t('community_notif_title_new_listing')
      case 'new_comment': return t('community_notif_title_new_comment')
      case 'new_reply':   return t('community_notif_title_new_reply')
      case 'auction_outbid': return t('community_notif_title_auction_outbid')
      case 'auction_won':    return t('community_notif_title_auction_won')
      default:            return ''
    }
  }

  function dismiss(id: string) {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setNotifs(prev => prev.map(n => (n.id === id ? { ...n, entering: false } : n)))
    setTimeout(() => setNotifs(prev => prev.filter(n => n.id !== id)), 320)
  }

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUserId(session?.user?.id ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!userId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`community-notif-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'community_notifications', filter: `recipient_id=eq.${userId}` },
        (payload) => {
          const n = payload.new as {
            id: string; type: string; target_url: string | null; actor_name: string | null; actor_avatar: string | null
          }
          // Mentions get their in-app popup from MentionNotificationProvider (which
          // reads community_chat_mentions) — skip here to avoid a duplicate toast.
          if (n.type === 'mention') return
          // Tab not focused → public/sw.js Web Push shows the OS notification instead.
          if (document.hidden || !document.hasFocus()) return
          if (n.type === 'dm') {
            // `?dm=<senderId>` — suppress ONLY if the user is actively viewing that
            // exact conversation. Being elsewhere on the chat page (general room or a
            // different DM) must still pop the toast.
            const dmPartnerId = n.target_url
              ? new URLSearchParams(n.target_url.split('?')[1] ?? '').get('dm')
              : null
            if (dmPartnerId && getActiveDmPartnerId() === dmPartnerId) return
          } else {
            // Already on the target page (e.g. reading that post) → skip toast.
            const targetPath = n.target_url ? n.target_url.split('?')[0] : null
            if (targetPath && window.location.pathname === targetPath) return
          }

          const popup: Popup = {
            id: n.id, type: n.type, actorName: n.actor_name, avatar: n.actor_avatar, url: n.target_url, entering: false,
          }
          setNotifs(prev => [popup, ...prev].slice(0, MAX_NOTIFS))
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              setNotifs(prev => prev.map(p => (p.id === n.id ? { ...p, entering: true } : p)))
            )
          )
          timers.current.set(n.id, setTimeout(() => dismiss(n.id), AUTO_MS))
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
            <div className="h-[3px] bg-rose/15"><div className="h-full bg-rose animate-mention-shrink" /></div>
          )}
          <div className="p-3.5">
            <div className="flex items-start gap-2.5">
              {notif.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarSrc(notif.avatar)} alt="" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full object-cover ring-2 ring-white flex-none" />
              ) : (
                <div className="w-8 h-8 rounded-full flex-none grid place-items-center text-[14px] ring-2 ring-white bg-rose/10">{TYPE_ICON[notif.type] ?? '🔔'}</div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10.5px] font-bold text-rose">{badge(notif.type)}</span>
                </div>
                <p className="text-[13px] font-semibold text-ink leading-tight truncate">{notif.actorName ?? t('community_notif_someone')}</p>
                <p className="text-[12px] text-muted mt-0.5 leading-snug line-clamp-2">{body(notif.type)}</p>
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
