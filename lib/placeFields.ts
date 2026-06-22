// ============================================================
// Explore Platform Phase 1 — pure helpers for structured place data.
//
// Validation, normalization, option lists, and category-aware field
// relevance for the new `places` columns (price / hours / actions /
// suitability / verification). PURE & dependency-free so it is unit-
// testable with `node --test` and reusable by admin actions + UI.
// ============================================================

// ── Option lists (single source of truth; mirrored by DB CHECK + Admin) ──
export const PRICE_TYPES = ['free', 'paid', 'varies'] as const;
export const TEMPORARY_STATUSES = ['open', 'temporarily_closed', 'permanently_closed'] as const;
export const PARKING_OPTIONS = ['none', 'free', 'paid', 'nearby'] as const;
export const INDOOR_OUTDOOR_OPTIONS = ['indoor', 'outdoor', 'both'] as const;
export const SMOKING_OPTIONS = ['no_smoking', 'smoking_allowed', 'separated'] as const;
export const TATTOO_OPTIONS = ['allowed', 'not_allowed', 'covered_ok'] as const;
export const PET_OPTIONS = ['allowed', 'not_allowed', 'leashed_ok', 'outdoor_only'] as const;
export const CROWD_LEVELS = ['low', 'medium', 'high'] as const;
export const VERIFICATION_STATUSES = ['unverified', 'community', 'verified'] as const;
export const PAYMENT_METHODS = ['cash', 'credit_card', 'ic_card', 'qr', 'paypay'] as const;
export const PLACE_LANGUAGES = ['ja', 'en', 'vi', 'ko', 'zh'] as const;
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
/** Day keys allowed inside opening_hours JSON (weekdays + public holiday). */
export const HOURS_DAY_KEYS = [...WEEKDAYS, 'ph'] as const;

export type PriceType = (typeof PRICE_TYPES)[number];

// ── URL validation / normalization ──────────────────────────────────
/**
 * Normalize a user-entered URL to an absolute http(s) URL, or null if it
 * cannot be a real web link. Adds `https://` to bare domains ("foo.com").
 * Never throws.
 */
export function normalizeUrl(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  let candidate = s;
  if (!/^https?:\/\//i.test(candidate)) {
    // Only assume a scheme for things that look like a domain (has a dot).
    if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(candidate)) candidate = `https://${candidate}`;
    else return null;
  }
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function isValidHttpUrl(raw: string | null | undefined): boolean {
  return normalizeUrl(raw) !== null;
}

// ── Phone normalization (Japan-aware; preserves original display) ───
/**
 * Keep the original display format untouched; compute an E.164 form when
 * derivable (Japan domestic `0XX…` → `+81…`, or an explicit `+…`/`81…`).
 * Returns nulls for empty input. Never throws.
 */
export function normalizePhone(raw: string | null | undefined): { display: string | null; e164: string | null } {
  const display = (raw ?? '').trim();
  if (!display) return { display: null, e164: null };
  const cleaned = display.replace(/[^\d+]/g, '');
  let e164: string | null = null;
  if (cleaned.startsWith('+')) {
    const digits = cleaned.slice(1).replace(/\D/g, '');
    if (digits.length >= 8 && digits.length <= 15) e164 = `+${digits}`;
  } else {
    const digits = cleaned.replace(/\D/g, '');
    if (digits.startsWith('81') && digits.length >= 11 && digits.length <= 12) {
      e164 = `+${digits}`;
    } else if (digits.startsWith('0') && digits.length >= 10 && digits.length <= 11) {
      e164 = `+81${digits.slice(1)}`;
    }
  }
  return { display, e164 };
}

// ── Coordinate validation ───────────────────────────────────────────
// Canonical coordinate model lives in ./coordinates. Re-exported here so the
// many existing importers (admin action, dataQuality, tests) keep working while
// there is ONE source of truth for what a valid lat/lng is.
export { isValidCoordinate, isInJapanBounds, coordinateWarnings } from './coordinates.ts';
import { coordinateWarnings } from './coordinates.ts';

// ── Price range validation ──────────────────────────────────────────
export interface PriceInput {
  priceType?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
}

