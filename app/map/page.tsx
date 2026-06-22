import loadDynamic from 'next/dynamic'
import { getTranslations, getLocale } from 'next-intl/server'
import { getAllPlacesFromDb, places as staticPlaces, categoryEmoji, categories, type Place } from '@/lib/places'
import { isValidLat, isValidLng } from '@/lib/coordinates'
import { getMapConfig, externalSearchAvailable, routePreviewAvailable, canSeeMapV2 } from '@/lib/maps/config'
import { decodeMapView, boundsFromCenter } from '@/lib/maps/mapView'
import { getPlacesInBounds } from '@/lib/placesNearby'
import { getCurrentUserAccess } from '@/lib/access-server'

export const dynamic = 'force-dynamic'

// Map is client-only (Leaflet needs the DOM) — render shell on the server only.
const MapExplorer = loadDynamic(() => import('./MapExplorer'), { ssr: false })
const MapExplorerV2 = loadDynamic(() => import('./MapExplorerV2'), { ssr: false })

const DEFAULT_CENTER = { lat: 33.5902, lng: 130.4017 } // Fukuoka / Hakata

export async function generateMetadata() {
  const t = await getTranslations('map_explore')
  return { title: t('title'), description: t('subtitle'), openGraph: { title: t('title'), description: t('subtitle') } }
}

/** Average coordinate of places sharing a name field (area or station). */
function centersBy(places: Place[], key: (p: Place) => string | null | undefined) {
  const acc = new Map<string, { lat: number; lng: number; n: number }>()
  for (const p of places) {
    if (!isValidLat(p.lat) || !isValidLng(p.lng)) continue
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

type SearchParams = Record<string, string | undefined>

export default async function MapPage({ searchParams }: { searchParams: SearchParams }) {
  const [t, tc] = await Promise.all([
    getTranslations('map_explore'),
    getTranslations('categories'),
  ])
  const cats = categories.map((c) => ({ code: c.code, label: tc(c.code as Parameters<typeof tc>[0]), emoji: categoryEmoji[c.code] ?? '📍' }))
  const config = getMapConfig()

  // ── Map V2 — flag-gated + SERVER-SIDE internal-only authorization. ──
  // The legacy Leaflet map below is the fallback for: V2 disabled, OR V2 enabled
  // with internal-only on and the viewer is not an authenticated Admin/internal
  // member (anonymous + normal users). Authorization is resolved on the server
  // via getCurrentUserAccess(); we never rely on client-side hiding.
  if (config.v2Enabled) {
    const access = await getCurrentUserAccess()
    if (canSeeMapV2(config, access)) {
      const initialState = decodeMapView((k) => searchParams[k] ?? null)
      const center = initialState.center ?? DEFAULT_CENTER
      // SSR an initial viewport so the list has content without JS (and as a
      // list-only fallback). Empty today (no places have coordinates yet).
      const [initialPlaces, locale] = await Promise.all([
        getPlacesInBounds(boundsFromCenter(center, 0.25), { category: initialState.category, q: initialState.q, limit: 200 }),
        getLocale(),
      ])
      return (
        <div className="px-3 sm:px-4 py-3">
          <h1 className="sr-only">{t('title')}</h1>
          <MapExplorerV2
            defaultCenter={DEFAULT_CENTER}
            categories={cats}
            initialPlaces={initialPlaces}
            initialState={initialState}
            externalEnabled={externalSearchAvailable(config)}
            apiKey={config.browserKey}
            locale={locale}
            isAdmin={access.isAdmin}
            adminSearchEnabled={config.adminPlaceSearchEnabled}
            routePreviewAvailable={routePreviewAvailable(config)}
          />
        </div>
      )
    }
    // V2 enabled but this viewer is not authorized → fall through to legacy.
  }

  // ── Existing map (production default / unauthorized fallback) — unchanged ──
  const all = (await getAllPlacesFromDb()) ?? staticPlaces
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
