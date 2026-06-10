'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'

const DISMISS_KEY = 'notif-perm-dismissed'

export default function NotificationPermissionBanner() {
  const t = useTranslations('notifications')
  const [show, setShow] = useState(false)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return
    // Already granted → nothing to do. Denied → we can't re-prompt programmatically,
    // but we still show a hint so the user knows why popups don't appear.
    if (Notification.permission === 'granted') return
    if (localStorage.getItem(DISMISS_KEY) === '1' && Notification.permission !== 'denied') return

    // Only for logged-in users (notifications target a specific account)
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setDenied(Notification.permission === 'denied')
      setShow(true)
    })
  }, [])

  const enable = async () => {
    try {
      const res = await Notification.requestPermission()
      if (res === 'granted') {
        // Immediate confirmation so the user sees the OS popup works right away
        try {
          if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.getRegistration('/')
            if (reg?.active) {
              await reg.showNotification(t('enable_notif_granted'), { icon: '/logo-nav.png', badge: '/logo-nav.png', tag: 'notif-test' })
            } else {
              new Notification(t('enable_notif_granted'), { icon: '/logo-nav.png' })
            }
          } else {
            new Notification(t('enable_notif_granted'), { icon: '/logo-nav.png' })
          }
        } catch { /* ignore */ }
        setShow(false)
      } else if (res === 'denied') {
        setDenied(true)
      }
    } catch { /* ignore */ }
  }

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="fixed bottom-5 left-5 z-[9998] w-[300px] bg-white rounded-2xl shadow-[0_8px_32px_-6px_rgba(36,26,23,0.2)] border border-line overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl flex-none grid place-items-center text-[18px] bg-rose/10">🔔</div>
          <div className="flex-1 min-w-0">
            <p className="text-[13.5px] font-bold text-ink leading-tight">{t('enable_notif_title')}</p>
            <p className="text-[12px] text-muted mt-1 leading-snug">
              {denied ? t('enable_notif_denied') : t('enable_notif_desc')}
            </p>
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={dismiss}
            className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-line text-muted hover:bg-cream transition-colors"
          >
            {t('enable_notif_later')}
          </button>
          {!denied && (
            <button
              onClick={enable}
              className="text-[12px] font-semibold px-4 py-1.5 rounded-lg bg-rose text-white hover:bg-rose-deep transition-colors"
            >
              {t('enable_notif_btn')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