export function validatePriceRange(input: PriceInput): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const { priceType, priceMin, priceMax } = input;
  if (priceType != null && priceType !== '' && !(PRICE_TYPES as readonly string[]).includes(priceType)) {
    errors.push('price_type_invalid');
  }
  if (priceMin != null && (!Number.isFinite(priceMin) || priceMin < 0)) errors.push('price_min_invalid');
  if (priceMax != null && (!Number.isFinite(priceMax) || priceMax < 0)) errors.push('price_max_invalid');
  if (priceMin != null && priceMax != null && priceMax < priceMin) errors.push('price_range_invalid');
  if (priceType === 'free' && ((priceMin ?? 0) > 0 || (priceMax ?? 0) > 0)) errors.push('price_free_conflict');
  return { ok: errors.length === 0, errors: Array.from(new Set(errors)) };
}

// ── Opening hours validation ────────────────────────────────────────
export function isHHMM(s: unknown): boolean {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export interface HoursValidation { ok: boolean; value: Record<string, unknown> | null; errors: string[] }

/**
 * Validate opening_hours (JSON string or object). Shape:
 *   { mon:[{open:"09:00",close:"18:00"}], ..., ph:[...], notes:"..." }
 * Empty/null → valid with value=null (unknown). Never throws.
 */
export function validateOpeningHours(json: string | Record<string, unknown> | null | undefined): HoursValidation {
  if (json == null || json === '') return { ok: true, value: null, errors: [] };
  let obj: unknown;
  if (typeof json === 'string') {
    try { obj = JSON.parse(json); } catch { return { ok: false, value: null, errors: ['hours_json_invalid'] }; }
  } else {
    obj = json;
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return { ok: false, value: null, errors: ['hours_shape_invalid'] };
  }
  const errors: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (k === 'notes') {
      if (typeof v !== 'string') errors.push('hours_notes_invalid');
      continue;
    }
    if (!(HOURS_DAY_KEYS as readonly string[]).includes(k)) { errors.push('hours_day_invalid'); continue; }
    if (!Array.isArray(v)) { errors.push('hours_day_invalid'); continue; }
    for (const slot of v) {
      const s = slot as { open?: unknown; close?: unknown };
      if (!s || typeof s !== 'object' || !isHHMM(s.open) || !isHHMM(s.close)) errors.push('hours_slot_invalid');
    }
  }
  return { ok: errors.length === 0, value: errors.length ? null : (obj as Record<string, unknown>), errors: Array.from(new Set(errors)) };
}

// ── Japanese phrases validation ─────────────────────────────────────
export interface JapanesePhrase { ja: string; romaji: string; vi: string }
export interface PhrasesValidation { ok: boolean; value: JapanesePhrase[] | null; errors: string[] }

/** Validate japanese_phrases (JSON string or array of {ja,romaji,vi}). */
export function validateJapanesePhrases(json: string | unknown[] | null | undefined): PhrasesValidation {
  if (json == null || json === '') return { ok: true, value: null, errors: [] };
  let arr: unknown;
  if (typeof json === 'string') {
    try { arr = JSON.parse(json); } catch { return { ok: false, value: null, errors: ['phrases_json_invalid'] }; }
  } else {
    arr = json;
  }
  if (!Array.isArray(arr)) return { ok: false, value: null, errors: ['phrases_shape_invalid'] };
  const errors: string[] = [];
  const out: JapanesePhrase[] = [];
  for (const it of arr) {
    const o = it as { ja?: unknown; romaji?: unknown; vi?: unknown };
    if (!o || typeof o !== 'object' || typeof o.ja !== 'string' || !o.ja.trim()) { errors.push('phrase_item_invalid'); continue; }
    out.push({
      ja: o.ja.trim(),
      romaji: typeof o.romaji === 'string' ? o.romaji.trim() : '',
      vi: typeof o.vi === 'string' ? o.vi.trim() : '',
    });
  }
  return { ok: errors.length === 0, value: out.length ? out : null, errors: Array.from(new Set(errors)) };
}

// ── Category-aware optional fields ──────────────────────────────────
// Not every field applies to every category. This drives Admin hints and
// public rendering — it is GUIDANCE, never a hard requirement to publish.
export interface CategoryFieldRelevance {
  price: boolean;
  hours: boolean;
  reservation: boolean;
  kids: boolean;
  tattoo: boolean;
  bbq: boolean;
  camping: boolean;
  pet: boolean;
}

const DINING = ['food', 'viet', 'izakaya', 'japanese', 'thai', 'chinese', 'korean', 'cafe_milk_tea'];

