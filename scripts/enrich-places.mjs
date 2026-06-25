// ============================================================
// Backfill: auto-enrich place attributes from Google Places API (New).
//
// Idempotent & re-runnable. Calls Google ONLY here (never at page render). Writes
// to the live filter/badge columns via the SHARED orchestrator lib/places/enrichPlace.ts
// (same logic as the cron + on-create hook). Positive-only: a value is set only
// when Google explicitly asserts it; manual/legacy data is never overwritten.
//
// Usage:
//   node scripts/enrich-places.mjs --dry-run            # fetch + per-place diff, write nothing
//   node scripts/enrich-places.mjs                       # enrich all (skip already-enriched)
//   node scripts/enrich-places.mjs --force               # re-enrich even if already enriched
//   node scripts/enrich-places.mjs --only=canal-city-hakata
//   node scripts/enrich-places.mjs --refresh-hours       # re-fetch opening hours only
//
// Reads creds from .env.local: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY,
// and GOOGLE_PLACES_API_KEY (or GOOGLE_MAPS_SERVER_KEY). No key → graceful no-op.
// ============================================================
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { enrichPlace, ENRICH_SELECT_COLUMNS } from '../lib/places/enrichPlace.ts';
import { resolveApiKey } from '../lib/places/googlePlacesClient.ts';

function loadEnv(path) {
  const out = {};
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env.local → rely on process.env */ }
  return out;
}

const argv = process.argv.slice(2);
const hasFlag = (f) => argv.includes(f);
const getOpt = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const DRY_RUN = hasFlag('--dry-run');
const FORCE = hasFlag('--force');
const REFRESH_HOURS = hasFlag('--refresh-hours');
const ONLY = getOpt('only');

const RATE_LIMIT_MS = Number(getOpt('delay')) || 250; // ~4 req/s, polite
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fileEnv = loadEnv('.env.local');
const env = { ...fileEnv, ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) { console.error('Missing Supabase env in .env.local'); process.exit(1); }

const apiKey = resolveApiKey(env);
const admin = createClient(url, service, { auth: { persistSession: false } });

function shortDiff(diff) {
  return Object.entries(diff)
    .map(([k, v]) => `${k}: ${JSON.stringify(v.from)} → ${JSON.stringify(v.to)}`)
    .join('; ');
}

async function main() {
  console.log('============================================================');
  console.log(' PLACE ENRICHMENT (Google Places API New)');
  console.log(`  mode: ${DRY_RUN ? 'DRY-RUN (no writes)' : 'WRITE'}${REFRESH_HOURS ? ' · hours-only' : ''}${FORCE ? ' · force' : ''}`);
  console.log(`  api key: ${apiKey ? 'configured ✓' : 'MISSING → no-op (set GOOGLE_PLACES_API_KEY)'}`);
  console.log('============================================================');
  if (!apiKey) { console.log('No Google key configured; nothing to do.'); return; }

  // Probe that the enrichment columns exist (migration applied).
  const probe = await admin.from('places').select('google_enrichment').limit(1);
  if (probe.error) {
    console.error('Enrichment columns missing — run supabase/migration_places_google_enrichment.sql first.');
    console.error('  detail:', probe.error.message);
    process.exit(1);
  }

  let query = admin.from('places').select(ENRICH_SELECT_COLUMNS).order('slug', { ascending: true });
  if (ONLY) query = query.eq('slug', ONLY);
  const { data, error } = await query;
  if (error) { console.error('SELECT failed:', error.message); process.exit(1); }
  let rows = data ?? [];
  // Skip already-enriched places unless --force / --refresh-hours / --only.
  if (!FORCE && !REFRESH_HOURS && !ONLY) rows = rows.filter((r) => !r.google_enrichment);

  console.log(`Processing ${rows.length} place(s)…\n`);

  const summary = {
    enriched: 0, noChanges: 0, needsPlaceId: 0, lowConfidence: 0,
    notFound: 0, dupPlaceId: 0, errors: 0,
  };
  const reviewList = [];

  for (const row of rows) {
    let res;
    try {
      res = await enrichPlace(admin, row, { apiKey, refreshHoursOnly: REFRESH_HOURS, dryRun: DRY_RUN });
    } catch (err) {
      summary.errors++;
      console.log(`  ✗ ${row.slug} — EXCEPTION ${(err).message}`);
      await sleep(RATE_LIMIT_MS);
      continue;
    }

    switch (res.status) {
      case 'enriched':
        summary.enriched++;
        console.log(`  ✓ ${row.slug}${res.resolvedBySearch ? ' [resolved via search]' : ''} — ${shortDiff(res.diff) || '(metadata only)'}`);
        break;
      case 'no_changes':
        summary.noChanges++;
        console.log(`  · ${row.slug} — no new attributes (Google null/unknown)`);
        break;
      case 'needs_place_id':
        summary.needsPlaceId++;
        reviewList.push(`${row.slug} — no Text Search result (needs manual place_id)`);
        console.log(`  ? ${row.slug} — needs place_id (no search result)`);
        break;
      case 'low_confidence':
        summary.lowConfidence++;
        reviewList.push(`${row.slug} — low-confidence match "${res.matchedName}" (${res.matchReason}); place_id=${res.placeId}`);
        console.log(`  ⚠ ${row.slug} — LOW CONFIDENCE "${res.matchedName}" (${res.matchReason}) → skipped, needs review`);
        break;
      case 'not_found':
        summary.notFound++;
        reviewList.push(`${row.slug} — place_id ${res.placeId} returned no details`);
        console.log(`  ? ${row.slug} — details not found for ${res.placeId}`);
        break;
      case 'dup_place_id':
        summary.dupPlaceId++;
        console.log(`  ✓ ${row.slug} — enriched (duplicate place_id NOT persisted)`);
        break;
      case 'error':
        summary.errors++;
        console.log(`  ✗ ${row.slug} — WRITE ERROR ${res.error}`);
        break;
      default:
        console.log(`  · ${row.slug} — ${res.status}`);
    }
    await sleep(RATE_LIMIT_MS);
  }

  console.log('\n── SUMMARY ─────────────────────────────────────────────');
  console.log(`  enriched              : ${summary.enriched}`);
  console.log(`  no new attributes     : ${summary.noChanges}`);
  console.log(`  needs place_id review : ${summary.needsPlaceId}`);
  console.log(`  low-confidence matches: ${summary.lowConfidence}`);
  console.log(`  details not found     : ${summary.notFound}`);
  console.log(`  duplicate place_id    : ${summary.dupPlaceId}`);
  console.log(`  errors                : ${summary.errors}`);
  if (reviewList.length) {
    console.log('\n── NEEDS HUMAN SPOT-CHECK ──────────────────────────────');
    for (const r of reviewList) console.log(`  • ${r}`);
  }
  console.log(`\nDone${DRY_RUN ? ' (dry-run — no data modified)' : ''}.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1); });
