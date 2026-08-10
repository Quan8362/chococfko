import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { listPublicTournaments } from '@/lib/tournaments/public/queries'
import { formatDateRange } from '@/lib/tournaments/public/format'
import { pickPromoActivity } from '@/lib/tournaments/public/promo'

/**
 * Premium activity promo strip rendered directly beneath the site header on the home page.
 *
 * It spotlights ONE live/upcoming community activity (today: a tournament) so visitors are pulled in
 * without the section ever feeling bolted on. Self-contained async server component — one cheap RLS
 * query, no client JS, no layout shift (it is in the initial HTML and simply renders nothing when
 * there is no activity to promote). Reusable on any server page.
 */
export default async function HomeActivityPromo() {
  const items = await listPublicTournaments()
  const { featured, activeCount } = pickPromoActivity(items)
  // No live/upcoming activity → render nothing (no empty frame).
  if (!featured) return null

  const [t, locale] = await Promise.all([getTranslations('home_promo'), getLocale()])
  const isOngoing = featured.phase === 'ongoing'
  const statusLabel = isOngoing ? t('status_ongoing') : t('status_upcoming')
  const dateLabel = formatDateRange(featured.startsAt, featured.endsAt, locale) || t('date_tbd')
  const href = `/giai-dau/${featured.slug}`

  return (
    <section aria-label={t('aria_region')} className="pt-5 sm:pt-6">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
        <div className="group relative overflow-hidden rounded-2xl border border-rose/15 bg-[linear-gradient(105deg,#fbedf3_0%,#fffdf8_48%,#f6eacf_100%)] shadow-[0_12px_40px_-18px_rgba(157,18,72,0.32)] transition-all duration-300 hover:-translate-y-0.5 hover:border-rose/25 hover:shadow-[0_20px_54px_-20px_rgba(157,18,72,0.42)] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
          {/* Soft brand glows — purely decorative, never intercept clicks. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-70">
            <span className="absolute -top-10 right-16 h-28 w-28 rounded-full bg-gold/20 blur-3xl" />
            <span className="absolute -bottom-12 left-24 h-32 w-32 rounded-full bg-rose/10 blur-3xl" />
          </div>

          <div className="relative z-[1] flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-5 sm:p-6">
            {/* Medallion — anchors the strip; hidden on the tightest widths to keep it compact. */}
            <div className="hidden h-14 w-14 flex-none items-center justify-center rounded-2xl bg-gradient-to-br from-rose to-rose-deep text-white shadow-[0_10px_24px_-8px_rgba(157,18,72,0.6)] sm:flex">
              <TrophyIcon />
            </div>

            {/* Copy block */}
            <div className="min-w-0 flex-1">
              <StatusBadge label={statusLabel} ongoing={isOngoing} />

              <h2 className="mt-2 truncate font-serif text-[19px] font-bold leading-snug tracking-[-0.3px] text-ink sm:text-[22px]">
                {featured.name}
              </h2>

              <p className="mt-1 hidden truncate text-[13.5px] leading-relaxed text-muted sm:block">
                {t('tagline')}
              </p>

              {/* Meta row: date · location · event count. Location is omitted when unknown. */}
              <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px] font-medium text-[#6f5f54]">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarIcon />
                  {dateLabel}
                </span>
                {featured.location && (
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <PinIcon />
                    <span className="truncate max-w-[220px]">{featured.location}</span>
                  </span>
                )}
                {featured.eventCount > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <GridIcon />
                    {t('events_count', { count: featured.eventCount })}
                  </span>
                )}
              </div>
            </div>

            {/* CTAs — primary is a stretched link so the whole card is clickable; the secondary
                "all tournaments" link sits above it (relative z) so it stays independently clickable. */}
            <div className="flex flex-none flex-col items-stretch gap-2 sm:items-end">
              <Link
                href={href}
                aria-label={t('aria_card', { status: statusLabel, name: featured.name })}
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-rose px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_8px_20px_-8px_rgba(194,24,91,0.55)] transition-all duration-200 hover:bg-rose-deep hover:shadow-[0_12px_28px_-10px_rgba(194,24,91,0.65)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/55 focus-visible:ring-offset-2 focus-visible:ring-offset-cream after:absolute after:inset-0 after:rounded-2xl after:content-[''] motion-reduce:transition-none"
              >
                {t('cta_detail')}
                <svg className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>

              {activeCount > 1 && (
                <Link
                  href="/giai-dau"
                  className="relative z-[2] inline-flex items-center justify-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-rose-deep/85 underline-offset-4 transition-colors hover:text-rose-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/45 focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
                >
                  {t('cta_all')}
                  <span className="grid h-4 min-w-4 place-items-center rounded-full bg-rose/12 px-1 text-[10.5px] font-bold text-rose-deep tabular-nums">
                    {activeCount}
                  </span>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function StatusBadge({ label, ongoing }: { label: string; ongoing: boolean }) {
  return (
    <span
      className={
        ongoing
          ? 'inline-flex items-center gap-1.5 rounded-full border border-teal/30 bg-teal-soft px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[1.5px] text-teal'
          : 'inline-flex items-center gap-1.5 rounded-full border border-rose/25 bg-rose-soft px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[1.5px] text-rose'
      }
    >
      <span className="relative flex h-1.5 w-1.5">
        {ongoing && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-75 motion-reduce:hidden" />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${ongoing ? 'bg-teal' : 'bg-rose'}`} />
      </span>
      {label}
    </span>
  )
}

function TrophyIcon() {
  return (
    <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
    </svg>
  )
}
function CalendarIcon() {
  return (
    <svg className="h-3.5 w-3.5 flex-none text-rose/70" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  )
}
function PinIcon() {
  return (
    <svg className="h-3.5 w-3.5 flex-none text-rose/70" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  )
}
function GridIcon() {
  return (
    <svg className="h-3.5 w-3.5 flex-none text-rose/70" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  )
}
