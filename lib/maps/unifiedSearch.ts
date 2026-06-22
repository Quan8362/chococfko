// ============================================================
// Unified map search — PURE, testable core (Map UX Phase 7).
//
// Separates four clearly-labeled result groups, INTERNAL FIRST:
//   1. internal      — Chợ Cóc FKO editorial places (primary, always).
//   2. station_area  — stations / geographic areas (derived from the catalog).
//   3. topic         — categories / search concepts (facets).
//   4. google        — external Google places (CLIENT-ONLY, flag-gated, never
//                      produced here; this module only decides WHEN to offer it).
//
// Internal multilingual coverage is achieved WITHOUT inventing schema: it reuses
// `normalizeText` (NFKD: full-width→half-width, strips Latin/VI diacritics) and
// the SearchConfig category synonyms (which already contain vi/en/ja/ko/zh terms)
// + localized tag names + the structured area/station/address fields. There is no
// dedicated "japaneseName"/"altName"/per-language keyword column in `Place`; those
// are represented by the place `name`, localized `tags`, and category synonyms.
//
// Matching contract: word-boundary for Latin tokens (so "an" ⊄ "tenmangu"),
// substring for CJK (no word separators). AND across query tokens.
// ============================================================

import type { Place } from '../places.ts';
import { normalizeText, tokenize, type SearchConfig, DEFAULT_SEARCH_CONFIG } from '../placeSearch.ts';

export type ResultGroupKind = 'internal' | 'station_area' | 'topic' | 'google';

export interface InternalResultItem {
  kind: 'internal';
  slug: string;
  name: string;
  categoryCode: string;
  categoryLabel: string;
  area: string;
  nearestStation: string | null;
  img: string | null;
  /** False for the many prod rows with NULL lat/lng — still searchable & shown. */
  hasCoordinates: boolean;
  lat: number | null;
  lng: number | null;
  score: number;
}

export interface StationAreaResultItem {
  kind: 'station_area';
  type: 'station' | 'area';
  label: string;
  /** Normalized key (stable de-dupe / selection). */
  key: string;
  /** How many published places reference this station/area. */
  count: number;
}

export interface TopicResultItem {
  kind: 'topic';
  topicType: 'category' | 'concept';
  code: string;
  label: string;
  count: number;
}

/** A topic definition the route feeds in (labels come from i18n on the server). */
export interface TopicDef {
  topicType: 'category' | 'concept';
  code: string;
  label: string;
  /** Space-joined aliases (already includes vi/en/ja/ko/zh terms). */
  aliases: string;
  count: number;
}

export interface UnifiedInternalResponse {
  internal: InternalResultItem[];
  stationAreas: StationAreaResultItem[];
  topics: TopicResultItem[];
  /** Total internal place matches BEFORE the display cap (drives external offer). */
  internalTotal: number;
  /** Whether the UI should offer external Google results, and why. */
  offerExternal: boolean;
  externalReason: ExternalOfferReason;
}

export type ExternalOfferReason = 'none' | 'insufficient_internal' | 'explicit';

export const MIN_QUERY_CHARS = 2;
/** Below this many internal matches, external search is offered (not auto-run). */
export const SUFFICIENT_INTERNAL = 4;
const DEFAULT_INTERNAL_LIMIT = 12;
const DEFAULT_GROUP_LIMIT = 6;

// ── normalized field index ───────────────────────────────────────────────────
interface Idx { raw: string; padded: string }
function idx(text: string | null | undefined): Idx {
  const raw = normalizeText(text ?? '');
  return { raw, padded: ` ${tokenize(raw).join(' ')} ` };
}

/** Does a single query token hit a field? Boundary for Latin, substring for CJK. */
function tokenHit(fi: Idx, tok: string): boolean {
  if (/^[a-z0-9]+$/.test(tok)) {
    if (fi.padded.includes(` ${tok} `)) return true;
    if (tok.endsWith('s') && tok.length >= 4 && fi.padded.includes(` ${tok.slice(0, -1)} `)) return true; // parks→park
    if (tok.length >= 3 && fi.padded.includes(` ${tok}s `)) return true; // park→parks
    return false;
  }
  return fi.raw.length > 0 && fi.raw.includes(tok);
}

