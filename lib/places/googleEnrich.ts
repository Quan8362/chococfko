// ============================================================
// Google Places API (New) → Chợ Cóc FKO place columns. PURE / dependency-free,
// so the whole mapping + write-protection contract is unit-testable with
// `node --test` and reused identically by the backfill script, the cron job, and
// the on-create hook (single source of truth — no duplicated logic).
//
// ── CORE PRINCIPLE: conservative, positive-only auto-publish ──────────────────
// A value is written ONLY when Google explicitly asserts it. Unknown/null → we
// write nothing, so the place simply won't appear in that filter and won't show
// that badge. A missing badge is fine; a WRONG badge destroys trust.
//
// ── NEVER overwrite human data ────────────────────────────────────────────────
// applyEnrichment() refuses to touch any column whose field_sources entry is
// 'manual', AND refuses to overwrite a column that already holds a non-null value
// of unknown provenance (legacy admin/community data entered before this system).
// A Google null never erases a real value because we never PROPOSE a null.
// ============================================================

// ── Loosely-typed view of a Place Details (New) response (the fields we mask) ──
export interface GoogleLatLng { latitude?: number; longitude?: number }
export interface GoogleTimePoint { day?: number; hour?: number; minute?: number }
export interface GooglePeriod { open?: GoogleTimePoint; close?: GoogleTimePoint }
export interface GoogleOpeningHours { periods?: GooglePeriod[]; weekdayDescriptions?: string[] }
export interface GoogleMoney { currencyCode?: string; units?: string | number }
export interface GooglePriceRange { startPrice?: GoogleMoney; endPrice?: GoogleMoney }
export interface GoogleParkingOptions {
  freeParkingLot?: boolean; paidParkingLot?: boolean;
  freeStreetParking?: boolean; paidStreetParking?: boolean;
  freeGarageParking?: boolean; paidGarageParking?: boolean;
  valetParking?: boolean;
}
export interface GooglePaymentOptions {
  acceptsCreditCards?: boolean;
  acceptsDebitCards?: boolean;
  acceptsCashOnly?: boolean;
  acceptsNfc?: boolean;
}
export interface GoogleAccessibilityOptions {
  wheelchairAccessibleParking?: boolean;
  wheelchairAccessibleEntrance?: boolean;
  wheelchairAccessibleRestroom?: boolean;
  wheelchairAccessibleSeating?: boolean;
}
export interface GooglePlaceDetails {
  id?: string;
  displayName?: { text?: string; languageCode?: string } | string;
  types?: string[];
  primaryType?: string;
  location?: GoogleLatLng;
  regularOpeningHours?: GoogleOpeningHours;
  currentOpeningHours?: GoogleOpeningHours;
  priceLevel?: string;
  priceRange?: GooglePriceRange;
  reservable?: boolean;
  parkingOptions?: GoogleParkingOptions;
  goodForChildren?: boolean;
  goodForGroups?: boolean;
  paymentOptions?: GooglePaymentOptions;
  accessibilityOptions?: GoogleAccessibilityOptions;
}

/** Provenance marker stored per-column in places.field_sources. */
export type FieldSource = 'manual' | 'google' | 'inferred';

// ── Indoor / outdoor inference map (no Google field exists for this) ──────────
// Single exported lookup so it's trivial to extend. primaryType is checked first,
// then the `types` list. Anything unmapped → leave indoor/outdoor unset (no guess).
export const INDOOR_TYPES: ReadonlySet<string> = new Set([
  'shopping_mall', 'department_store', 'supermarket', 'grocery_store', 'convenience_store',
  'restaurant', 'cafe', 'bakery', 'bar', 'museum', 'aquarium', 'movie_theater', 'library',
  'art_gallery', 'book_store', 'gym', 'spa', 'store',
]);
export const OUTDOOR_TYPES: ReadonlySet<string> = new Set([
  'park', 'national_park', 'beach', 'campground', 'hiking_area', 'tourist_attraction',
  'zoo', 'stadium', 'marina', 'playground',
]);

