import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getAllPlacesFromDb, places as staticPlaces } from '@/lib/places'
import type { Place } from '@/lib/places'
import BanDoClient from './BanDoClient'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('map_page')
  const description = t('sub')
  return {
    title: t('title'),
    description,
    openGraph: { title: t('title'), description },
  }
}

export default async function BanDoPage() {
  const t = await getTranslations('map_page')
  const tc = await getTranslations('categories')

  const dbPlaces = await getAllPlacesFromDb()
  const allPlaces: Place[] = dbPlaces ?? staticPlaces

  // Collect unique areas
  const areas = Array.from(new Set(allPlaces.map((p) => p.area).filter(Boolean))).sort()

  // Collect unique categories that have at least 1 place
  const cats = Array.from(new Set(allPlaces.map((p) => p.category))).sort()

  const placesData = allPlaces.map((p) => ({
    slug: p.slug,
    name: p.name,
    area: p.area,
    category: p.category,
    categoryLabel: tc(p.category as Parameters<typeof tc>[0]),
    mapUrl: p.mapUrl,
    img: p.img,
    imgFallback: p.imgFallback,
  }))

  return (
    <div className="min-h-[calc(100vh-160px)] py-14 px-6">
      <div className="max-w-[1240px] mx-auto">

        {/* Breadcrumb */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-rose transition-colors mb-10"
        >
          {t('back')}
        </Link>

        {/* Header */}
        <div className="mb-10">
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[2.5px] uppercase text-rose mb-5 before:content-[''] before:w-5 before:h-px before:bg-rose/60 after:content-[''] after:w-5 after:h-px after:bg-rose/60">
            {t('label')}
          </span>
          <h1 className="font-serif font-black text-[clamp(28px,4vw,48px)] leading-[1.1] tracking-[-0.5px] text-ink mb-3">
            {t('heading')}{' '}
            <em className="italic text-rose not-italic">{t('heading_accent')}</em>
          </h1>
          <p className="text-[15.5px] text-muted leading-[1.7]">{t('sub')}</p>
        </div>

        <BanDoClient
          places={placesData}
          areas={areas}
          cats={cats}
          filterAll={t('filter_all')}
          filterTopic={t('filter_topic')}
          filterArea={t('filter_area')}
          openMaps={t('open_maps')}
          detail={t('detail')}
          count={t('count')}
          noResults={t('no_results')}
        />

      </div>
    </div>
  )
}