/** Normalized query tokens (drops empties). */
export function queryTokens(q: string): string[] {
  return tokenize(normalizeText(q)).filter(Boolean);
}

function tagText(p: Place): string {
  return (p.tags ?? [])
    .map((tg) => [tg.name, tg.display_name_vi, tg.display_name_en, tg.display_name_ja, tg.display_name_ko, tg.display_name_zh].filter(Boolean).join(' '))
    .join(' ');
}

// Field weights (higher = stronger signal).
const W_NAME = 8;
const W_TAG = 6;
const W_LABEL = 5;
const W_SYNONYM = 5;
const W_STATION = 4;
const W_AREA = 3;
const W_ADDRESS = 2;
const W_DESC = 2;

/**
 * Relevance of a place to the query tokens. null = at least one token matched no
 * field (AND fail → not a result). Each token takes its STRONGEST field hit.
 * Covers: title, localized tags, category label, category synonyms (multilingual
 * keywords), area/structured-area, nearest station, address, description.
 */
export function scoreInternalPlace(p: Place, tokens: string[], config: SearchConfig = DEFAULT_SEARCH_CONFIG): number | null {
  if (!tokens.length) return null;
  const name = idx(p.name);
  const tags = idx(tagText(p));
  const label = idx(p.categoryLabel);
  const syn = idx(config.categories[p.category] ?? '');
  const station = idx(p.nearestStation);
  const area = idx([p.area, p.areaMain, p.nearbyPlace, p.cityOrPrefecture, p.city, p.prefecture].filter(Boolean).join(' '));
  const address = idx(p.address);
  const desc = idx(p.desc);

  let score = 0;
  for (const tok of tokens) {
    let best = 0;
    if (tokenHit(name, tok)) best = W_NAME;
    if (best < W_TAG && tokenHit(tags, tok)) best = W_TAG;
    if (best < W_LABEL && tokenHit(label, tok)) best = W_LABEL;
    if (best < W_SYNONYM && tokenHit(syn, tok)) best = W_SYNONYM;
    if (best < W_STATION && tokenHit(station, tok)) best = W_STATION;
    if (best < W_AREA && tokenHit(area, tok)) best = W_AREA;
    if (best < W_ADDRESS && tokenHit(address, tok)) best = W_ADDRESS;
    if (best < W_DESC && tokenHit(desc, tok)) best = W_DESC;
    if (best === 0) return null;
    score += best;
  }
  return score;
}

function placeToInternal(p: Place, score: number): InternalResultItem {
  const hasCoords = typeof p.lat === 'number' && typeof p.lng === 'number' && Number.isFinite(p.lat) && Number.isFinite(p.lng);
  return {
    kind: 'internal',
    slug: p.slug,
    name: p.name,
    categoryCode: p.category,
    categoryLabel: p.categoryLabel,
    area: p.area,
    nearestStation: p.nearestStation ?? null,
    img: p.img || p.imgFallback || null,
    hasCoordinates: hasCoords,
    lat: hasCoords ? (p.lat as number) : null,
    lng: hasCoords ? (p.lng as number) : null,
    score,
  };
}

/** Rank internal places for a query. Returns ALL matches (caller may cap). */
export function searchInternalPlaces(places: Place[], q: string, config: SearchConfig = DEFAULT_SEARCH_CONFIG): InternalResultItem[] {
  const tokens = queryTokens(q);
  if (!tokens.length) return [];
  const scored: InternalResultItem[] = [];
  places.forEach((p) => {
    if (p.searchEligible === false) return;
    const s = scoreInternalPlace(p, tokens, config);
    if (s != null) scored.push(placeToInternal(p, s));
  });
  // Stable: higher score first, then keep input order (push order preserved).
  return scored.sort((a, b) => b.score - a.score);
}

