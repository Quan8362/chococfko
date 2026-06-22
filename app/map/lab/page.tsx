import Link from 'next/link'
import { redirect } from 'next/navigation'
import loadDynamic from 'next/dynamic'
import { getTranslations } from 'next-intl/server'
import { getMapConfig } from '@/lib/maps/config'
import { checkIsAdmin } from '@/lib/supabase/admin'
import { places as staticPlaces } from '@/lib/places'
import type { MapMarker } from '@/lib/maps/types'

export const dynamic = 'force-dynamic'

// Client-only (both renderers touch the DOM). Loaded as a server shell.
const MapFoundation = loadDynamic(() => import('@/components/maps/MapFoundation'), { ssr: false })

const DEFAULT_CENTER = { lat: 33.5902, lng: 130.4017 } // Fukuoka / Hakata

// One test marker derived from existing internal data (a known static place).
// Existing DB rows have no coordinates yet (Phase 2 finding), so this uses a
// fixed SAMPLE coordinate purely to prove rendering — not persisted data.
const SAMPLE_PLACE = staticPlaces.find((p) => p.slug === 'dazaifu-tenmangu') ?? staticPlaces[0]
const TEST_MARKER: MapMarker = {
  id: SAMPLE_PLACE.slug,
  title: SAMPLE_PLACE.name,
  position: { lat: 33.5213, lng: 130.5347 }, // Dazaifu Tenmangu (sample)
}

export async function generateMetadata() {
  const t = await getTranslations('map_lab')
  return { title: t('title'), robots: { index: false, follow: false } }
}

export default async function MapLabPage() {
  const t = await getTranslations('map_lab')
  const config = getMapConfig()

  // Gate 1: the foundation is off unless Map V2 is explicitly enabled.
  if (!config.v2Enabled) {
    return (
      <div className="max-w-[760px] mx-auto px-6 py-16 text-center">
        <h1 className="font-serif font-bold text-[26px] text-ink mb-2">{t('title')}</h1>
        <p className="text-[14px] text-muted mb-6">{t('disabled_notice')}</p>
        <Link href="/map" className="text-[13px] font-semibold text-rose hover:underline">{t('back_to_map')} →</Link>
      </div>
    )
  }

  // Gate 2: during rollout, restrict to internal (admin) users.
  if (config.internalOnly && !(await checkIsAdmin())) redirect('/map')

  return (
    <div className="max-w-[1080px] mx-auto px-5 sm:px-6 py-8 pb-16">
      <header className="mb-4">
        <div className="flex items-center gap-2 mb-1.5">
          <h1 className="font-serif font-bold text-[clamp(22px,4vw,32px)] text-ink">{t('title')}</h1>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">{t('badge_lab')}</span>
        </div>
        <p className="text-[13.5px] text-muted max-w-[680px]">{t('subtitle')}</p>
        <Link href="/map" className="inline-block mt-2 text-[12.5px] text-teal hover:underline">{t('back_to_map')} →</Link>
      </header>

      <MapFoundation
        provider={config.provider}
        requestedProvider={config.requestedProvider}
        googleMapsEnabled={config.googleMapsEnabled}
        apiKey={config.browserKey}
        mapId={config.mapId}
        center={DEFAULT_CENTER}
        zoom={11}
        marker={TEST_MARKER}
      />
    </div>
  )
}