export function categoryFieldRelevance(category: string): CategoryFieldRelevance {
  const isDining = DINING.includes(category);
  return {
    price: true, // any place may have an entry/spend price; admin can leave blank
    hours: isDining || ['grocery', 'onsen', 'kids_playground', 'landmark'].includes(category),
    reservation: isDining || category === 'onsen',
    kids: ['kids_playground', 'park', 'sea', 'landmark', 'camp'].includes(category),
    tattoo: ['onsen', 'sea'].includes(category),
    bbq: ['sea', 'camp', 'park'].includes(category),
    camping: ['camp', 'mountain', 'park'].includes(category),
    pet: ['park', 'sea', 'camp', 'cafe_milk_tea'].includes(category),
  };
}

/**
 * Which Explore filter keys are relevant for a category (drives the filter UI so
 * e.g. restaurant-only filters don't show on parks). Always-on filters apply to
 * every category; the rest are category-aware.
 */
export function relevantFilterKeys(category: string): Set<string> {
  const r = categoryFieldRelevance(category);
  const keys = new Set<string>([
    // universally applicable
    'nearby', 'area', 'station', 'fee', 'priceMin', 'priceMax',
    'verified', 'recentlyUpdated', 'parking', 'wheelchair',
    'indoor', 'outdoor', 'rainy', 'payment', 'lang', 'solo', 'group',
  ]);
  if (r.hours) keys.add('openNow');
  if (r.reservation) { keys.add('reservationAvailable'); keys.add('reservationRequired'); keys.add('smoking'); }
  if (r.kids) keys.add('children');
  if (r.tattoo) keys.add('tattoo');
  if (r.bbq) keys.add('bbq');
  if (r.camping) keys.add('camping');
  return keys;
}

// ── Completeness warnings (non-blocking) ────────────────────────────
export interface CompletenessInput {
  category: string;
  mapUrl?: string | null;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  openingHours?: unknown;
  closedDays?: string[] | null;
  priceType?: string | null;
  fee?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
}

/**
 * Returns warning codes (i18n keys, namespace place_fields.warn) for missing
 * but useful information. NEVER blocks publishing — purely advisory.
 */
export function placeCompletenessWarnings(p: CompletenessInput): string[] {
  const rel = categoryFieldRelevance(p.category);

  // Coordinate-related warnings come from the canonical helper (shared with the
  // live Admin field so they can never disagree).
  const warnings: string[] = coordinateWarnings({
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    hasMapUrl: !!p.mapUrl,
    hasAddress: !!p.address?.trim(),
  });

  if (rel.hours) {
    const hasHours =
      (p.openingHours != null && p.openingHours !== '' &&
        !(typeof p.openingHours === 'object' && Object.keys(p.openingHours as object).length === 0)) ||
      (Array.isArray(p.closedDays) && p.closedDays.length > 0);
    if (!hasHours) warnings.push('missing_hours');
  }

  if (rel.price) {
    const hasPrice =
      (p.priceType != null && p.priceType !== '') ||
      (p.fee != null && p.fee !== '') ||
      p.priceMin != null || p.priceMax != null;
    if (!hasPrice) warnings.push('missing_price');
  }

  return warnings;
}

// ── Form helpers (admin server action) ──────────────────────────────
/** Parse an integer form value to a non-negative number or null. */
export function parseIntOrNull(raw: FormDataEntryValue | null): number | null {
  const s = (raw ?? '').toString().trim();
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/** Coerce a checkbox/tristate form value ('true'|'false'|'') → boolean|null. */
export function parseTriState(raw: FormDataEntryValue | null): boolean | null {
  const s = (raw ?? '').toString().trim();
  if (s === 'true') return true;
  if (s === 'false') return false;
  return null;
}

/** Parse a comma/newline separated list into a trimmed string[] (or null). */
export function parseList(raw: FormDataEntryValue | null): string[] | null {
  const s = (raw ?? '').toString();
  const arr = s.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
  return arr.length ? Array.from(new Set(arr)) : null;
}

/** Restrict a form value to an allowed option list (else null). */
export function parseEnum(raw: FormDataEntryValue | null, options: readonly string[]): string | null {
  const s = (raw ?? '').toString().trim();
  return s && options.includes(s) ? s : null;
}

/** Keep only allowed values from a multi-select set of form values. */
export function parseEnumList(raws: FormDataEntryValue[], options: readonly string[]): string[] | null {
  const set = raws.map((r) => r.toString().trim()).filter((s) => options.includes(s));
  return set.length ? Array.from(new Set(set)) : null;
}