export function inferIndoorOutdoor(
  primaryType: string | null | undefined,
  types: string[] | null | undefined,
): 'indoor' | 'outdoor' | null {
  const ordered = [primaryType, ...(types ?? [])].filter((t): t is string => !!t);
  for (const t of ordered) {
    if (INDOOR_TYPES.has(t)) return 'indoor';
    if (OUTDOOR_TYPES.has(t)) return 'outdoor';
  }
  return null;
}

// ── Opening hours: Google periods → internal { sun:[{open,close}], ... } shape ─
// Internal convention (see lib/placeOpenNow.ts): a weekday key present with []
// means CLOSED that day; absent key means UNKNOWN. Because Google's
// regularOpeningHours describes the FULL week, we initialize all 7 days to []
// (explicitly closed) and fill the ones that have periods — so a Tuesday-closed
// park correctly reads "closed" rather than "unknown".
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const; // Google day 0=Sun

function pad2(n: number): string { return String(n).padStart(2, '0'); }
function timeStr(t: GoogleTimePoint | undefined): string | null {
  if (!t || typeof t.day !== 'number') return null;
  const h = typeof t.hour === 'number' ? t.hour : 0;
  const m = typeof t.minute === 'number' ? t.minute : 0;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${pad2(h)}:${pad2(m)}`;
}

export type InternalHours = Record<string, { open: string; close: string }[]>;

export function googleHoursToInternal(oh: GoogleOpeningHours | null | undefined): InternalHours | null {
  const periods = oh && Array.isArray(oh.periods) ? oh.periods : null;
  if (!periods || periods.length === 0) return null;

  // 24/7: a single period that opens Sunday 00:00 with no close.
  if (periods.length === 1 && periods[0]?.open && !periods[0].close) {
    const o = periods[0].open;
    if (o.day === 0 && (o.hour ?? 0) === 0 && (o.minute ?? 0) === 0) {
      const all: InternalHours = {};
      for (const k of DAY_KEYS) all[k] = [{ open: '00:00', close: '00:00' }];
      return all;
    }
  }

  const out: InternalHours = { sun: [], mon: [], tue: [], wed: [], thu: [], fri: [], sat: [] };
  let any = false;
  for (const p of periods) {
    const open = p?.open;
    if (!open || typeof open.day !== 'number' || open.day < 0 || open.day > 6) continue;
    const dayKey = DAY_KEYS[open.day];
    const openStr = timeStr(open);
    if (openStr === null) continue;
    if (!p.close) {
      // Open with no close on a specific day → treat as open all day (00:00–00:00
      // wrap = always open in isOpenNow).
      out[dayKey].push({ open: '00:00', close: '00:00' });
      any = true;
      continue;
    }
    const closeStr = timeStr(p.close);
    if (closeStr === null) continue;
    // close on a later day (overnight) → store close time-of-day; close <= open is
    // interpreted as a past-midnight wrap by isOpenNow / openStatus.
    out[dayKey].push({ open: openStr, close: closeStr });
    any = true;
  }
  return any ? out : null;
}

// ── Tiered attribute mapping ──────────────────────────────────────────────────
export interface EnrichmentProposal {
  /** Column → value to write (live columns the filters/badges read). */
  updates: Record<string, unknown>;
  /** Column → provenance for the proposed value. */
  sources: Record<string, FieldSource>;
  /** Raw Google regularOpeningHours (stored in regular_opening_hours for audit). */
  regularOpeningHours: GoogleOpeningHours | null;
}

function parseUnits(m: GoogleMoney | undefined): number | null {
  if (!m || m.units == null) return null;
  const n = typeof m.units === 'string' ? Number.parseInt(m.units, 10) : Math.round(m.units);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Map a Google Place Details response → proposed column writes, honoring the
 * positive-only rule. Returns ONLY columns for which Google gave an explicit
 * positive/known signal. `hoursOnly` restricts the proposal to opening hours
 * (used by --refresh-hours / the weekly cron).
 */
export function mapGoogleToProposal(
  g: GooglePlaceDetails,
  opts: { hoursOnly?: boolean } = {},
): EnrichmentProposal {
  const updates: Record<string, unknown> = {};
  const sources: Record<string, FieldSource> = {};
  const set = (col: string, val: unknown, src: FieldSource) => { updates[col] = val; sources[col] = src; };

  // ── Tier A: opening hours (objective) ──
  const internal = googleHoursToInternal(g.regularOpeningHours);
  if (internal) set('opening_hours', internal, 'google');

  if (opts.hoursOnly) {
    return { updates, sources, regularOpeningHours: g.regularOpeningHours ?? null };
  }

  // ── Tier A: parking (objective) ──
  const pk = g.parkingOptions;
  if (pk && typeof pk === 'object') {
    const hasFree = !!(pk.freeParkingLot || pk.freeStreetParking || pk.freeGarageParking);
    const hasPaid = !!(pk.paidParkingLot || pk.paidStreetParking || pk.paidGarageParking || pk.valetParking);
    if (hasFree) set('parking', 'free', 'google');
    else if (hasPaid) set('parking', 'paid', 'google');
    // all-false object → ambiguous → leave unset
  }

  // ── Tier A: reservable (mirror, positive only) ──
  if (g.reservable === true) set('reservation_recommended', true, 'google');

  // ── Tier A: family-friendly (positive only) ──
  if (g.goodForChildren === true) set('good_for_children', true, 'google');

  // ── Tier A: good for groups (mirror, positive only) ──
  if (g.goodForGroups === true) set('good_for_groups', true, 'google');

  // ── Tier A: wheelchair access (positive only) — true if ANY wheelchair sub-field ──
  const acc = g.accessibilityOptions;
  if (acc && (acc.wheelchairAccessibleParking === true || acc.wheelchairAccessibleEntrance === true ||
    acc.wheelchairAccessibleRestroom === true || acc.wheelchairAccessibleSeating === true)) {
    set('wheelchair_accessible', true, 'google');
  }

  // ── Tier A: payment methods (positive only) → payment_methods text[] ──
  // QR and PayPay have NO field in Google paymentOptions → never enriched here
  // (stay community-sourced). acceptsNfc is the closest Google has to a Japanese
  // IC card (Suica/Pasmo) — an APPROXIMATION, not an exact match.
  const pay = g.paymentOptions;
  if (pay) {
    const methods: string[] = [];
    if (pay.acceptsCreditCards === true) methods.push('credit_card');
    if (pay.acceptsNfc === true) methods.push('ic_card'); // NFC ≈ IC (approximation)
    if (pay.acceptsCashOnly === true) methods.push('cash'); // true = cash accepted; absence ≠ "accepts cash"
    if (methods.length) set('payment_methods', methods, 'google');
  }

  // ── Tier A (inferred): indoor / outdoor + rainy-day OK ──
  const io = inferIndoorOutdoor(g.primaryType, g.types);
  if (io) {
    set('indoor_outdoor', io, 'inferred');
    if (io === 'indoor') set('rainy_day_ok', true, 'inferred'); // indoor ⇒ usable on a rainy day
  }

  // ── Tier B: price (subjective/approximate — positive only) ──
  const pl = g.priceLevel;
  if (pl === 'PRICE_LEVEL_FREE') {
    // Explicit free signal only. We never infer "free" from being a park.
    set('fee', 'free', 'google');
    set('price_type', 'free', 'google');
  } else {
    const range = g.priceRange;
    const startU = parseUnits(range?.startPrice);
    const endU = parseUnits(range?.endPrice);
    const ccy = (range?.endPrice?.currencyCode ?? range?.startPrice?.currencyCode ?? 'JPY').toUpperCase();
    if (ccy === 'JPY' && (startU != null || endU != null)) {
      // Google often reports a placeholder startPrice of ¥0–¥1 ("from cheap"); that
      // is not a real lower bound, so skip it to avoid an ugly "¥1–…" display.
      if (startU != null && startU > 1) set('price_min', startU, 'google');
      if (endU != null) set('price_max', endU, 'google');
      set('price_type', 'paid', 'inferred');
      set('currency', 'JPY', 'google');
    } else if (pl === 'PRICE_LEVEL_INEXPENSIVE') {
      // "Inexpensive" with no numeric range → cap at the ¥3,000 "under" threshold so
      // the under-¥3,000 filter matches. Marked 'inferred' (a derived bound).
      set('price_max', 3000, 'inferred');
      set('price_type', 'paid', 'inferred');
      set('currency', 'JPY', 'inferred');
    }
  }

  return { updates, sources, regularOpeningHours: g.regularOpeningHours ?? null };
}

// ── Write-protection: apply a proposal against the current row ────────────────
export interface CurrentRow {
  field_sources?: Record<string, FieldSource> | null;
  [column: string]: unknown;
}
export interface AppliedEnrichment {
  /** Final columns to UPDATE (already filtered for write-protection). */
  update: Record<string, unknown>;
  /** Merged field_sources to persist alongside the update. */
  fieldSources: Record<string, FieldSource>;
  /** Columns actually changed (for the dry-run diff & summary). */
  changedKeys: string[];
  /** Columns skipped because they are manual/legacy-protected (for the diff). */
  protectedKeys: string[];
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

/**
 * Decide which proposed writes are allowed:
 *   • Skip if field_sources[col] === 'manual' (explicit human override).
 *   • Skip if the column already has a non-null value of UNKNOWN provenance
 *     (legacy admin/community data — never clobber it).
 *   • Allowed when the column is empty, or its current source is 'google'/'inferred'
 *     (safe to refresh our own derived data).
 * A Google null never overwrites: proposals only ever contain positive values.
 */
export function applyEnrichment(row: CurrentRow, proposal: EnrichmentProposal): AppliedEnrichment {
  const existingSources: Record<string, FieldSource> = { ...(row.field_sources ?? {}) };
  const update: Record<string, unknown> = {};
  const newSources: Record<string, FieldSource> = { ...existingSources };
  const changedKeys: string[] = [];
  const protectedKeys: string[] = [];

  for (const [col, val] of Object.entries(proposal.updates)) {
    const curSrc = existingSources[col];
    if (curSrc === 'manual') { protectedKeys.push(col); continue; }
    const curVal = row[col];
    if (!isEmpty(curVal) && curSrc !== 'google' && curSrc !== 'inferred') {
      // Non-null value of unknown provenance = treat as human-entered → protect.
      protectedKeys.push(col);
      continue;
    }
    update[col] = val;
    newSources[col] = proposal.sources[col];
    changedKeys.push(col);
  }

  return { update, fieldSources: newSources, changedKeys, protectedKeys };
}

// ── Place-ID resolution confidence (Text Search top result) ──────────────────
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    // Keep ASCII alphanumerics + CJK/Hangul (so JP/KR/CN names still compare); drop punctuation.
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function nameTokenSet(s: string | null | undefined): string[] {
  if (!s) return [];
  const uniq: string[] = [];
  for (const t of normalizeName(s).split(' ')) {
    if (t.length > 1 && uniq.indexOf(t) === -1) uniq.push(t);
  }
  return uniq;
}

/** Token-overlap (Jaccard) similarity of two place names, 0..1. */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const sa = nameTokenSet(a);
  const sb = nameTokenSet(b);
  if (!sa.length || !sb.length) return 0;
  let inter = 0;
  for (const t of sa) if (sb.indexOf(t) !== -1) inter++;
  return inter / (sa.length + sb.length - inter);
}

/**
 * Containment (overlap) similarity = |intersection| / |smaller set|, 0..1. Unlike
 * Jaccard it is NOT penalized when one name carries extra tokens, so a bilingual
 * DB name like "奈多海岸 / Nata Beach" fully contains Google's "奈多海岸" → 1.0.
 */
export function nameContainment(a: string | null | undefined, b: string | null | undefined): number {
  const sa = nameTokenSet(a);
  const sb = nameTokenSet(b);
  if (!sa.length || !sb.length) return 0;
  let inter = 0;
  for (const t of sa) if (sb.indexOf(t) !== -1) inter++;
  return inter / Math.min(sa.length, sb.length);
}

/** Shared tokens carry STRONG evidence: ≥2 distinct, or one multi-char CJK token. */
function sharedTokens(a: string | null | undefined, b: string | null | undefined): string[] {
  const sb = nameTokenSet(b);
  return nameTokenSet(a).filter((t) => sb.indexOf(t) !== -1);
}
function hasStrongSharedToken(a: string | null | undefined, b: string | null | undefined): boolean {
  const shared = sharedTokens(a, b);
  if (shared.length >= 2) return true;
  // A single shared token only counts when it's a multi-char CJK token — a whole
  // place-name written identically in Japanese/Chinese is strong, language-specific
  // evidence, whereas a lone shared latin word ("asiatico", "mount") is not.
  return shared.some((t) => t.length >= 2 && /[\u3040-\u30ff\u4e00-\u9fff]/.test(t));
}

/** Haversine distance in km (small helper; avoids importing the maps module). */
export function distanceKm(a: GoogleLatLng | null, b: GoogleLatLng | null): number | null {
  if (!a || !b || a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return null;
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const la1 = (a.latitude * Math.PI) / 180;
  const la2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface MatchConfidence {
  score: number;
  lowConfidence: boolean;
  reason: string;
}

/**
 * Score a Text Search top result against the place we were searching for. Flags
 * LOW confidence when the name barely overlaps or the result sits far from a known
 * coordinate — small Vietnamese groceries & common names resolve to the wrong pin,
 * so a low-confidence match must never be auto-trusted for any write.
 */
export function matchConfidence(args: {
  queryName: string;
  resultName: string | null | undefined;
  queryLatLng?: GoogleLatLng | null;
  resultLatLng?: GoogleLatLng | null;
  /** Max km from a known coordinate before the match is considered suspect. */
  maxDistanceKm?: number;
}): MatchConfidence {
  const sim = nameSimilarity(args.queryName, args.resultName);
  const cont = nameContainment(args.queryName, args.resultName);
  const strong = hasStrongSharedToken(args.queryName, args.resultName);
  const nameScore = Math.max(sim, cont);
  const dist = distanceKm(args.queryLatLng ?? null, args.resultLatLng ?? null);
  const maxDist = args.maxDistanceKm ?? 1.0;
  const reasons: string[] = [];
  let low = false;

  // Name evidence: a decent Jaccard, OR strong containment (extra tokens on one
  // side are not penalized) backed by a strong shared token.
  const nameOk = sim >= 0.5 || (cont >= 0.6 && strong);

  if (dist != null) {
    // Coordinate priority: a result very close to a KNOWN coordinate confirms the
    // match even when the name is romaji-vs-Japanese; far away is a hard reject.
    if (dist > maxDist) { low = true; reasons.push(`distance_far(${dist.toFixed(2)}km)`); }
    else if (dist > 0.3 && !nameOk && sim < 0.34) { low = true; reasons.push(`weak_name_mid_distance(name=${nameScore.toFixed(2)},${dist.toFixed(2)}km)`); }
  } else if (!nameOk) {
    low = true;
    reasons.push(`no_coord_and_weak_name(jac=${sim.toFixed(2)},cont=${cont.toFixed(2)})`);
  }
  return {
    score: nameScore,
    lowConfidence: low,
    reason: reasons.length ? reasons.join(', ') : `ok(name=${nameScore.toFixed(2)}${dist != null ? `,dist=${dist.toFixed(2)}km` : ''})`,
  };
}

/** Extract the displayName text from a Google place (string or {text}). */
export function googleDisplayName(g: GooglePlaceDetails): string | null {
  const d = g.displayName;
  if (!d) return null;
  if (typeof d === 'string') return d.trim() || null;
  return (d.text ?? '').trim() || null;
}
