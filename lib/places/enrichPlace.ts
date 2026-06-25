// ============================================================
// Shared place-enrichment orchestrator — the SINGLE entry point used by the
// backfill script, the cron job, and the on-create hook (no duplicated logic).
//
// HARD RULE: this only ever runs in the enrichment job context (script / cron /
// server action) — NEVER during a user page render. The app reads attributes
// exclusively from Supabase columns; Google is touched only here.
//
// Flow: resolve the Google place ID (reusing provider_place_id when present, else
// Text Search with a confidence gate) → fetch Place Details (New) → map to a
// positive-only proposal → apply with manual/legacy write-protection → persist.
// ============================================================

import {
  mapGoogleToProposal, applyEnrichment, matchConfidence, googleDisplayName,
  type CurrentRow,
} from './googleEnrich.ts';
import { fetchPlaceDetails, textSearchPlaces, resolveApiKey } from './googlePlacesClient.ts';

/** Columns the orchestrator needs to read to map + protect correctly. */
export const ENRICH_SELECT_COLUMNS = [
  'slug', 'name', 'lat', 'lng', 'address', 'location_provider', 'provider_place_id',
  'fee', 'price_type', 'price_min', 'price_max', 'currency',
  'opening_hours', 'parking', 'indoor_outdoor', 'rainy_day_ok',
  'reservation_recommended', 'good_for_children',
  'pet_policy', 'serves_vegetarian',
  'field_sources', 'google_enrichment',
].join(', ');

export interface EnrichRow extends CurrentRow {
  slug: string;
  name: string;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  location_provider?: string | null;
  provider_place_id?: string | null;
}

export type EnrichStatus =
  | 'enriched' | 'no_changes' | 'needs_place_id' | 'low_confidence'
  | 'no_api_key' | 'not_found' | 'dup_place_id' | 'error';

export interface EnrichResult {
  slug: string;
  status: EnrichStatus;
  placeId: string | null;
  resolvedBySearch: boolean;
  confidence: number | null;
  lowConfidence: boolean;
  matchReason: string | null;
  matchedName: string | null;
  changedKeys: string[];
  protectedKeys: string[];
  /** Per-column before→after, for the --dry-run diff. */
  diff: Record<string, { from: unknown; to: unknown }>;
  error?: string;
}

// Minimal structural type so this works with both @supabase/supabase-js (script)
// and the app's admin client (server action / cron). ONE interface (not an
// intersection) so .from() exposes both update + select without overload narrowing.
interface PostgrestResult { error: { message: string; code?: string } | null }
export interface SupabaseLike {
  from(table: string): {
    update(values: Record<string, unknown>): { eq(column: string, value: unknown): PromiseLike<PostgrestResult> };
    select(columns: string): { eq(column: string, value: unknown): { maybeSingle(): PromiseLike<{ data: unknown; error: unknown }> } };
  };
}

export interface EnrichOptions {
  apiKey?: string | null;
  /** Re-fetch + write opening hours only (weekly cron / --refresh-hours). */
  refreshHoursOnly?: boolean;
  /** Compute the diff but write nothing. */
  dryRun?: boolean;
  /** Max km a Text Search result may sit from a known coordinate before low-confidence. */
  maxDistanceKm?: number;
  signal?: AbortSignal;
}

function baseResult(slug: string): EnrichResult {
  return {
    slug, status: 'no_changes', placeId: null, resolvedBySearch: false,
    confidence: null, lowConfidence: false, matchReason: null, matchedName: null,
    changedKeys: [], protectedKeys: [], diff: {},
  };
}

/**
 * Enrich one place row. Pure-ish: all DB access goes through `db`; all Google access
 * through the client. Safe to call repeatedly (idempotent) — re-running only
 * refreshes Google/inferred columns and the audit blob, never manual data.
 */
