'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { trackMapOpen } from '@/lib/mapNav'

/**
 * Compact homepage Map call-to-action. Reuses the standard card tokens (paper bg,
 * line border, rounded-2xl, card shadow) so it sits inside an existing section
 * rather than competing as a full-width banner.
 */
export default function MapDiscoveryCard() {
  const t = useTranslations('home')

  return (
    <section className="max-w-[1240px] mx-auto px-5 sm:px-7 mt-2 mb-2">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 bg-paper border border-line rounded-2xl shadow-card px-5 sm:px-6 py-5">
        <span className="flex-none grid place-items-center w-12 h-12 rounded-xl bg-rose/10 text-rose">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
          </svg>
        </span>

        <div className="flex-1 min-w-0">
          <h2 className="font-serif font-bold text-[18px] sm:text-[19px] text-ink leading-tight">{t('map_cta_title')}</h2>
          <p className="text-[13.5px] sm:text-[14px] text-muted leading-relaxed mt-0.5">{t('map_cta_description')}</p>
        </div>

        <Link
          href="/map"
          onClick={() => trackMapOpen('homepage_cta')}
          className="flex-none inline-flex items-center justify-center gap-1.5 font-semibold text-[14px] px-5 py-2.5 rounded-full bg-rose text-white shadow-[0_6px_20px_-6px_rgba(194,24,91,0.5)] hover:bg-rose-deep hover:-translate-y-0.5 transition-all whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/55 focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
          </svg>
          {t('map_cta_button')}
        </Link>
      </div>
    </section>
  )
}
