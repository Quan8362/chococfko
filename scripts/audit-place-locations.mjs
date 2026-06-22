// ============================================================
// READ-ONLY location data audit (Map UX Phase 4).
//
// Reports coordinate / provider data-quality over the `places` table. Makes only
// SELECT calls — never writes, never runs DDL, never prints credentials. Safe to
// run against production. Degrades gracefully if the Phase-4 columns are not yet
// applied (skips provider checks and says so).
//
// Usage:  node scripts/audit-place-locations.mjs
// Reads Supabase creds from .env.local (NEXT_PUBLIC_SUPABASE_URL + service role).
// ============================================================
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import {
  auditPlaceLocations, findDuplicateProviderPlaceIds, findDuplicateCoordinates,
  normalizePlaceLocation, isSuspiciousCoordinate, buildManualReviewList,
} from '../lib/placeLocation.ts'
import { isValidCoordinate, isInJapanBounds } from '../lib/coordinates.ts'

function loadEnv(path) {
  const out = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m) out[m[1]] = m[2]
  }
  return out
}

const env = loadEnv('.env.local')
const url = env.NEXT_PUBLIC_SUPABASE_URL
const service = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !service) { console.error('Missing Supabase env in .env.local'); process.exit(1) }
const admin = createClient(url, service, { auth: { persistSession: false } })

const PHASE4_COLS = 'location_provider, provider_place_id, provider_formatted_address, provider_maps_url, location_source, location_manually_adjusted, location_confirmed_at, country_code'
const BASE_COLS = 'slug, name, status, lat, lng, address, map_url'

async function main() {
  // Detect whether the Phase-4 columns exist yet.
  let hasPhase4 = true
  const probe = await admin.from('places').select('provider_place_id').limit(1)
  if (probe.error) hasPhase4 = false

  const cols = hasPhase4 ? `${BASE_COLS}, ${PHASE4_COLS}` : BASE_COLS
  const { data, error } = await admin.from('places').select(cols).order('slug', { ascending: true })
  if (error) { console.error('SELECT failed:', error.message); process.exit(1) }
  const rows = data ?? []

  console.log('============================================================')
  console.log(' PLACE LOCATION AUDIT (read-only)')
  console.log(` Phase-4 columns present: ${hasPhase4 ? 'YES' : 'NO (run migration_places_location_provider.sql)'}`)
  console.log('============================================================')

  const c = auditPlaceLocations(rows)
  const line = (label, n) => console.log(`  ${String(label).padEnd(42)} ${n}`)
  line('total places', c.total)
  line('published (approved / null status)', c.published)
  line('draft / pending', c.draft)
  line('valid coordinates', c.validCoordinates)
  line('missing coordinates', c.missingCoordinates)
  line('invalid coordinate range', c.invalidRange)
  line('incomplete pair (lat XOR lng) ⚠ disagree', c.incompletePair)
  line('suspicious (0,0) "null island"', c.suspiciousZero)
  line('valid coords OUTSIDE Japan bounds', c.outsideJapan)
  line('PUBLISHED but missing coordinates', c.publishedMissingCoordinates)
  line('has address but NO coordinates', c.addressButNoCoordinates)
  line('has coordinates but NO address', c.coordinatesButNoAddress)

  // Duplicate provider place IDs (what the unique index forbids).
  if (hasPhase4) {
    const dupIds = findDuplicateProviderPlaceIds(rows)
    line('duplicate provider place IDs', dupIds.length)
    for (const g of dupIds) console.log(`     ! ${g.key} → ${g.rows.map((r) => r.slug).join(', ')}`)
  } else {
    line('duplicate provider place IDs', 'n/a (no column)')
  }

  // Duplicate coordinates (likely duplicate pins).
  const dupCoords = findDuplicateCoordinates(rows)
  line('duplicate coordinate groups', dupCoords.length)
  for (const g of dupCoords) console.log(`     ! ${g.key} → ${g.rows.map((r) => r.slug).join(', ')}`)

  // Detail lists for the actionable problem classes.
  const problems = rows.filter((r) => {
    const loc = normalizePlaceLocation(r)
    return (loc.hasValidCoordinates && (!isInJapanBounds(loc.lat, loc.lng) || isSuspiciousCoordinate(loc.lat, loc.lng)))
  })
  if (problems.length) {
    console.log('\n  Suspicious / out-of-Japan rows:')
    for (const r of problems) console.log(`     - ${r.slug}: ${r.lat},${r.lng}`)
  }

  // Sanity: any row where lat/lng present but not a finite valid pair.
  const badRange = rows.filter((r) => {
    const latSet = r.lat !== null && r.lat !== undefined
    const lngSet = r.lng !== null && r.lng !== undefined
    return (latSet || lngSet) && !isValidCoordinate(r.lat, r.lng) &&
      !((latSet) !== (lngSet)) // exclude incomplete pairs (counted separately)
  })
  if (badRange.length) {
    console.log('\n  Out-of-range coordinate rows:')
    for (const r of badRange) console.log(`     - ${r.slug}: ${r.lat},${r.lng}`)
  }

  // Manual-review list — TRUE anomalies needing a human decision (never auto-fixed).
  const review = buildManualReviewList(rows)
  console.log('\n  ── MANUAL-REVIEW LIST (anomalies, human decision required) ──')
  if (!review.length) {
    console.log('     none — no records require manual review ✓')
  } else {
    for (const r of review) console.log(`     - ${r.slug} [${r.reasons.join(', ')}] ${r.lat ?? '—'},${r.lng ?? '—'}`)
  }

  // Data-entry backlog (expected, NOT an anomaly): published rows lacking coords,
  // address-bearing ones first (geocodable / quickest to place via the picker).
  const needsCoords = rows.filter((r) => !normalizePlaceLocation(r).hasValidCoordinates && (r.status === null || r.status === 'approved'))
  const addressReady = needsCoords.filter((r) => normalizePlaceLocation(r).hasAddress)
  console.log('\n  ── DATA-ENTRY BACKLOG (needs coordinates; not an anomaly) ──')
  console.log(`     published without coordinates: ${needsCoords.length} (address-ready first: ${addressReady.length})`)
  for (const r of addressReady) console.log(`     • ${r.slug}`)

  console.log('\nDone (no data modified).')
}

main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e.message); process.exit(1) })
