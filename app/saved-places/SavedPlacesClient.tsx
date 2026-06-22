'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Fragment } from 'react'
import { useTranslations } from 'next-intl'
import { useSavedPlaces } from '@/components/SavedPlacesProvider'
import { parseRecent, recentSlugs } from '@/lib/recentPlaces'

const RECENT_KEY = 'chococfko_recent_views'

interface Props {
  cards: Record<string, React.ReactNode>
  emptyTitle: string
  emptySub: string
  exploreCta: string
}

export default function SavedPlacesClient({ cards, emptyTitle, emptySub, exploreCta }: Props) {
  const t = useTranslations('place_detail')
  const { saved, loggedIn, ready } = useSavedPlaces()
  const [recent, setRecent] = useState<string[]>([])
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setRecent(recentSlugs(parseRecent(localStorage.getItem(RECENT_KEY))))
  }, [])

  const clearHistory = () => { try { localStorage.removeItem(RECENT_KEY) } catch { /* ignore */ } setRecent([]) }

  if (!mounted || !ready) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {[1, 2, 3].map((i) => <div key={i} className="bg-paper border border-line rounded-2xl h-[200px] animate-pulse" />)}
      </div>
    )
  }

  const savedSlugs = Array.from(saved).filter((s) => cards[s])
  const recentToShow = recent.filter((s) => cards[s] && !saved.has(s)).slice(0, 12)

  return (
    <div className="space-y-8 sm:space-y-12">
      {/* Guest hint: signing in is required for cross-device persistence */}
      {!loggedIn && (
        <div className="bg-cream border border-line rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[13.5px] text-ink">{t('guest_save_hint')}</span>
          <Link href="/login" className="text-[13px] font-semibold px-4 py-2 rounded-full bg-rose text-white hover:bg-rose-deep transition-colors">{t('sign_in')}</Link>
        </div>
      )}

      {/* Saved */}
      {savedSlugs.length === 0 ? (
        <div className="bg-paper border border-line rounded-2xl px-5 py-8 sm:p-12 text-center shadow-card">
          <div className="text-[36px] sm:text-[48px] mb-3 sm:mb-4" aria-hidden="true">♡</div>
          <h2 className="font-serif font-bold text-[18px] sm:text-[20px] text-ink mb-1.5 sm:mb-2">{emptyTitle}</h2>
          <p className="text-[13.5px] sm:text-[14.5px] text-muted mb-5 sm:mb-7 max-w-[340px] mx-auto leading-relaxed">{emptySub}</p>
          <Link href="/places" className="inline-flex items-center gap-2 font-semibold text-[14px] px-7 min-h-[44px] rounded-full bg-rose text-white shadow-[0_4px_14px_-4px_rgba(194,24,91,0.45)] hover:bg-rose-deep hover:-translate-y-0.5 transition-all">
            {exploreCta}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {savedSlugs.map((s) => <Fragment key={s}>{cards[s]}</Fragment>)}
        </div>
      )}

      {/* Recently viewed */}
      {recentToShow.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-serif font-bold text-[22px] text-ink">{t('recently_viewed')}</h2>
            <button type="button" onClick={clearHistory} className="text-[13px] text-muted hover:text-rose underline">{t('clear_history')}</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {recentToShow.map((s) => <Fragment key={s}>{cards[s]}</Fragment>)}
          </div>
        </section>
      )}
    </div>
  )
}