/** Distinct stations & areas whose name matches the query, with place counts. */
export function extractStationAreas(places: Place[], q: string, limit = DEFAULT_GROUP_LIMIT): StationAreaResultItem[] {
  const tokens = queryTokens(q);
  if (!tokens.length) return [];
  const stations = new Map<string, { label: string; count: number }>();
  const areas = new Map<string, { label: string; count: number }>();
  for (const p of places) {
    if (p.searchEligible === false) continue;
    const st = p.nearestStation?.trim();
    if (st) {
      const k = normalizeText(st);
      const cur = stations.get(k) ?? { label: st, count: 0 };
      cur.count += 1;
      stations.set(k, cur);
    }
    const ar = (p.areaMain?.trim() || p.area?.trim());
    if (ar) {
      const k = normalizeText(ar);
      const cur = areas.get(k) ?? { label: ar, count: 0 };
      cur.count += 1;
      areas.set(k, cur);
    }
  }
  const out: StationAreaResultItem[] = [];
  const matches = (key: string) => { const fi = idx(key); return tokens.every((t) => tokenHit(fi, t)); };
  for (const [key, v] of Array.from(stations)) if (matches(key)) out.push({ kind: 'station_area', type: 'station', label: v.label, key, count: v.count });
  for (const [key, v] of Array.from(areas)) if (matches(key)) out.push({ kind: 'station_area', type: 'area', label: v.label, key, count: v.count });
  return out.sort((a, b) => b.count - a.count).slice(0, limit);
}

/** Topics (categories / concepts) whose aliases or label match the query. */
export function extractTopics(q: string, defs: TopicDef[], limit = DEFAULT_GROUP_LIMIT): TopicResultItem[] {
  const tokens = queryTokens(q);
  if (!tokens.length) return [];
  const out: TopicResultItem[] = [];
  for (const d of defs) {
    const fi = idx(`${d.aliases} ${d.label}`);
    // A topic matches if ANY query token hits its aliases/label (intent is loose).
    if (tokens.some((t) => tokenHit(fi, t))) {
      out.push({ kind: 'topic', topicType: d.topicType, code: d.code, label: d.label, count: d.count });
    }
  }
  return out.sort((a, b) => b.count - a.count).slice(0, limit);
}

/**
 * Decide whether to OFFER external Google results. Never auto-runs Google: this
 * only governs whether the UI surfaces the "search Google" affordance.
 */
export function shouldOfferExternalSearch(opts: {
  internalTotal: number;
  queryLength: number;
  explicit?: boolean;
  externalEnabled: boolean;
  minChars?: number;
  sufficient?: number;
}): { offer: boolean; reason: ExternalOfferReason } {
  const minChars = opts.minChars ?? MIN_QUERY_CHARS;
  if (!opts.externalEnabled || opts.queryLength < minChars) return { offer: false, reason: 'none' };
  if (opts.explicit) return { offer: true, reason: 'explicit' };
  if (opts.internalTotal < (opts.sufficient ?? SUFFICIENT_INTERNAL)) return { offer: true, reason: 'insufficient_internal' };
  return { offer: false, reason: 'none' };
}

/** Assemble the internal-only response the search API returns (Google excluded). */
export function buildInternalResponse(
  places: Place[],
  q: string,
  topicDefs: TopicDef[],
  opts: { externalEnabled?: boolean; internalLimit?: number; groupLimit?: number; config?: SearchConfig } = {},
): UnifiedInternalResponse {
  const config = opts.config ?? DEFAULT_SEARCH_CONFIG;
  const all = searchInternalPlaces(places, q, config);
  const internal = all.slice(0, opts.internalLimit ?? DEFAULT_INTERNAL_LIMIT);
  const stationAreas = extractStationAreas(places, q, opts.groupLimit ?? DEFAULT_GROUP_LIMIT);
  const topics = extractTopics(q, topicDefs, opts.groupLimit ?? DEFAULT_GROUP_LIMIT);
  const { offer, reason } = shouldOfferExternalSearch({
    internalTotal: all.length,
    queryLength: normalizeText(q).length,
    externalEnabled: !!opts.externalEnabled,
  });
  return { internal, stationAreas, topics, internalTotal: all.length, offerExternal: offer, externalReason: reason };
}
