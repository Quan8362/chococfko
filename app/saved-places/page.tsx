import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import { getAllPlacesFromDb, places as staticPlaces, attachPlaceTags } from '@/lib/places'
import PlaceCard from '@/components/PlaceCard'
import SavedPlacesClient from './SavedPlacesClient'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('saved_places_page')
  const description = t('sub')
  return {
    title: t('title'),
    description,
    openGraph: { title: t('title'), description },
    robots: { index: false },
  }
}

export default async function SavedPlacesPage() {
  const [t, tt, locale] = await Promise.all([getTranslations('saved_places_page'), getTranslations('trips'), getLocale()])

  // All places + pre-rendered cards; the client picks saved + recently-viewed by
  // slug (saves come from the provider: DB for members, localStorage for guests).
  const all = await attachPlaceTags((await getAllPlacesFromDb(locale)) ?? staticPlaces)
  const cards: Record<string, React.ReactNode> = Object.fromEntries(
    all.map((p) => [p.slug, <PlaceCard key={p.slug} place={p} showCategoryBadge />]),
  )

  return (
    <div className="min-h-[calc(100vh-160px)] py-14 px-6">
      <div className="max-w-[1100px] mx-auto">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-rose transition-colors mb-10">
          {t('back')}
        </Link>

        <div className="mb-10">
          <h1 className="font-serif font-black text-[clamp(28px,4vw,44px)] leading-[1.1] tracking-[-0.5px] text-ink mb-2">
            {t('heading')}{' '}
            <em className="italic text-rose not-italic">{t('heading_accent')}</em>
          </h1>
          <p className="text-[15px] text-muted">{t('sub')}</p>
          <div className="flex gap-2 mt-4">
            <Link href="/lists" className="text-[13px] font-semibold px-4 py-2 rounded-full border border-line text-ink hover:border-rose/40 hover:text-rose transition-colors">📋 {tt('lists')}</Link>
            <Link href="/plans" className="text-[13px] font-semibold px-4 py-2 rounded-full border border-line text-ink hover:border-rose/40 hover:text-rose transition-colors">🗺️ {tt('plans')}</Link>
          </div>
        </div>

        <SavedPlacesClient
          cards={cards}
          emptyTitle={t('empty_title')}
          emptySub={t('empty_sub')}
          exploreCta={t('explore_cta')}
        />
      </div>
    </div>
  )
}
