'use client'

// Provider-switching foundation surface (Phase 3). Picks Leaflet or Google by
// the resolved config and renders a BASIC map (center + zoom + one test marker)
// with loading / error states. This is a flag-gated lab surface — the real
// production map at /map is untouched.

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import LeafletBasicMap from './LeafletBasicMap'
import GoogleBasicMap from './GoogleBasicMap'
import type { MapProviderId, MapMarker, LatLng } from '@/lib/maps/types'

type Status = 'loading' | 'ready' | 'error'

interface Props {
  provider: MapProviderId
  requestedProvider: MapProviderId
  googleMapsEnabled: boolean
  apiKey: string | null
  mapId: string | null
  center: LatLng
  zoom: number
  marker: MapMarker
}

export default function MapFoundation({
  provider, requestedProvider, googleMapsEnabled, apiKey, mapId, center, zoom, marker,
}: Props) {
  const t = useTranslations('map_lab')
  const [gStatus, setGStatus] = useState<Status>('loading')

  // Explain WHY Leaflet is active when Google was requested but not usable.
  const fallbackReason =
    requestedProvider === 'google' && provider === 'leaflet'
      ? !googleMapsEnabled
        ? t('reason_disabled')
        : !apiKey
          ? t('reason_no_key')
          : null
      : null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="font-semibold px-2.5 py-1 rounded-full bg-ink text-white">
          {t('active_provider', { provider })}
        </span>
        <span className="text-muted">{t('requested_provider', { provider: requestedProvider })}</span>
        {provider === 'google' && (
          <span className={`px-2.5 py-1 rounded-full border ${
            gStatus === 'ready' ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
              : gStatus === 'error' ? 'border-rose/30 text-rose bg-rose-soft'
                : 'border-line text-muted'
          }`}>
            {t(`status_${gStatus}` as 'status_ready')}
          </span>
        )}
      </div>

      {fallbackReason && (
        <p className="text-[12.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          {fallbackReason}
        </p>
      )}

      <div className="w-full h-[60vh] rounded-2xl overflow-hidden border border-line">
        {provider === 'google' ? (
          <GoogleBasicMap center={center} zoom={zoom} marker={marker} apiKey={apiKey} mapId={mapId} onStatus={setGStatus} />
        ) : (
          <LeafletBasicMap center={center} zoom={zoom} marker={marker} />
        )}
      </div>

      <p className="text-[11.5px] text-muted">{t('test_marker_note', { title: marker.title ?? marker.id })}</p>
    </div>
  )
}
