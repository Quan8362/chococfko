import { getTranslations } from 'next-intl/server'
import type { Place } from '@/lib/places'

/**
 * Detail-page action buttons derived from structured place data. Renders only
 * the actions that exist (call / website / reserve / social). "Directions" is
 * already covered by the existing Open Maps button, so it is not duplicated.
 * External links use rel="noopener nofollow" and open in a new tab.
 */
export default async function PlaceActions({ place }: { place: Place }) {
  const t = await getTranslations('place_fields')
  const tel = place.phoneE164 || place.phone
  const website = place.officialWebsite
  const reserve = place.reservationUrl
  const social = place.socialUrl

  if (!tel && !website && !reserve && !social) return null

  return (
    <div className="space-y-2.5">
      {reserve && (
        <a
          href={reserve}
          target="_blank"
          rel="noopener nofollow"
          className="flex items-center justify-center gap-2 font-semibold text-[14px] px-5 py-3.5 rounded-2xl bg-emerald-500 text-white shadow-[0_8px_20px_-6px_rgba(16,185,129,0.5)] hover:bg-emerald-600 hover:-translate-y-px transition-all"
        >
          {t('pub_reserve')}
          {place.reservationProvider ? ` · ${place.reservationProvider}` : ''}
        </a>
      )}
      {website && (
        <a
          href={website}
          target="_blank"
          rel="noopener nofollow"
          className="flex items-center justify-center gap-2 font-semibold text-[14px] px-5 py-3.5 rounded-2xl bg-paper text-ink border border-line hover:border-rose/40 hover:text-rose transition-all"
        >
          {t('pub_website')}
        </a>
      )}
      <div className="flex gap-2.5">
        {tel && (
          <a
            href={`tel:${tel}`}
            className="flex-1 flex items-center justify-center gap-2 font-semibold text-[14px] px-4 py-3 rounded-2xl bg-paper text-ink border border-line hover:border-rose/40 hover:text-rose transition-all"
          >
            {t('pub_call')}
          </a>
        )}
        {social && (
          <a
            href={social}
            target="_blank"
            rel="noopener nofollow"
            className="flex-1 flex items-center justify-center gap-2 font-semibold text-[14px] px-4 py-3 rounded-2xl bg-paper text-ink border border-line hover:border-rose/40 hover:text-rose transition-all"
          >
            {t('pub_social')}
          </a>
        )}
      </div>
    </div>
  )
}
