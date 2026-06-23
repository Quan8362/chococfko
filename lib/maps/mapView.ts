// ============================================================
// Pure helpers for the public Map V2 (Map UX Phase 6): URL ↔ view-state codec,
// "search this area" movement threshold, viewport bounds maths, and the
// restrained branded-marker accent palette. No DOM / no Leaflet — unit-testable.
// ============================================================

import { haversineKm } from '../geo.ts';
import { isValidCoordinate } from '../coordinates.ts';
import { isPriceRangeKey } from '../placeBudget.ts';

export interface LatLng { lat: number; lng: number }
export interface MapBounds { north: number; south: number; east: number; west: number }

export interface MapViewState {
  center: LatLng | null;
  zoom: number | null;
  category: string;
  q: string;
  openNow: boolean;
  /** Price choice: '' = all, 'free', or a predefined bucket key. Custom uses priceMin/priceMax. */
  price: string;
  priceMin: number | null;
  priceMax: number | null;
  selected: string | null;
  mode: 'map' | 'list' | null;
}

export const DEFAULT_MAP_VIEW: MapViewState = {
  center: null, zoom: null, category: '', q: '', openNow: false,
  price: '', priceMin: null, priceMax: null, selected: null, mode: null,
};

const round = (n: number, dp = 5) => Number(n.toFixed(dp));

/** Decode view-state from URL params (via a getter). Tolerant; never throws. */
export function decodeMapView(get: (k: string) => string | null): MapViewState {
  const s: MapViewState = { ...DEFAULT_MAP_VIEW };
  const c = get('c');
  if (c) {
    const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(c.trim());
    if (m) {
      const lat = Number(m[1]); const lng = Number(m[2]);
      if (isValidCoordinate(lat, lng)) s.center = { lat, lng };
    }
  }
  const z = Number(get('z'));
  if (Number.isFinite(z) && z >= 1 && z <= 22) s.zoom = Math.round(z);
  s.category = (get('cat') ?? '').trim();
  s.q = (get('q') ?? '').trim();
  s.openNow = ['1', 'true'].includes((get('open') ?? '').toLowerCase());
  const price = (get('price') ?? '').trim();
  if (price === 'free' || isPriceRangeKey(price)) {
    s.price = price;
  } else {
    const pmin = Number.parseInt(get('priceMin') ?? '', 10);
    const pmax = Number.parseInt(get('priceMax') ?? '', 10);
    if (Number.isFinite(pmin) && pmin >= 0) s.priceMin = pmin;
    if (Number.isFinite(pmax) && pmax >= 0) s.priceMax = pmax;
  }
  s.selected = (get('sel') ?? '').trim() || null;
  const mode = (get('mode') ?? '').trim();
  s.mode = mode === 'list' || mode === 'map' ? mode : null;
  return s;
}

/** Encode view-state to a minimal param map (omits defaults — keeps URLs short). */
export function encodeMapView(s: MapViewState): Record<string, string> {
  const out: Record<string, string> = {};
  if (s.center) out.c = `${round(s.center.lat)},${round(s.center.lng)}`;
  if (s.zoom != null) out.z = String(s.zoom);
  if (s.category) out.cat = s.category;
  if (s.q) out.q = s.q;
  if (s.openNow) out.open = '1';
  if (s.price) out.price = s.price;
  else {
    if (s.priceMin != null) out.priceMin = String(s.priceMin);
    if (s.priceMax != null) out.priceMax = String(s.priceMax);
  }
  if (s.selected) out.sel = s.selected;
  if (s.mode) out.mode = s.mode;
  return out;
}

/** Build a query string ("?a=b&c=d" or "") from encoded view-state. */
export function mapViewToQuery(s: MapViewState): string {
  const params = new URLSearchParams(encodeMapView(s));
  const q = params.toString();
  return q ? `?${q}` : '';
}

// ── Viewport maths ─────────────────────────────────────────────────────────
/** Web-mercator metres-per-pixel at a latitude/zoom (for movement thresholds). */
export function metersPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

/**
 * Should we offer "Search this area"? True when the zoom changed, or the centre
 * moved more than ~25% of the viewport width. Pure & deterministic.
 */
export function shouldOfferSearchArea(
  prev: { center: LatLng; zoom: number },
  next: { center: LatLng; zoom: number },
  viewportPx = 900,
): boolean {
  if (prev.zoom !== next.zoom) return true;
  const movedM = haversineKm(prev.center, next.center) * 1000;
  const widthM = metersPerPixel(next.center.lat, next.zoom) * viewportPx;
  return movedM > widthM * 0.25;
}

/** A bounding box centred on a point spanning `spanDeg` latitude degrees. */
export function boundsFromCenter(center: LatLng, spanDeg = 0.2): MapBounds {
  const dLat = spanDeg / 2;
  const dLng = dLat / Math.max(0.2, Math.cos((center.lat * Math.PI) / 180));
  return { north: center.lat + dLat, south: center.lat - dLat, east: center.lng + dLng, west: center.lng - dLng };
}

/** Centre of a bounding box. */
export function boundsCenter(b: MapBounds): LatLng {
  return { lat: (b.north + b.south) / 2, lng: (b.east + b.west) / 2 };
}

// ── Branded marker palette (restrained: one accent per category GROUP) ──────
// Few colours on purpose. Everything else falls back to the brand rose.
const ACCENTS = {
  brand: '#c2185b',   // rose — default / landmark / community / viet
  food: '#f59e0b',    // amber
  cafe: '#0e9aa7',    // teal
  nature: '#10b981',  // emerald — park / beach / camp / mountain / sea
  onsen: '#0ea5e9',   // sky
  shop: '#8b5cf6',    // violet
} as const;

const GROUP: Record<string, keyof typeof ACCENTS> = {
  food: 'food', viet: 'brand', izakaya: 'food', japanese: 'food', thai: 'food', chinese: 'food', korean: 'food',
  cafe_milk_tea: 'cafe',
  park: 'nature', sea: 'nature', camp: 'nature', mountain: 'nature', kids_playground: 'nature',
  onsen: 'onsen',
  grocery: 'shop',
  landmark: 'brand',
};

/** Accent colour for a category marker (limited palette; brand fallback). */
export function markerAccent(category: string): string {
  return ACCENTS[GROUP[category] ?? 'brand'];
}
