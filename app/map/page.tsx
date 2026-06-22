import loadDynamic from 'next/dynamic'
import { getTranslations } from 'next-intl/server'
import { getAllPlacesFromDb, places as staticPlaces, categoryEmoji, categories, type Place } from '@/lib/places'

export const dynamic = 'force-dynamic'

// Map is client-only (Leaflet needs the DOM) — render shell on the server only.
const MapExplorer = loadDynamic(() => import('./MapExplorer'), { ssr: false })

const DEFAULT_CENTER = { lat: 33.5902, lng: 130.4017 } // Fukuoka / Hakata

export async function generateMetadata() {
  const t = await getTranslations('map_explore')
  return { title: t('title'), description: t('subtitle'), openGraph: { title: t('title'), description: t('subtitle') } }
}

/** Average coordinate of places sharing a name field (area or station). */
function centersBy(places: Place[], key: (p: Place) => string | null | undefined) {
  const acc = new Map<string, { lat: number; lng: number; n: number }>()
  for (const p of places) {
    if (typeof p.lat !== 'number' || typeof p.lng !== 'number') continue
    const name = key(p)?.trim()
    if (!name) continue
    const cur = acc.get(name) ?? { lat: 0, lng: 0, n: 0 }
    cur.lat += p.lat; cur.lng += p.lng; cur.n += 1
    acc.set(name, cur)
  }
  return Array.from(acc.entries())
    .map(([name, v]) => ({ name, lat: v.lat / v.n, lng: v.lng / v.n }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export default async function MapPage() {
  const [t, tc] = await Promise.all([
    getTranslations('map_explore'),
    getTranslations('categories'),
  ])

  const all = (await getAllPlacesFromDb()) ?? staticPlaces
  const cats = categories.map((c) => ({ code: c.code, label: tc(c.code as Parameters<typeof tc>[0]), emoji: categoryEmoji[c.code] ?? '📍' }))
  const areaCenters = centersBy(all, (p) => p.area).slice(0, 60)
  const stationCenters = centersBy(all, (p) => p.nearestStation).slice(0, 60)

  return (
    <div className="max-w-[1280px] mx-auto px-5 sm:px-6 py-8 pb-16">
      <header className="mb-5">
        <h1 className="font-serif font-bold text-[clamp(26px,4vw,40px)] leading-tight tracking-[-0.4px] text-ink mb-2">{t('title')}</h1>
        <p className="text-[15px] text-muted max-w-[680px] leading-relaxed">{t('subtitle')}</p>
      </header>
      <MapExplorer
        defaultCenter={DEFAULT_CENTER}
        defaultRadius={5}
        categories={cats}
        areaCenters={areaCenters}
        stationCenters={stationCenters}
      />
    </div>
  )
}
