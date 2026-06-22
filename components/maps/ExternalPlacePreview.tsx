'use client'

// ============================================================
// External Google place preview (Map UX Phase 7). VISUALLY DISTINCT from the
// internal Chợ Cóc FKO preview: neutral/slate styling + an explicit "Google"
// provider chip + attribution, and NO Chợ Cóc FKO editorial badge — so an
// external place is never mistaken for reviewed/published editorial content.
//
// Shows only the minimal fields fetched (name / address / type / location) plus
// free deep links. No reviews/ratings/photos/phone/hours are requested or shown.
// ============================================================

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { ExternalPlacePreview as Preview } from '@/lib/maps/externalPlace'
import { externalOpenInMapsUrl, externalDirectionsUrl } from '@/lib/maps/externalPlace'
import type { DuplicateMatch } from '@/lib/maps/duplicateDetection'

interface Props {
  preview: Preview
  /** Internal place this external place duplicates (prefer internal). */
  duplicate?: DuplicateMatch | null
  /** Show the admin-only "use for an article" action. */
  showAdminAction?: boolean
  /** Pre-built, encoded admin link carrying the external candidate. */
  adminHref?: string | null
  onClose: () => void
}

export default function ExternalPlacePreview({ preview, duplicate, showAdminAction, adminHref, onClose }: Props) {
  const t = useTranslations('map_search')
  const openUrl = externalOpenInMapsUrl(preview)
  const dirUrl = externalDirectionsUrl(preview)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.focus() }, [])

  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-label={`${t('group_google')}: ${preview.name ?? ''}`}
      className="bg-slate-50 border border-slate-300 rounded-2xl shadow-card-hover overflow-hidden outline-none">
      {/* External provider header — deliberately NOT the brand rose/teal. */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-slate-100 border-b border-slate-200">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 uppercase tracking-[0.4px]">
          <span className="w-2 h-2 rounded-full bg-slate-400" aria-hidden />
          {t('group_google')}
        </span>
        <button type="button" onClick={onClose} aria-label={t('ext_close')}
          className="w-8 h-8 grid place-items-center rounded-full bg-white text-slate-600 text-[13px] border border-slate-200 hover:bg-slate-100">✕</button>
      </div>

      <div className="p-3.5">
        <h3 className="font-sans font-bold text-[16px] text-slate-800 leading-snug">{preview.name ?? '—'}</h3>
        {preview.primaryType && <p className="text-[11.5px] text-slate-600 capitalize mt-0.5">{preview.primaryType}</p>}
        {preview.formattedAddress && <p className="text-[12.5px] text-slate-600 mt-1">{preview.formattedAddress}</p>}
        {preview.lat != null && preview.lng != null && (
          <p className="text-[11.5px] text-slate-500 mt-0.5">{preview.lat.toFixed(5)}, {preview.lng.toFixed(5)}</p>
        )}

        {/* Duplicate → prefer the internal article. */}
        {duplicate && (
          <div className="mt-3 text-[12.5px] bg-rose-soft border border-rose/20 rounded-xl p-3">
            <p className="text-rose font-semibold mb-1.5">{t('ext_duplicate')}</p>
            <Link href={`/places/${duplicate.slug}`} className="inline-block font-semibold text-teal hover:underline">
              {t('ext_view_article')} — {duplicate.name}
            </Link>
          </div>
        )}

        <div className="flex flex-wrap gap-2 mt-3">
          <a href={openUrl} target="_blank" rel="noopener nofollow"
            className="flex-1 min-w-[120px] text-center py-1.5 text-[12.5px] font-semibold rounded-xl bg-white text-slate-700 border border-slate-300 hover:bg-slate-100 transition-colors">
            {t('ext_open_maps')}
          </a>
          <a href={dirUrl} target="_blank" rel="noopener nofollow"
            className="flex-1 min-w-[120px] text-center py-1.5 text-[12.5px] font-semibold rounded-xl bg-white text-slate-700 border border-slate-300 hover:bg-slate-100 transition-colors">
            {t('ext_directions')}
          </a>
        </div>

        {/* Admin-only: start a Chợ Cóc FKO article from this external place. */}
        {showAdminAction && adminHref && !duplicate && (
          <Link href={adminHref}
            onClick={(e) => { if (!window.confirm(t('admin_confirm'))) e.preventDefault() }}
            className="block text-center mt-2 py-1.5 text-[12.5px] font-semibold rounded-xl bg-ink text-white hover:bg-ink/90 transition-colors">
            {t('admin_use_for_article')}
          </Link>
        )}

        <p className="text-[10.5px] text-slate-500 mt-2.5">{t('ext_attribution')}</p>
      </div>
    </div>
  )
}
