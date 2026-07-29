import Link from 'next/link'
import type { Metadata } from 'next'
import { getTranslations, getLocale } from 'next-intl/server'
import { listPublicTournaments } from '@/lib/tournaments/public/queries'
import { formatDateRange } from '@/lib/tournaments/public/format'
import StatusPill from '@/components/tournaments/public/StatusPill'
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE, OG_LOCALE, breadcrumbJsonLd, jsonLdString } from '@/lib/seo'

// The next-intl cookie already forces dynamic rendering; render on every request so admin-entered
// results appear without stale caching. No polling / realtime in this phase (see design doc §11).
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('tournaments')
  const locale = await getLocale()
  const canonical = `${SITE_URL}/giai-dau`
  const title = t('public.page_title')
  const description = t('public.page_desc')
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      url: canonical,
      locale: OG_LOCALE[locale] ?? 'vi_VN',
      siteName: SITE_NAME,
      title: `${title} · ${SITE_NAME}`,
      description,
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: 'summary_large_image', title: `${title} · ${SITE_NAME}`, description, images: [DEFAULT_OG_IMAGE] },
  }
}

export default async function TournamentsListPage() {
  const t = await getTranslations('tournaments')
  const locale = await getLocale()
  const tournaments = await listPublicTournaments()

  const breadcrumb = jsonLdString(
    breadcrumbJsonLd([
      { name: SITE_NAME, path: '/' },
      { name: t('public.page_title'), path: '/giai-dau' },
    ]),
  )

  return (
    <div className="max-w-[960px] mx-auto px-5 sm:px-6 py-10 pb-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumb }} />

      {/* Header band */}
      <div className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-gold-light/50 via-paper to-rose-soft px-6 py-8 sm:px-10 sm:py-11 mb-9">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.5]">
          <span className="absolute top-6 right-8 w-20 h-20 rounded-full bg-gold/15 blur-2xl" />
          <span className="absolute -bottom-6 right-28 w-24 h-24 rounded-full bg-rose/10 blur-2xl" />
        </div>
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[2.5px] uppercase text-rose bg-paper/80 border border-rose/25 px-3 py-1.5 rounded-full mb-4 shadow-sm">
            {t('public.list_badge')}
          </span>
          <h1 className="font-serif font-bold text-[clamp(28px,4vw,44px)] leading-tight tracking-[-0.4px] text-ink mb-2">
            {t('public.page_title')}
          </h1>
          <p className="text-[15px] text-muted leading-relaxed max-w-[540px]">{t('public.page_desc')}</p>
        </div>
      </div>

      {tournaments.length === 0 ? (
        <div className="bg-cream border border-line rounded-2xl py-16 px-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-paper border border-line flex items-center justify-center mx-auto mb-4 text-muted/50">
            <TrophyIcon />
          </div>
          <p className="text-[15px] font-semibold text-ink mb-1">{t('public.empty_title')}</p>
          <p className="text-[13.5px] text-muted max-w-[380px] mx-auto">{t('public.empty_desc')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          {tournaments.map((tn) => {
            const range = formatDateRange(tn.startsAt, tn.endsAt, locale)
            return (
              <Link
                key={tn.slug}
                href={`/giai-dau/${tn.slug}`}
                className="group relative overflow-hidden bg-paper border border-line rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 hover:border-rose/40 hover:shadow-[0_18px_40px_-16px_rgba(194,24,91,0.28)]"
              >
                <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-rose to-transparent opacity-60 group-hover:opacity-100 transition-opacity" />
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h2 className="font-serif font-bold text-[18px] text-ink leading-snug group-hover:text-rose transition-colors line-clamp-2">
                    {tn.name}
                  </h2>
                  <StatusPill phase={tn.phase} label={t(`status.${tn.phase}`)} />
                </div>
                <div className="space-y-1.5 text-[13px] text-muted">
                  <p className="flex items-center gap-2">
                    <CalendarIcon />
                    <span>{range || t('public.dates_tbd')}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <PinIcon />
                    <span>{tn.location || t('public.location_tbd')}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <GridIcon />
                    <span>{t('public.events_count', { count: tn.eventCount })}</span>
                  </p>
                </div>
                <span className="mt-4 inline-flex items-center gap-1 text-[12.5px] font-semibold text-rose">
                  {t('public.view_detail')}
                  <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TrophyIcon() {
  return (
    <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
    </svg>
  )
}
function CalendarIcon() {
  return (
    <svg className="w-4 h-4 flex-none text-muted/70" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  )
}
function PinIcon() {
  return (
    <svg className="w-4 h-4 flex-none text-muted/70" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  )
}
function GridIcon() {
  return (
    <svg className="w-4 h-4 flex-none text-muted/70" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z" />
    </svg>
  )
}
