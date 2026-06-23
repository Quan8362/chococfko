'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { trackMapOpen } from '@/lib/mapNav'

/**
 * Compact List ⇆ Map segmented control for the Places listing. List and Map are
 * separate routes (not a client toggle): the active segment is rendered inert and
 * the inactive one is a real <Link>. Fits a 320px viewport (short labels + icons).
 */
export default function ViewSwitch({
  active,
  mapHref,
  listHref = '/places',
}: {
  active: 'list' | 'map'
  mapHref: string
  listHref?: string
}) {
  const t = useTranslations('explore_search')

  const base =
    'inline-flex items-center gap-1.5 px-3 sm:px-3.5 min-h-[36px] rounded-full text-[13px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-rose/30'
  const on = 'bg-rose text-white'
  const off = 'text-muted hover:text-rose'

  return (
    <div role="group" aria-label={t('view_label')} className="inline-flex items-center gap-0.5 p-0.5 rounded-full border border-line bg-paper">
      {active === 'list' ? (
        <span aria-current="true" className={`${base} ${on}`}>
          <ListIcon />
          {t('view_list')}
        </span>
      ) : (
        <Link href={listHref} className={`${base} ${off}`}>
          <ListIcon />
          {t('view_list')}
        </Link>
      )}

      {active === 'map' ? (
        <span aria-current="true" className={`${base} ${on}`}>
          <MapIcon />
          {t('view_map')}
        </span>
      ) : (
        <Link href={mapHref} onClick={() => trackMapOpen('explore_view_switch')} className={`${base} ${off}`}>
          <MapIcon />
          {t('view_map')}
        </Link>
      )}
    </div>
  )
}

function ListIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  )
}

function MapIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
    </svg>
  )
}
