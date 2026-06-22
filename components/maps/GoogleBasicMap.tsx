'use client'

// Minimal Google Maps basic map for the provider foundation. Renders only:
// center, zoom, and one Advanced Marker. No autocomplete / POI / routes here —
// those arrive in later phases. Loads the API lazily via the safe bootstrap
// loader and exposes explicit loading / error states.

import { useEffect, useRef, useState } from 'react'
import { loadGoogleMaps } from '@/lib/maps/google/loader'
import type { BasicMapProps } from '@/lib/maps/types'

type Status = 'loading' | 'ready' | 'error'

// Minimal local constructor typings (no @types/google.maps dependency).
type MapsMapCtor = new (el: HTMLElement, opts: Record<string, unknown>) => unknown
type AdvancedMarkerCtor = new (opts: Record<string, unknown>) => unknown

interface Props extends BasicMapProps {
  apiKey: string | null
  /** Map ID is required for Advanced Markers; DEMO_MAP_ID is a dev fallback. */
  mapId: string | null
  onStatus?: (s: Status) => void
}

export default function GoogleBasicMap({ center, zoom, marker, className, apiKey, mapId, onStatus }: Props) {
  const elRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => { onStatus?.(status) }, [status, onStatus])

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    ;(async () => {
      try {
        const maps = await loadGoogleMaps({ apiKey })
        if (cancelled || !elRef.current) return
        const { Map } = (await maps.importLibrary('maps')) as { Map: MapsMapCtor }
        const map = new Map(elRef.current, {
          center,
          zoom,
          mapId: mapId ?? 'DEMO_MAP_ID',
          clickableIcons: false, // keep POI clicks off until the POI phase
          mapTypeControl: false,
          streetViewControl: false,
        })
        if (marker) {
          const { AdvancedMarkerElement } = (await maps.importLibrary('marker')) as {
            AdvancedMarkerElement: AdvancedMarkerCtor
          }
          new AdvancedMarkerElement({ map, position: marker.position, title: marker.title })
        }
        if (!cancelled) setStatus('ready')
      } catch {
        if (!cancelled) setStatus('error')
      }
    })()
    return () => { cancelled = true }
  }, [apiKey, mapId, center, zoom, marker])

  return (
    <div className={`relative ${className ?? 'w-full h-full'}`}>
      <div ref={elRef} className="absolute inset-0" />
      {status !== 'ready' && (
        <div className="absolute inset-0 grid place-items-center bg-cream/60 text-[13px] text-muted pointer-events-none">
          {status === 'loading' ? '…' : '⚠'}
        </div>
      )}
    </div>
  )
}
