'use client'

import { useState, useEffect, useRef, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { markAsRead, markAllAsRead } from '@/app/admin/notifications/actions'
import type { AdminNotification } from '@/lib/admin/notifications'

function relTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diff < 1) return 'vừa xong'
  if (diff < 60) return `${diff}m`
  const h = Math.floor(diff / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

const TYPE_EMOJI: Record<string, string> = {
  new_pending_post:       '📝',
  new_pending_place:      '📍',
  new_pending_confession: '🤫',
}

type Props = {
  initialUnread: number
  initialNotifications: AdminNotification[]
  userId: string
}

export default function AdminNotificationBellClient({
  initialUnread,
  initialNotifications,
  userId,
}: Props) {
  const t = useTranslations('notifications')
  const router = useRouter()

  // Localize the title by notification type (DB stores a Vietnamese fallback)
  function localizedTitle(type: string, fallback: string | null): string {
    switch (type) {
      case 'new_pending_post':       return t('admin_notif_title_new_pending_post')
      case 'new_pending_place':      return t('admin_notif_title_new_pending_place')
      case 'new_pending_confession': return t('admin_notif_title_new_pending_confession')
      case 'new_pending_listing':    return t('admin_notif_title_new_pending_listing')
      default:                       return fallback ?? t('dropdown_title')
    }
  }
  const [open, setOpen]     = useState(false)
  const [unread, setUnread] = useState(initialUnread)
  const [items, setItems]   = useState<AdminNotification[]>(initialNotifications)
  const [, startTransition] = useTransition()
  const dropdownRef         = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Supabase Realtime — filter by recipient_id so only this admin's notifications arrive
  // Requires REPLICA IDENTITY FULL on the table (set in migration_admin_notifications_v2.sql)
  useEffect(() => {
    if (!userId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`admin_notif_${userId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'admin_notifications',
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const notif = payload.new as AdminNotification
          setUnread(prev => prev + 1)
          setItems(prev => [notif, ...prev.slice(0, 9)])
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[notif-bell] Realtime subscribed for', userId)
        }
      })

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  const handleNotifClick = useCallback(async (notif: AdminNotification) => {
    setOpen(false)

    // Optimistic mark-as-read
    if (!notif.is_read) {
      setUnread(prev => Math.max(0, prev - 1))
      setItems(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n))
      startTransition(() => { markAsRead(notif.id) })
    }

    if (notif.target_url) router.push(notif.target_url)
  }, [router])

  const handleMarkAll = useCallback(() => {
    setUnread(0)
    setItems(prev => prev.map(n => ({ ...n, is_read: true })))
    startTransition(() => { markAllAsRead() })
  }, [])

  return (
    <div ref={dropdownRef} className="relative">

      {/* Admin moderation bell — distinct shield/amber look vs the user bell */}
      <button
        onClick={() => setOpen(v => !v)}
        aria-label={t('bell_label')}
        title={t('dropdown_title')}
        className="relative w-9 h-9 flex items-center justify-center rounded-xl border border-amber-200 bg-amber-50/60 text-amber-600 hover:bg-amber-100 hover:border-amber-300 transition-all"
      >
        <svg
          className="w-[18px] h-[18px]"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-[3px] rounded-full bg-rose text-white text-[10px] font-black flex items-center justify-center leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="animate-fadein absolute right-0 top-[calc(100%+8px)] w-[320px] bg-paper border border-line rounded-2xl shadow-dropdown overflow-hidden z-[200]">

          {/* Header */}
          <div className="px-4 py-3 bg-cream/60 border-b border-line flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[13px] text-ink">{t('dropdown_title')}</span>
              {unread > 0 && (
                <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded-full bg-rose text-white leading-none">
                  {unread}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {unread > 0 && (
                <button
                  onClick={handleMarkAll}
                  className="text-[11.5px] font-medium text-muted/70 hover:text-rose transition-colors"
                >
                  {t('mark_all_read')}
                </button>
              )}
              <a
                href="/admin/notifications"
                className="text-[11.5px] font-medium text-teal hover:underline"
              >
                {t('view_all')}
              </a>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[360px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-[24px] mb-2">🔕</p>
                <p className="text-[13px] text-muted/60">{t('empty_title')}</p>
              </div>
            ) : (
              items.map(notif => (
                <button
                  key={notif.id}
                  onClick={() => handleNotifClick(notif)}
                  className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b border-line/50 last:border-b-0 transition-colors ${
                    notif.is_read
                      ? 'hover:bg-cream/60'
                      : 'bg-amber-50/40 hover:bg-amber-50/70'
                  }`}
                >
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-[15px] flex-none mt-0.5 ${
                    notif.is_read ? 'bg-cream' : 'bg-amber-100'
                  }`}>
                    {TYPE_EMOJI[notif.type] ?? '🔔'}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={`text-[12.5px] font-semibold leading-snug ${notif.is_read ? 'text-ink/60' : 'text-ink'}`}>
                        {localizedTitle(notif.type, notif.title)}
                      </p>
                      {!notif.is_read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-none" />
                      )}
                    </div>
                    {notif.message && (
                      <p className="text-[11.5px] text-muted/70 truncate">「{notif.message}」</p>
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
