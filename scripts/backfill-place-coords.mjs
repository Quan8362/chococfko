// ============================================================
// One-off: backfill lat/lng for the places that the enrichment matcher left
// unresolved (no stored coordinate). Uses the EXACT Google place_ids captured in
// the enrichment run log, fetches Place Details (location only), and writes
// lat/lng — so a later enrichment run can coordinate-confirm the match.
//
// SAFETY:
//   • Only writes lat/lng (location). Does NOT write provider_place_id or any
//     filter/badge attribute (those go through the normal enrichment dry-run).
//   • Never overwrites an existing coordinate (writes only when lat/lng are null).
//   • SKIPS + flags any pin that resolves OUTSIDE the Fukuoka area — a guard
//     against remaining wrong matches (the catalog is Fukuoka-focused).
//   • The two KNOWN-WRONG matches are excluded entirely and left blank for manual
//     assignment (their place_id was never persisted, so nothing to delete).
//
// Usage:  node scripts/backfill-place-coords.mjs [--dry-run]
// ============================================================
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { fetchPlaceDetails, resolveApiKey, FUKUOKA_BIAS_RECTANGLE } from '../lib/places/googlePlacesClient.ts';
import { googleDisplayName } from '../lib/places/googleEnrich.ts';

const DRY_RUN = process.argv.includes('--dry-run');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Known-wrong matches → exclude; leave coords + place_id blank for manual assignment.
const EXCLUDE = new Set(['kanezakihama', 'imaizumi-yakuin']);

// slug → Google place_id, taken verbatim from the enrichment run log
// (NEEDS HUMAN SPOT-CHECK list). The 2 EXCLUDE slugs are intentionally omitted.
const PLACE_IDS = {
  '39': 'ChIJfV41rkCPQTURFW8HwGzL6a8',
  'au-viet-restaurant': 'ChIJvWtf55eRQTUR2Cz_oZB1dxM',
  'dia-diem-x3sd9': 'ChIJt3zXL38vQTUR6mgCYqpB86A',
  'fukuma-beach': 'ChIJJaWCB9knQjURUPemLdv4Vm4',
  'greenpia-yame': 'ChIJKYeu9UsGQTURo7YdpBjWxT0',
  'itoshima-futamigaura': 'ChIJdZijMN3uQTURZk1DiKqs-Uc',
  'izakaya-fko': 'ChIJATPj3C-RQTURx4Bz_Y2Nhxo',
  'kyushu-geibunkan-chikugo': 'ChIJM7IG0b6tQTUR0idlw9X6LPo',
  'miss-saigon': 'ChIJk0KXZHqPQTURyg0WKmt7AFw',
  'mount-aburayama': 'ChIJW8PHT7GVQTURpyJ7WRydSwc',
  'mount-kaya': 'ChIJqeGkthboQTURLS032upKP4w',
  'mount-raizan': 'ChIJRZzwIN7DQTURJ_snAeaQjjc',
  'mount-tachibana': 'ChIJD1P3EqGIQTURSCt6AAHQ6GA',
  'mount-tenpaizan': 'ChIJo1PYlJiZQTURhd5kIeyxnf8',
  'nakasu-kawabata': 'ChIJiShWTeuRQTURuHO1zkcLEtI',
  'nakasu-yatai': 'ChIJRbuyypWRQTURbITjwMeuLnM',
  'nogita-beach': 'ChIJBx8rd37pQTURb4X67PP6igU',
  'sarakurayama': 'ChIJWYzi9Z_IQzURVEuu_ekNIuc',
  'shikanoshima': 'ChIJRQQmycnyQTURT5IvmNsdSHY',
  'shikanoshima-2': 'ChIJRQQmycnyQTURT5IvmNsdSHY',
  'sk': 'ChIJj3Fqk6ORQTURIwNmq7IVPic',
  'tenjin-daimyo': 'ChIJg_iiv3yRQTURL4TS4RIPzsk',
  'tenjin-yatai': 'ChIJo-IIvI-RQTUR04hr5CDJZNo',
  'tre-xanh': 'ChIJqzSAQGGRQTURnX5m43N-vic',
  'tre-xanh-2-2': 'ChIJ22NSAQCRQTURHcU5bTl0iQQ',
  'vietnam-bistro-asiatico': 'ChIJ52hb0oaRQTUR9-co-J6ev8o',
  'vietnamese-cuisine': 'ChIJjcdL3yaRQTURWSOhi4UQsPw',
  'xin-chao': 'ChIJQcFAo8-TQTURsnUDN-VStyY',
};

