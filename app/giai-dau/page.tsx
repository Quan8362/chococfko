import Link from 'next/link'
import type { Metadata } from 'next'
import { getTranslations, getLocale } from 'next-intl/server'
import { listPublicTournaments } from '@/lib/tournaments/public/queries'
import { formatDateRange } from '@/lib/tournaments/public/format'
import type { DiscoveryItem } from '@/lib/tournaments/public/listFilter'
import TournamentDiscovery from '@/components/tournaments/public/TournamentDiscovery'
import TournamentShell from '@/components/tournaments/TournamentShell'
import { createClient } from '@/lib/supabase/server'
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE, OG_LOCALE, breadcrumbJsonLd, jsonLdString } from '@/lib/seo'

// The next-intl cookie already forces dynamic rendering; render on every request so admin-entered
// results appear without stale caching. No polling / realtime in this phase (see design doc §11).
export const dynamic = 'force-dynamic'

// Self-service create surface. This page (and the login redirect) already gate access — an
// anonymous visitor who follows it is bounced to /login?next=… and returned here after signing in,
// so the CTA can point at it unconditionally without changing any auth/business logic.
const CREATE_HREF = '/quan-ly-giai-dau/new'
const MY_TOURNAMENTS_HREF = '/quan-ly-giai-dau'

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

  // Auth is read ONLY to decide whether to surface the "my tournaments" CTA. It never changes which
  // tournaments are visible (that stays anon + RLS via listPublicTournaments) — no business logic.
  const { data: auth } = await createClient().auth.getUser()
  const isSignedIn = !!auth.user

  // Preformat each row's date range server-side so the client toolbar never re-plumbs locale-aware
  // date formatting; the raw ISO fields stay on the item for client-side sorting.
  const items: DiscoveryItem[] = tournaments.map((tn) => ({
    ...tn,
    dateLabel: formatDateRange(tn.startsAt, tn.endsAt, locale),
  }))

  const breadcrumb = jsonLdString(
    breadcrumbJsonLd([
      { name: SITE_NAME, path: '/' },
      { name: t('public.page_title'), path: '/giai-dau' },
    ]),
  )

  return (
    <TournamentShell size="wide">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumb }} />

      {/* ── Hero: title/description left, CTAs right (stacks on mobile) ─────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-gold-light/50 via-paper to-rose-soft px-6 py-6 sm:px-9 sm:py-7 mb-7">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.5]">
          <span className="absolute -top-4 right-10 h-24 w-24 rounded-full bg-gold/15 blur-2xl" />
          <span className="absolute -bottom-8 right-40 h-28 w-28 rounded-full bg-rose/10 blur-2xl" />
        </div>
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-[600px]">
            <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-rose/25 bg-paper/80 px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[2.5px] text-rose shadow-sm">
              {t('public.list_badge')}
            </span>
            <h1 className="mb-2 font-serif text-[clamp(26px,3.6vw,40px)] font-bold leading-tight tracking-[-0.4px] text-ink">
              {t('public.page_title')}
            </h1>
            <p className="max-w-[540px] text-[14.5px] leading-relaxed text-muted">{t('public.page_desc')}</p>
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row lg:flex-shrink-0 lg:flex-col xl:flex-row">
            <Link
              href={CREATE_HREF}
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-rose px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-sm transition-colors hover:bg-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
            >
              <PlusIcon />
              {t('public.create_cta')}
            </Link>
            {isSignedIn && (
              <Link
                href={MY_TOURNAMENTS_HREF}
                className="inline-flex items-center justify-center gap-1.5 rounded-full border border-line bg-paper px-5 py-2.5 text-[13.5px] font-semibold text-ink transition-colors hover:border-rose/40 hover:text-rose focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
              >
                {t('public.my_tournaments')}
              </Link>
            )}
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-line bg-cream px-6 py-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-paper text-muted/50">
            <TrophyIcon />
          </div>
          <p className="mb-1 text-[16px] font-semibold text-ink">{t('public.empty_title')}</p>
          <p className="mx-auto mb-6 max-w-[400px] text-[13.5px] text-muted">{t('public.empty_desc_cta')}</p>
          <Link
            href={CREATE_HREF}
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-rose px-5 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/50"
          >
            <PlusIcon />
            {t('public.create_cta')}
          </Link>
        </div>
      ) : (
        <TournamentDiscovery items={items} createHref={CREATE_HREF} />
      )}
    </TournamentShell>
  )
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  )
}
function TrophyIcon() {
  return (
    <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
    </svg>
  )
}
