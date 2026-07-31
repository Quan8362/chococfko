import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getTranslations, getLocale } from 'next-intl/server'
import { getPublicTournamentBySlug, getPublicEventWorkspace } from '@/lib/tournaments/public/queries'
import { formatDateRange, tournamentPhase } from '@/lib/tournaments/public/format'
import TournamentDetail from '@/components/tournaments/public/TournamentDetail'
import { tabFromSlug } from '@/lib/tournaments/public/tabs'
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE, OG_LOCALE, breadcrumbJsonLd, jsonLdString } from '@/lib/seo'

// The next-intl cookie forces dynamic rendering; render fresh each request so admin-entered results
// appear promptly. No polling / realtime this phase — a manual refresh button covers freshness.
export const dynamic = 'force-dynamic'

type SP = { event?: string; tab?: string }

export async function generateMetadata({
  params,
}: {
  params: { slug: string }
}): Promise<Metadata> {
  const summary = await getPublicTournamentBySlug(params.slug)
  // Missing / draft / archived → 404-style metadata; never confirm a draft exists, never index.
  if (!summary) {
    const t = await getTranslations('tournaments')
    return { title: t('public.not_found_title'), robots: { index: false, follow: false } }
  }
  const locale = await getLocale()
  const canonical = `${SITE_URL}/giai-dau/${summary.slug}`
  const range = formatDateRange(summary.startsAt, summary.endsAt, locale)
  const t = await getTranslations('tournaments')
  const description = [summary.location, range].filter(Boolean).join(' · ') || t('public.page_desc')

  return {
    title: summary.name,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      url: canonical,
      locale: OG_LOCALE[locale] ?? 'vi_VN',
      siteName: SITE_NAME,
      title: `${summary.name} · ${SITE_NAME}`,
      description,
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: 'summary_large_image', title: `${summary.name} · ${SITE_NAME}`, description, images: [DEFAULT_OG_IMAGE] },
  }
}

export default async function TournamentDetailPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: SP
}) {
  const t = await getTranslations('tournaments')
  const locale = await getLocale()

  const summary = await getPublicTournamentBySlug(params.slug)
  if (!summary) notFound()

  // Resolve the selected event from the URL (?event), falling back to the first event.
  const requestedEvent = typeof searchParams.event === 'string' ? searchParams.event : ''
  const validEvent = summary.events.find((e) => e.id === requestedEvent)
  const selectedEventId = validEvent?.id ?? summary.events[0]?.id ?? ''

  const workspace = selectedEventId ? await getPublicEventWorkspace(summary.slug, selectedEventId) : null

  const phase = tournamentPhase(summary.status, summary.startsAt, summary.endsAt)
  const dateRange = formatDateRange(summary.startsAt, summary.endsAt, locale)
  const initialTab = tabFromSlug(typeof searchParams.tab === 'string' ? searchParams.tab : undefined)

  const breadcrumb = jsonLdString(
    breadcrumbJsonLd([
      { name: SITE_NAME, path: '/' },
      { name: t('public.page_title'), path: '/giai-dau' },
      { name: summary.name, path: `/giai-dau/${summary.slug}` },
    ]),
  )
  const sportsEvent = jsonLdString({
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: summary.name,
    url: `${SITE_URL}/giai-dau/${summary.slug}`,
    ...(summary.startsAt ? { startDate: summary.startsAt } : {}),
    ...(summary.endsAt ? { endDate: summary.endsAt } : {}),
    ...(summary.location ? { location: { '@type': 'Place', name: summary.location } } : {}),
    eventStatus:
      summary.status === 'completed'
        ? 'https://schema.org/EventScheduled'
        : 'https://schema.org/EventScheduled',
  })

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumb }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: sportsEvent }} />
      <TournamentDetail
        summary={summary}
        phase={phase}
        dateRange={dateRange}
        workspace={workspace}
        selectedEventId={selectedEventId}
        initialTab={initialTab}
      />
    </>
  )
}