const { low, high } = FUKUOKA_BIAS_RECTANGLE;
const inFukuoka = (lat, lng) =>
  lat >= low.latitude && lat <= high.latitude && lng >= low.longitude && lng <= high.longitude;

function loadEnv(path) {
  const out = {};
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* rely on process.env */ }
  return out;
}

const env = { ...loadEnv('.env.local'), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) { console.error('Missing Supabase env'); process.exit(1); }
const apiKey = resolveApiKey(env);
if (!apiKey) { console.error('Missing Google key'); process.exit(1); }
const admin = createClient(url, service, { auth: { persistSession: false } });

async function main() {
  console.log('============================================================');
  console.log(' BACKFILL place lat/lng from logged place_ids');
  console.log(`  mode: ${DRY_RUN ? 'DRY-RUN (no writes)' : 'WRITE'}`);
  console.log(`  excluded (known-wrong, left blank): ${[...EXCLUDE].join(', ')}`);
  console.log('============================================================');

  const summary = { written: 0, skippedHasCoord: 0, outOfArea: 0, noLocation: 0, errors: 0 };
  const outOfArea = [];

  for (const [slug, placeId] of Object.entries(PLACE_IDS)) {
    const { data: row, error: selErr } = await admin
      .from('places').select('slug, lat, lng').eq('slug', slug).maybeSingle();
    if (selErr || !row) { summary.errors++; console.log(`  ✗ ${slug} — row not found`); continue; }
    if (row.lat != null && row.lng != null) {
      summary.skippedHasCoord++;
      console.log(`  · ${slug} — already has coords, skipped`);
      continue;
    }

    const details = await fetchPlaceDetails(placeId, { apiKey });
    await sleep(200);
    const loc = details?.location;
    if (!details || !loc || loc.latitude == null || loc.longitude == null) {
      summary.noLocation++;
      console.log(`  ? ${slug} — no location for ${placeId}`);
      continue;
    }
    const lat = loc.latitude;
    const lng = loc.longitude;
    const name = googleDisplayName(details);

    if (!inFukuoka(lat, lng)) {
      summary.outOfArea++;
      outOfArea.push(`${slug} → "${name}" @ ${lat.toFixed(4)},${lng.toFixed(4)} (place_id=${placeId})`);
      console.log(`  ⚠ ${slug} — OUT OF FUKUOKA "${name}" @ ${lat.toFixed(4)},${lng.toFixed(4)} → skipped (likely wrong match)`);
      continue;
    }

    console.log(`  ✓ ${slug} — "${name}" @ ${lat.toFixed(4)},${lng.toFixed(4)}`);
    if (!DRY_RUN) {
      const { error } = await admin.from('places').update({ lat, lng }).eq('slug', slug);
      if (error) { summary.errors++; console.log(`      WRITE ERROR: ${error.message}`); continue; }
    }
    summary.written++;
  }

  console.log('\n── SUMMARY ─────────────────────────────────────────────');
  console.log(`  coords written        : ${summary.written}${DRY_RUN ? ' (dry-run, not saved)' : ''}`);
  console.log(`  already had coords     : ${summary.skippedHasCoord}`);
  console.log(`  OUT OF FUKUOKA (skip)  : ${summary.outOfArea}`);
  console.log(`  no location            : ${summary.noLocation}`);
  console.log(`  errors                 : ${summary.errors}`);
  if (outOfArea.length) {
    console.log('\n── OUT-OF-AREA (likely wrong match — leave blank, assign manually) ──');
    for (const r of outOfArea) console.log(`  • ${r}`);
  }
  console.log(`\nDone${DRY_RUN ? ' (dry-run)' : ''}.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1); });
