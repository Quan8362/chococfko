// ============================================================
// Centralized price / budget definitions for the Places Explore filter.
//
// ONE source of truth for: the predefined yen ranges, their exact numeric
// boundaries, the URL key set, the yen formatter, and the price-match predicate.
// Shared by the desktop sidebar, the mobile filter sheet, the active-filter
// chips, the search engine (lib/placeSearch), and the Map view — so price
// semantics can never drift between surfaces.
//
// ── Price meaning (documented limitation) ────────────────────────────────────
// Source of truth: Place.priceMin / priceMax (integer yen) + a free flag
// (priceType === 'free' || fee === 'free' ⇒ price 0). The data model has NO
// per-unit "price basis" column, so the UI presents a GENERAL estimated/reference
// cost (per person or per use), never a billing-unit-specific claim. Currency is
// assumed JPY (Japan-only catalog).
//
// ── Buckets (half-open over a single price p, in yen) ────────────────────────
//   free        p === 0   (explicit free flag only)
//   under_1000  0 <  p < 1000
//   1000_3000   1000 ≤ p < 3000
//   3000_5000   3000 ≤ p < 5000
//   over_5000   5000 ≤ p
// Implemented with INCLUSIVE integer bounds (max = next − 1) so a single-price
// place falls in exactly ONE bucket with no gaps/overlaps. Places stored as a
// min–max RANGE use overlap semantics (priceInRange) and may surface in adjacent
// buckets — intended for discovery. Unknown price (no flag, no min/max) matches
// NO numeric bucket and is never treated as free.
// ============================================================

export type PriceRangeKey = 'under_1000' | '1000_3000' | '3000_5000' | 'over_5000';

export const PRICE_RANGE_KEYS: readonly PriceRangeKey[] = ['under_1000', '1000_3000', '3000_5000', 'over_5000'];

/** Inclusive integer-yen bounds for each predefined PAID range. max=null ⇒ open-ended. */
export const PRICE_RANGES: Record<PriceRangeKey, { min: number; max: number | null }> = {
  under_1000: { min: 1, max: 999 },
  '1000_3000': { min: 1000, max: 2999 },
  '3000_5000': { min: 3000, max: 4999 },
  over_5000: { min: 5000, max: null },
};

/** Upper sanity cap for custom price inputs (yen). Rejects fat-finger values. */
export const PRICE_INPUT_MAX = 9_999_999;

export function isPriceRangeKey(v: unknown): v is PriceRangeKey {
  return typeof v === 'string' && (PRICE_RANGE_KEYS as readonly string[]).includes(v);
}

/** i18n key (explore_search namespace) for a predefined range's label. */
export function priceRangeI18nKey(k: PriceRangeKey): 'price_under_1000' {
  return `price_${k}` as 'price_under_1000';
}

/** Format an integer yen amount: no decimals, locale-appropriate grouping, ¥ prefix. */
export function formatYen(amount: number, locale: string): string {
  return `¥${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(amount))}`;
}

// ── The single UI selection model (radio): one price choice at a time ────────
export type PriceSelection = 'all' | 'free' | PriceRangeKey | 'custom';

/** Minimal price-bearing shape satisfied by both Place and NearbyPlace. */
export interface PricedPlace {
  fee?: string | null;
  priceType?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
}

export function placeIsFree(p: PricedPlace): boolean {
  return p.priceType === 'free' || p.fee === 'free';
}

/**
 * Budget overlap match against an inclusive [min, max] yen bound (max null = open).
 * Free always satisfies an upper bound; UNKNOWN price (no flag, no min/max) fails —
 * it can never be confirmed to fit a numeric budget and is never assumed free.
 */
export function priceInRange(p: PricedPlace, min: number | null, max: number | null): boolean {
  const fMin = min ?? 0;
  const fMax = max ?? Number.POSITIVE_INFINITY;
  let pMin: number;
  let pMax: number;
  if (placeIsFree(p)) { pMin = 0; pMax = 0; }
  else if (p.priceMin != null || p.priceMax != null) {
    pMin = p.priceMin ?? (p.priceMax as number);
    pMax = p.priceMax ?? (p.priceMin as number);
  } else {
    return false;
  }
  return pMin <= fMax && pMax >= fMin;
}

/** Inclusive yen bounds for a UI selection. `all`/`free` → no numeric bound. */
export function selectionBounds(sel: PriceSelection, custom?: { min: number | null; max: number | null }): { min: number | null; max: number | null } {
  if (sel === 'all' || sel === 'free') return { min: null, max: null };
  if (sel === 'custom') return { min: custom?.min ?? null, max: custom?.max ?? null };
  const r = PRICE_RANGES[sel];
  return { min: r.min, max: r.max };
}

/** Does a place match a price selection? Shared by the list engine and the Map. */
export function placeMatchesPriceSelection(p: PricedPlace, sel: PriceSelection, custom?: { min: number | null; max: number | null }): boolean {
  if (sel === 'all') return true;
  if (sel === 'free') return placeIsFree(p);
  const b = selectionBounds(sel, custom);
  return priceInRange(p, b.min, b.max);
}

/** Effective lowest price for the price-asc sort (free = 0, unknown = +∞). */
export function effectiveMinPrice(p: PricedPlace): number {
  if (placeIsFree(p)) return 0;
  if (p.priceMin != null) return p.priceMin;
  if (p.priceMax != null) return p.priceMax;
  return Number.POSITIVE_INFINITY;
}
