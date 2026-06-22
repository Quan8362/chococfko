// Pure (de)serialization of the Explore search + filter state to URL params, so
// searches are shareable and survive refresh / Back-Forward. No DOM/Next deps.

export const SORT_KEYS = ['recommended', 'nearest', 'recently_verified', 'price_low', 'community', 'newest'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export interface ExploreFilters {
  q?: string;
  category?: string;
  prefecture?: string;
  area?: string;
  station?: string;
  sort?: SortKey;
  fee?: 'free' | 'paid';
  priceMin?: number;
  priceMax?: number;
  openNow?: boolean;
  nearby?: boolean;
  reservationAvailable?: boolean;
  reservationRequired?: boolean;
  parking?: boolean;
  children?: boolean;
  solo?: boolean;
  group?: boolean;
  rainy?: boolean;
  indoor?: boolean;
  outdoor?: boolean;
  wheelchair?: boolean;
  bbq?: boolean;
  camping?: boolean;
  smoking?: 'no_smoking' | 'smoking_allowed' | 'separated';
  tattoo?: 'allowed' | 'not_allowed' | 'covered_ok';
  payment?: string[];
  lang?: string[];
  verified?: boolean;
  recentlyUpdated?: boolean;
}

const BOOL_KEYS: (keyof ExploreFilters)[] = [
  'openNow', 'nearby', 'reservationAvailable', 'reservationRequired', 'parking',
  'children', 'solo', 'group', 'rainy', 'indoor', 'outdoor', 'wheelchair',
  'bbq', 'camping', 'verified', 'recentlyUpdated',
];
const STR_KEYS: (keyof ExploreFilters)[] = ['q', 'category', 'prefecture', 'area', 'station', 'fee', 'smoking', 'tattoo'];
const NUM_KEYS: (keyof ExploreFilters)[] = ['priceMin', 'priceMax'];
const LIST_KEYS: (keyof ExploreFilters)[] = ['payment', 'lang'];

/** Filter keys that count as "active filter chips" (everything except q/sort). */
export const CHIP_KEYS: (keyof ExploreFilters)[] = [
  'category', 'prefecture', 'area', 'station', 'fee', 'priceMin', 'priceMax',
  ...BOOL_KEYS, 'smoking', 'tattoo', ...LIST_KEYS,
];

export function encodeFilters(f: ExploreFilters): URLSearchParams {
  const sp = new URLSearchParams();
  for (const k of STR_KEYS) { const v = f[k] as string | undefined; if (v) sp.set(k, v); }
  for (const k of NUM_KEYS) { const v = f[k] as number | undefined; if (v != null && Number.isFinite(v)) sp.set(k, String(v)); }
  for (const k of BOOL_KEYS) { if (f[k]) sp.set(k, '1'); }
  for (const k of LIST_KEYS) { const v = f[k] as string[] | undefined; if (v && v.length) sp.set(k, v.join(',')); }
  if (f.sort && f.sort !== 'recommended') sp.set('sort', f.sort);
  return sp;
}

export function decodeFilters(get: (key: string) => string | null | undefined): ExploreFilters {
  const f: ExploreFilters = {};
  for (const k of STR_KEYS) { const v = get(k); if (v) (f as Record<string, unknown>)[k] = v.trim(); }
  for (const k of NUM_KEYS) { const v = get(k); const n = v != null ? Number.parseInt(v, 10) : NaN; if (Number.isFinite(n) && n >= 0) (f as Record<string, unknown>)[k] = n; }
  for (const k of BOOL_KEYS) { if (get(k) === '1') (f as Record<string, unknown>)[k] = true; }
  for (const k of LIST_KEYS) { const v = get(k); if (v) (f as Record<string, unknown>)[k] = v.split(',').map((s) => s.trim()).filter(Boolean); }
  const sort = get('sort');
  if (sort && (SORT_KEYS as readonly string[]).includes(sort)) f.sort = sort as SortKey;
  return f;
}

/**
 * Pure mapping of static ExploreFilters → a PlaceCriteria-shaped object (no
 * runtime intent/geolocation merge — that stays in PlacesExplorer). Reused by
 * collections to filter the same engine deterministically. Returns a plain
 * object compatible with `filterPlaces`'s PlaceCriteria.
 */
export function filtersToCriteria(f: ExploreFilters): Record<string, unknown> {
  return {
    q: f.q,
    categories: f.category ? [f.category] : undefined,
    prefecture: f.prefecture ?? null,
    area: f.area ?? null,
    station: f.station ?? null,
    fee: f.fee,
    priceMin: f.priceMin ?? null,
    priceMax: f.priceMax ?? null,
    openNow: f.openNow || undefined,
    reservationAvailable: f.reservationAvailable || undefined,
    reservationRequired: f.reservationRequired || undefined,
    parking: f.parking || undefined,
    children: f.children || undefined,
    solo: f.solo || undefined,
    group: f.group || undefined,
    rainy: f.rainy || undefined,
    indoor: f.indoor || undefined,
    outdoor: f.outdoor || undefined,
    wheelchair: f.wheelchair || undefined,
    bbq: f.bbq || undefined,
    camping: f.camping || undefined,
    smoking: f.smoking ?? null,
    tattoo: f.tattoo ?? null,
    paymentMethods: f.payment,
    languages: f.lang,
    verifiedOnly: f.verified || undefined,
    recentlyUpdatedDays: f.recentlyUpdated ? 30 : null,
    sort: f.sort,
  };
}

/** Count of active filters (for the "Filters (N)" button + clear-all visibility). */
export function activeFilterCount(f: ExploreFilters): number {
  let n = 0;
  for (const k of CHIP_KEYS) {
    const v = f[k];
    if (Array.isArray(v)) n += v.length ? 1 : 0;
    else if (typeof v === 'boolean') n += v ? 1 : 0;
    else if (v != null && v !== '') n += 1;
  }
  return n;
}
