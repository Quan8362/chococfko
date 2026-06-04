import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { getAllPlacesFromDb, places as staticPlaces, categories as allCategories } from '@/lib/places'
import DestinationWheel from './DestinationWheel'

export async function generateMetadata() {
  const t = await getTranslations('games.destination_wheel')
  return { title: `${t('title')} · Chợ Cóc FKO` }
}

export default async function DestinationWheelPage() {
  const t = await getTranslations('games.destination_wheel')
  const tGames = await getTranslations('games')

  const dbPlaces = await getAllPlacesFromDb()
  const allPlaces = dbPlaces ?? staticPlaces

  // Filter categories that have at least one place — done server-side so the client component
  // never needs to import from lib/places (which would pull next/headers into the client bundle)
  const availableCategories = allCategories.filter(cat =>
    allPlaces.some(p => p.category === cat.code)
  )

  return (
    <div className="max-w-[960px] mx-auto px-5 sm:px-6 py-10 pb-20">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-[13px] text-muted mb-8">
        <Link href="/games" className="hover:text-rose transition-colors">
          {t('breadcrumb')}
        </Link>
        <span className="text-muted/40">›</span>
        <span className="text-ink/70">{t('title')}</span>
      </nav>

      {/* Header */}
      <div className="mb-10">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[2.5px] uppercase text-rose bg-rose/10 border border-rose/20 px-3 py-1.5 rounded-full mb-4">
          {t('page_badge')}
        </span>
        <h1 className="font-serif font-bold text-[clamp(28px,4vw,42px)] leading-tight tracking-[-0.4px] text-ink mb-2">
          {t('page_heading')}
        </h1>
        <p className="text-[15px] text-muted leading-relaxed max-w-[560px]">
          {t('page_desc')}
        </p>
      </div>

      <DestinationWheel places={allPlaces} categories={availableCategories} />
    </div>
  )
}
