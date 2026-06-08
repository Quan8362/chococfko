'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { toggleBookmark, ItemType } from '@/app/tieng-nhat/bookmark-actions'

type Props = {
  itemId: string
  itemType: ItemType
  initialBookmarked: boolean
  loginMessage?: string
}

export default function BookmarkButton({ itemId, itemType, initialBookmarked, loginMessage }: Props) {
  const t = useTranslations('japanese')
  const [bookmarked, setBookmarked] = useState(initialBookmarked)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }

  const handleClick = useCallback(async () => {
    if (busy) return
    setBusy(true)
    const res = await toggleBookmark(itemId, itemType)
    setBusy(false)
    if (!res.success) {
      showToast(res.error === 'not_logged_in' ? (loginMessage ?? t('login_to_save')) : t('bookmark_failed'))
      return
    }
    setBookmarked(res.isBookmarked)
    showToast(res.isBookmarked ? t('bookmark_saved') : t('bookmark_removed'))
  }, [busy, itemId, itemType, loginMessage, t])

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        disabled={busy}
        title={bookmarked ? t('bookmark_remove_title') : t('bookmark_save_title')}
        className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
          bookmarked
            ? 'bg-rose/10 text-rose hover:bg-rose/20'
            : 'bg-cream text-muted hover:bg-rose/10 hover:text-rose'
        } ${busy ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <svg className="w-4 h-4" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
      </button>
      {toast && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-ink text-white text-[11px] font-medium px-2.5 py-1 rounded-lg whitespace-nowrap shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
