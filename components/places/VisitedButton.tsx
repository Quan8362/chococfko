'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useSavedPlaces } from '@/components/SavedPlacesProvider'
import { reportVisit, removeVisit } from '@/app/places/qa-actions'
import { trackEvent } from '@/lib/analytics'

/**
 * "I visited this place" — self-reported, private (no date/user exposed publicly).
 * Shows an aggregate count with honest "users reported visiting" wording.
 */
export default function VisitedButton({ slug, initialCount, initialVisited }: { slug: string; initialCount: number; initialVisited: boolean }) {
  const t = useTranslations('place_qa')
  const { loggedIn } = useSavedPlaces()
  const [visited, setVisited] = useState(initialVisited)
  const [count, setCount] = useState(initialCount)
  const [, start] = useTransition()

  const toggle = () => {
    if (!loggedIn) { window.location.href = '/login'; return }
    const next = !visited
    setVisited(next); setCount((c) => Math.max(0, c + (next ? 1 : -1)))
    trackEvent(next ? 'place_visited' : 'place_unvisited', { metadata: { slug } })
    start(async () => { if (next) await reportVisit(slug); else await removeVisit(slug) })
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <button type="button" onClick={toggle} aria-pressed={visited}
        className={`inline-flex items-center gap-2 font-semibold text-[13.5px] px-4 py-2 rounded-full border transition-all ${visited ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-paper text-ink border-line hover:border-emerald-400'}`}>
        {visited ? '✓' : '📍'} {visited ? t('visit_done') : t('visit_btn')}
      </button>
      {count > 0 && <span className="text-[12.5px] text-muted">{t('visit_count', { count })}</span>}
      <span className="text-[11.5px] text-muted/80">· {t('visit_note')}</span>
    </div>
  )
}
