// ============================================================
// Shared map concepts — the small, provider-agnostic vocabulary used by both
// the Leaflet (production) and Google (foundation) renderers.
//
// Deliberately MINIMAL: only the concepts both providers genuinely share. Google
// -specific capabilities (external POI previews, Place Details, Routes) stay in
// provider-specific modules and are NOT forced into this interface.
// ============================================================

export type MapProviderId = 'leaflet' | 'google';

export interface LatLng {
  lat: number;
  lng: number;
}

/** Viewport rectangle (degrees). Used by future "search this area" / fit-bounds. */
export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/** A point of interest to render. `id` is the place slug (stable selection key). */
export interface MapMarker {
  id: string;
  position: LatLng;
  title?: string;
}

/**
 * Props every basic map renderer accepts. This is the IMPLEMENTED subset used by
 * the Phase-3 foundation (center / zoom / single marker). The fuller set of
 * shared concepts that later phases will add to both providers — bounds change,
 * map click, marker selection, user location, fit bounds, recenter, search-area —
 * is captured by `MapViewProps` below but intentionally not implemented yet.
 */
export interface BasicMapProps {
  center: LatLng;
  zoom: number;
  marker?: MapMarker | null;
  className?: string;
}

/** Forward-looking shared contract for the eventual full map view (not yet built). */
export interface MapViewProps extends BasicMapProps {
  markers?: MapMarker[];
  selectedId?: string | null;
  userLocation?: LatLng | null;
  onMapClick?: (p: LatLng) => void;
  onBoundsChange?: (b: MapBounds) => void;
  onMarkerSelect?: (id: string) => void;
  onSearchArea?: (b: MapBounds) => void;
}
