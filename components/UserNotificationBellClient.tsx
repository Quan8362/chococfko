'use client'

import { useState, useEffect, useRef, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { avatarSrc } from '@/lib/avatar'
import { markCommunityRead, markAllCommunityRead } from '@/app/notifications/actions'
import type { CommunityNotification } from '@/lib/notifications/user'

function relTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diff < 1) return 'vừa xong'
  if (diff < 60) return `${diff}m`
  const h = Math.floor(diff / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

const TYPE_ICON: Record<string, string> = {
  dm:             '✉️',
  mention:        '@',
  new_listing:    '🛒',
  new_comment:    '💬',
  new_reply:      '↩️',
  auction_outbid: '🔨',
  auction_won:    '🏆',
}

type Props = {
  userId: string
  initialUnread: number
  initialNotifications: CommunityNotification[]
}

export default function UserNotificationBellClient({ userId, initialUnread, initialNotifications }: Props) {
  const t = useTranslations('notifications')
  const router = useRouter()

  function localizedTitle(type: string): string {
    switch (type) {
      case 'dm':          return t('community_notif_title_dm')
      case 'mention':     return t('community_notif_title_mention')
      case 'new_listing': return t('community_notif_title_new_listing')
      case 'new_comment': return t('community_notif_title_new_comment')
      case 'new_reply':   return t('community_notif_title_new_reply')
      case 'auction_outbid': return t('community_notif_title_auction_outbid')
      case 'auction_won':    return t('community_notif_title_auction_won')
      default:            return t('dropdown_title')
    }
  }

  const [open, setOpen]   = useState(false)
  const [unread, setUnread] = useState(initialUnread)
  const [items, setItems] = useState<CommunityNotification[]>(initialNotifications)
  const [, startTransition] = useTransition()
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!userId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`user_notif_${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'community_notifications', filter: `recipient_id=eq.${userId}` },
        (payload) => {
          const notif = payload.new as CommunityNotification
          setUnread(prev => prev + 1)
          setItems(prev => [notif, ...prev.slice(0, 11)])
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  const handleClick = useCallback(async (notif: CommunityNotification) => {
    setOpen(false)
    if (!notif.is_read) {
      setUnread(prev => Math.max(0, prev - 1))
      setItems(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n))
      startTransition(() => { markCommunityRead(notif.id) })
    }
    if (notif.target_url) router.push(notif.target_url)
  }, [router])

  const handleMarkAll = useCallback(() => {
    setUnread(0)
    setItems(prev => prev.map(n => ({ ...n, is_read: true })))
    startTransition(() => { markAllCommunityRead() })
  }, [])

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        aria-label={t('bell_label')}
        className="relative w-9 h-9 flex items-center justify-center rounded-xl border border-line bg-paper hover:bg-rose-soft/50 hover:border-rose/30 transition-all"
      >
        <svg className="w-[18px] h-[18px] text-muted/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-[3px] rounded-full bg-rose text-white text-[10px] font-black flex items-center justify-center leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="animate-fadein absolute right-0 top-[calc(100%+8px)] w-[330px] bg-paper border border-line rounded-2xl shadow-dropdown overflow-hidden z-[200]">
          <div className="px-4 py-3 bg-cream/60 border-b border-line flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[13px] text-ink">{t('dropdown_title')}</span>
              {unread > 0 && (
                <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded-full bg-rose text-white leading-none">{unread}</span>
              )}
            </div>
            {unread > 0 && (
              <button onClick={handleMarkAll} className="text-[11.5px] font-medium text-muted/70 hover:text-rose transition-colors">
                {t('mark_all_read')}
              </button>
            )}
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-[24px] mb-2">🔕</p>
                <p className="text-[13px] text-muted/60">{t('empty_title')}</p>
              </div>
            ) : (
              items.map(notif => (
                <button
                  key={notif.id}
                  onClick={() => handleClick(notif)}
                  className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b border-line/50 last:border-b-0 transition-colors ${
                    notif.is_read ? 'hover:bg-cream/60' : 'bg-rose-soft/30 hover:bg-rose-soft/50'
                  }`}
                >
                  {notif.actor_avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarSrc(notif.actor_avatar)} alt="" referrerPolicy="no-referrer" className="w-9 h-9 rounded-full object-cover flex-none ring-2 ring-white" />
                  ) : (
                    <span className={`w-9 h-9 rounded-full flex items-center justify-center text-[15px] flex-none ${notif.is_read ? 'bg-cream' : 'bg-rose/10'}`}>
                      {TYPE_ICON[notif.type] ?? '🔔'}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={`text-[12.5px] font-semibold leading-snug ${notif.is_read ? 'text-ink/60' : 'text-ink'}`}>
                        {localizedTitle(notif.type)}
                      </p>
                      {!notif.is_read && <span className="w-1.5 h-1.5 rounded-full bg-rose flex-none" />}
                    </div>
                    {notif.actor_name && (
                      <p className="text-[11.5px] text-muted/70 truncate">{notif.actor_name}</p>
                    )}
                    <p className="text-[11px] text-muted/40 mt-0.5">{relTime(notif.created_at)}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