export async function enrichPlace(db: SupabaseLike, row: EnrichRow, opts: EnrichOptions = {}): Promise<EnrichResult> {
  const out = baseResult(row.slug);
  const apiKey = opts.apiKey ?? resolveApiKey();
  if (!apiKey) { out.status = 'no_api_key'; return out; }

  // ── 1. Resolve the Google place ID ──
  let placeId: string | null = null;
  const trusted = row.location_provider === 'google' && !!row.provider_place_id;
  if (trusted) {
    placeId = (row.provider_place_id as string).trim() || null;
    out.confidence = 1;
  } else {
    const query = [row.name, row.address].filter(Boolean).join(' ');
    const results = await textSearchPlaces(query, { apiKey, signal: opts.signal });
    if (!results.length || !results[0].id) { out.status = 'needs_place_id'; return out; }
    const top = results[0];
    const conf = matchConfidence({
      queryName: row.name,
      resultName: top.name,
      queryLatLng: row.lat != null && row.lng != null ? { latitude: row.lat, longitude: row.lng } : null,
      resultLatLng: top.location,
      maxDistanceKm: opts.maxDistanceKm,
    });
    out.confidence = conf.score;
    out.lowConfidence = conf.lowConfidence;
    out.matchReason = conf.reason;
    out.matchedName = top.name;
    out.placeId = top.id;
    if (conf.lowConfidence) {
      // Never auto-trust a fuzzy match — flag for human spot-check, write nothing.
      out.status = 'low_confidence';
      return out;
    }
    placeId = top.id;
    out.resolvedBySearch = true;
  }
  if (!placeId) { out.status = 'needs_place_id'; return out; }
  out.placeId = placeId;

  // ── 2. Fetch Place Details (New) ──
  const details = await fetchPlaceDetails(placeId, { apiKey, signal: opts.signal });
  if (!details) { out.status = 'not_found'; return out; }
  out.matchedName = out.matchedName ?? googleDisplayName(details);

  // ── 3. Map (positive-only) + 4. apply (write-protected) ──
  const proposal = mapGoogleToProposal(details, { hoursOnly: opts.refreshHoursOnly });
  const applied = applyEnrichment(row, proposal);
  out.changedKeys = applied.changedKeys;
  out.protectedKeys = applied.protectedKeys;
  for (const k of applied.changedKeys) out.diff[k] = { from: row[k] ?? null, to: applied.update[k] };

  // ── 5. Build the persisted payload (always stamps the audit blob) ──
  // INVARIANT: enrichment NEVER sets verification_status/'verified' (a Google match
  // is not human confirmation — admin-only) and NEVER touches last_human_edit_at
  // (that reflects human edits only, for the "recently updated" filter). Only the
  // mapped attribute columns + the audit/provenance blobs below are written here.
  const nowIso = new Date().toISOString();
  const payload: Record<string, unknown> = {
    ...applied.update,
    field_sources: applied.fieldSources,
    regular_opening_hours: proposal.regularOpeningHours,
    google_enrichment: {
      fetched_at: nowIso,
      place_id: placeId,
      match: {
        display_name: out.matchedName,
        confidence: out.confidence,
        low_confidence: out.lowConfidence,
        reason: out.matchReason,
        resolved_by_search: out.resolvedBySearch,
      },
      raw: {
        primaryType: details.primaryType ?? null,
        types: details.types ?? null,
        priceLevel: details.priceLevel ?? null,
        priceRange: details.priceRange ?? null,
        reservable: details.reservable ?? null,
        parkingOptions: details.parkingOptions ?? null,
        goodForChildren: details.goodForChildren ?? null,
        goodForGroups: details.goodForGroups ?? null,
        paymentOptions: details.paymentOptions ?? null,
        accessibilityOptions: details.accessibilityOptions ?? null,
        allowsDogs: details.allowsDogs ?? null,
        servesVegetarianFood: details.servesVegetarianFood ?? null,
        weekdayDescriptions: details.regularOpeningHours?.weekdayDescriptions ?? null,
      },
    },
  };
  // Persist a freshly-discovered place ID (only when we found it ourselves and the
  // row had none) so future runs are "trusted" and skip Text Search.
  if (out.resolvedBySearch && !row.provider_place_id) {
    payload.provider_place_id = placeId;
    payload.location_provider = 'google';
    const fs = { ...(applied.fieldSources) };
    fs['provider_place_id'] = 'google';
    payload.field_sources = fs;
  }

  out.status = applied.changedKeys.length ? 'enriched' : 'no_changes';

  if (opts.dryRun) return out;

  // ── 6. Persist (idempotent). Retry without provider_place_id on a unique clash. ──
  let { error } = await db.from('places').update(payload).eq('slug', row.slug);
  if (error && /duplicate key|unique|23505/i.test(`${error.code ?? ''} ${error.message}`) && 'provider_place_id' in payload) {
    const retry = { ...payload };
    delete retry.provider_place_id;
    delete retry.location_provider;
    ({ error } = await db.from('places').update(retry).eq('slug', row.slug));
    if (!error) out.status = 'dup_place_id';
  }
  if (error) { out.status = 'error'; out.error = error.message; }
  return out;
}

/**
 * Convenience for the on-create hook (admin form + community submission). Loads the
 * row, runs enrichment, and is fully best-effort: any failure resolves to an
 * 'error' result and NEVER throws, so it can't break a place submission. No Google
 * key → 'no_api_key' no-op. Pass a timeout AbortSignal to bound page latency.
 */
export async function enrichPlaceBySlug(
  db: SupabaseLike,
  slug: string,
  opts: EnrichOptions = {},
): Promise<EnrichResult> {
  const out = baseResult(slug);
  if ((opts.apiKey ?? resolveApiKey()) == null) { out.status = 'no_api_key'; return out; }
  try {
    const { data, error } = await db.from('places').select(ENRICH_SELECT_COLUMNS).eq('slug', slug).maybeSingle();
    if (error || !data) { out.status = 'error'; out.error = error ? String((error as { message?: string }).message ?? error) : 'not_found'; return out; }
    return await enrichPlace(db, data as EnrichRow, opts);
  } catch (err) {
    out.status = 'error';
    out.error = (err as Error).message;
    return out;
  }
}
