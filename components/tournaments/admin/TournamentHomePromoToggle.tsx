'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { setTournamentHomePromo } from '@/app/admin/giai-dau/actions'
import type { TournamentMutationError } from '@/lib/tournaments/admin/types'

/**
 * SITE-ADMIN-ONLY control to opt a tournament in/out of the home-page activity-promo strip.
 *
 * The parent page ONLY renders this for a Site Admin — a tournament Owner/Manager/Scorekeeper never
 * sees it. The server action re-checks Site Admin regardless (hiding the control is never the
 * boundary). This is deliberately separate from publish/archive: it does not change visibility, only
 * whether the (already public + live/upcoming) tournament may appear in the home promo.
 */
export default function TournamentHomePromoToggle({
  id,
  enabled,
  updatedAt,
}: {
  id: string
  enabled: boolean
  updatedAt: string
}) {
  const t = useTranslations('home_promo')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<TournamentMutationError | null>(null)

  function toggle() {
    setError(null)
    const next = !enabled
    startTransition(async () => {
      const res = await setTournamentHomePromo(id, updatedAt, next)
      if (res.ok) {
        router.refresh()
        return
      }
      setError(res.error ?? 'unknown')
    })
  }

  return (
    <div className="bg-paper border border-line rounded-2xl p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h2 className="font-serif font-bold text-[16px] text-ink">{t('admin_heading')}</h2>
            <span
              className={
                enabled
                  ? 'inline-flex items-center gap-1.5 rounded-full border border-rose/25 bg-rose-soft px-2 py-[3px] text-[10.5px] font-bold uppercase tracking-[1px] text-rose'
                  : 'inline-flex items-center gap-1.5 rounded-full border border-line bg-cream px-2 py-[3px] text-[10.5px] font-bold uppercase tracking-[1px] text-muted'
              }
            >
              <span className={`h-1.5 w-1.5 rounded-full ${enabled ? 'bg-rose' : 'bg-muted/50'}`} aria-hidden="true" />
              {enabled ? t('promoting') : t('not_promoting')}
            </span>
          </div>
          <p className="text-[12.5px] text-muted max-w-[420px] leading-relaxed">{t('admin_description')}</p>
        </div>

        {/* Accessible switch — a real button toggling aria-pressed (not a color-only signal). */}
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t('admin_label')}
          disabled={pending}
          onClick={toggle}
          className={`relative inline-flex h-7 w-12 flex-none items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:opacity-50 ${
            enabled ? 'bg-rose border-rose' : 'bg-cream border-line'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              enabled ? 'translate-x-[22px]' : 'translate-x-[3px]'
            }`}
          />
        </button>
      </div>

      {error && <p className="text-[12px] text-rose mt-3">{t('admin_error')}</p>}
    </div>
  )
}
