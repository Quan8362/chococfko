'use client'

// Google map preview with a single draggable Advanced Marker for the Admin place
// picker. Controlled: parent owns lat/lng; map click (incl. base-map POI) and
// marker drag report new coordinates via onPick. Browser-only; lazy-loaded.

import { useEffect, useRef } from 'react'
import { loadGoogleMaps } from '@/lib/maps/google/loader'

type Status = 'loading' | 'ready' | 'error'
/* eslint-disable @typescript-eslint/no-explicit-any */

interface Props {
  apiKey: string | null
  mapId: string | null
  lat: number | null
  lng: number | null
  /** Reports a new point. placeId is set when a base-map POI was clicked. */
  onPick: (lat: number, lng: number, placeId: string | null) => void
  onStatus?: (s: Status) => void
}

const DEFAULT_CENTER = { lat: 33.5902, lng: 130.4017 } // Fukuoka / Hakata

export default function PickerMap({ apiKey, mapId, lat, lng, onPick, onStatus }: Props) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick

  // Init once.
  useEffect(() => {
    let cancelled = false
    onStatus?.('loading')
    ;(async () => {
      try {
        const maps = await loadGoogleMaps({ apiKey })
        if (cancelled || !elRef.current) return
        const { Map } = (await maps.importLibrary('maps')) as any
        const { AdvancedMarkerElement, PinElement } = (await maps.importLibrary('marker')) as any
        const hasPoint = typeof lat === 'number' && typeof lng === 'number'
        const center = hasPoint ? { lat: lat as number, lng: lng as number } : DEFAULT_CENTER
        const map = new Map(elRef.current, {
          center, zoom: hasPoint ? 16 : 11, mapId: mapId ?? 'DEMO_MAP_ID',
          clickableIcons: true, mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        })
        const pin = PinElement ? new PinElement({ background: '#c2185b', borderColor: '#fff', glyphColor: '#fff' }) : null
        const marker = new AdvancedMarkerElement({
          map, gmpDraggable: true,
          position: hasPoint ? center : null,
          content: pin?.element,
        })
        map.addListener('click', (e: any) => {
          const ll = e.latLng
          if (!ll) return
          if (e.placeId) e.stop?.() // suppress the default POI info window
          onPickRef.current(ll.lat(), ll.lng(), e.placeId ?? null)
        })
        marker.addListener('dragend', () => {
          const p = marker.position
          if (p) onPickRef.current(typeof p.lat === 'function' ? p.lat() : p.lat, typeof p.lng === 'function' ? p.lng() : p.lng, null)
        })
        mapRef.current = map
        markerRef.current = marker
        if (!cancelled) onStatus?.('ready')
      } catch {
        if (!cancelled) onStatus?.('error')
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, mapId])

  // Sync map + marker to controlled lat/lng (e.g. after search select / link paste).
  useEffect(() => {
    const map = mapRef.current
    const marker = markerRef.current
    if (!map || !marker) return
    if (typeof lat === 'number' && typeof lng === 'number') {
      const pos = { lat, lng }
      marker.position = pos
      map.setCenter(pos)
      if (map.getZoom() < 14) map.setZoom(16)
    } else {
      marker.position = null
    }
  }, [lat, lng])

  return <div ref={elRef} className="absolute inset-0" />
}
