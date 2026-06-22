'use client'

// Minimal Leaflet basic map for the provider foundation. Intentionally tiny —
// the FULL production Leaflet experience stays untouched in app/map/MapExplorer.
// This only proves the shared BasicMapProps contract for the Leaflet side.

import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useEffect, useRef } from 'react'
import type { BasicMapProps } from '@/lib/maps/types'

export default function LeafletBasicMap({ center, zoom, marker, className }: BasicMapProps) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!elRef.current || mapRef.current) return
    const map = L.map(elRef.current, { zoomControl: true }).setView([center.lat, center.lng], zoom)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)
    if (marker) {
      L.marker([marker.position.lat, marker.position.lng]).addTo(map)
        .bindPopup(marker.title ?? marker.id)
    }
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={elRef} className={className ?? 'w-full h-full'} />
}
