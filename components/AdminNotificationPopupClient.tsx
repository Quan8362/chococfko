'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import type { AdminNotification } from '@/lib/admin/notifications'

type AdminPopup = {
  id: string
  title: string
  message: string | null
  emoji: string
  targetUrl: string | null
  entering: boolean
}

const AUTO_MS = 7000
const MAX_NOTIFS = 3

const TYPE_EMOJI: Record<string, string> = {
  new_pending_post:       '📝',
  new_pending_place:      '📍',
  new_pending_confession: '🤫',
  new_pending_listing:    '🛒',
}

export default function AdminNotificationPopupClient({ userId }: { userId: string }) {
  const t = useTranslations('notifications')
  const [notifs, setNotifs] = useState<AdminPopup[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Localize the title by notification type (DB stores a Vietnamese fallback)
  function localizedTitle(type: string, fallback: string | null): string {
    switch (type) {
      case 'new_pending_post':       return t('admin_notif_title_new_pending_post')
      case 'new_pending_place':      return t('admin_notif_title_new_pending_place')
      case 'new_pending_confession': return t('admin_notif_title_new_pending_confession')
      case 'new_pending_listing':    return t('admin_notif_title_new_pending_listing')
      default:                       return fallback ?? t('admin_review_badge')
    }
  }

  // Service worker registration and OS-notification permission are handled once,
  // for all users, by MentionNotificationProvider (mounted globally) — no need to
  // duplicate them here.

  // Realtime: new admin notifications scoped to this admin
  // Requires REPLICA IDENTITY FULL (migration_admin_notifications_v2.sql) so payload.new is complete.
  useEffect(() => {
    if (!userId) return
    const supabase = createClient()

    const channel = supabase
      .channel(`admin-popup-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'admin_notifications',
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const n = payload.new as AdminNotification
          // Don't popup for the admin's own submissions (the bell still records it)
          if (n.actor_id && n.actor_id === userId) return

          // Tab not focused → Web Push shows the OS notification. Leave it.
          if (document.hidden || !document.hasFocus()) return

          // Focused → close the push OS notification (user is in the app), then
          // show the in-app toast instead.
          if ('serviceWorker' in navigator) {
            const tag = `admin-${n.type}-${n.target_id ?? ''}`
            const closeIt = () => navigator.serviceWorker.getRegistration()
              .then(reg => reg?.getNotifications({ tag }))
              .then(ns => (ns || []).forEach(no => no.close()))
              .catch(() => {})
            closeIt()
            setTimeout(closeIt, 1500)
          }

          // Already on the matching moderation page → no need.
          const targetPath = n.target_url ? n.target_url.split('?')[0] : null
          if (targetPath && window.location.pathname === targetPath) return

          const title = localizedTitle(n.type, n.title)
          const emoji = TYPE_EMOJI[n.type] ?? '🔔'

          // Active tab → in-app corner toast
          const popup: AdminPopup = {
            id: n.id,
            title,
            message: n.message,
            emoji,
            targetUrl: n.target_url,
            entering: false,
          }
          setNotifs(prev => [popup, ...prev].slice(0, MAX_NOTIFS))
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              setNotifs(prev => prev.map(p => (p.id === n.id ? { ...p, entering: true } : p)))
            )
          )
          const timer = setTimeout(() => dismiss(n.id), AUTO_MS)
          timers.current.set(n.id, timer)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  function dismiss(id: string) {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setNotifs(prev => prev.map(n => (n.id === id ? { ...n, entering: false } : n)))
    setTimeout(() => setNotifs(prev => prev.filter(n => n.id !== id)), 320)
  }

  if (notifs.length === 0) return null

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
            <div className="h-[3px] bg-amber-400/20">
              <div className="h-full bg-amber-400 animate-mention-shrink" />
            </div>
          )}

          <div className="p-3.5">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg flex-none grid place-items-center text-[16px] bg-amber-100">
                {notif.emoji}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10.5px] font-bold text-amber-600">{t('admin_review_badge')}</span>
                </div>
                <p className="text-[13px] font-semibold text-ink leading-tight line-clamp-2">
                  {notif.title}
                </p>
                {notif.message && (
                  <p className="text-[12px] text-muted mt-0.5 leading-snug line-clamp-2">
                    {notif.message}
                  </p>
                )}
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

            {notif.targetUrl && (
              <div className="mt-2.5 flex justify-end">
                <a
                  href={notif.targetUrl}
                  onClick={() => dismiss(notif.id)}
                  className="text-[12px] font-semibold px-4 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                >
                  {t('admin_review_now')}
                </a>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
