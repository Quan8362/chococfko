// Map provider flag resolution — pure tests (safe fallback to Leaflet).
// Run with:  node --test lib/maps/config.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveMapConfig, shouldLoadGoogleMaps, parseFlag, adminGoogleAvailable, externalSearchAvailable, routePreviewAvailable } from './config.ts'

const KEY = 'AIza-browser-key'

// Default Leaflet fallback — empty env.
test('default (empty env) → leaflet', () => {
  const c = resolveMapConfig({})
  assert.equal(c.provider, 'leaflet')
  assert.equal(c.requestedProvider, 'leaflet')
  assert.equal(shouldLoadGoogleMaps(c), false)
})

// Explicit Leaflet selection.
test('explicit leaflet → leaflet', () => {
  const c = resolveMapConfig({ NEXT_PUBLIC_MAP_PROVIDER: 'leaflet', NEXT_PUBLIC_GOOGLE_MAPS_ENABLED: 'true', NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: KEY })
  assert.equal(c.provider, 'leaflet')
  assert.equal(shouldLoadGoogleMaps(c), false)
})

// Google selected but feature DISABLED → fall back to leaflet.
test('google requested but disabled → leaflet', () => {
  const c = resolveMapConfig({ NEXT_PUBLIC_MAP_PROVIDER: 'google', NEXT_PUBLIC_GOOGLE_MAPS_ENABLED: 'false', NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: KEY })
  assert.equal(c.provider, 'leaflet')
  assert.equal(c.requestedProvider, 'google')
  assert.equal(c.googleMapsEnabled, false)
})

// Google enabled but MISSING KEY → fall back to leaflet.
test('google enabled but missing key → leaflet', () => {
  const c = resolveMapConfig({ NEXT_PUBLIC_MAP_PROVIDER: 'google', NEXT_PUBLIC_GOOGLE_MAPS_ENABLED: 'true', NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: '   ' })
  assert.equal(c.provider, 'leaflet')
  assert.equal(c.browserKey, null)
  assert.equal(shouldLoadGoogleMaps(c), false)
})

// All three conditions met → google is the effective provider.
test('google fully configured → google', () => {
  const c = resolveMapConfig({ NEXT_PUBLIC_MAP_PROVIDER: 'google', NEXT_PUBLIC_GOOGLE_MAPS_ENABLED: 'true', NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: KEY, NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID: 'map-123' })
  assert.equal(c.provider, 'google')
  assert.equal(c.browserKey, KEY)
  assert.equal(c.mapId, 'map-123')
  assert.equal(shouldLoadGoogleMaps(c), true)
})

// Invalid/garbage provider value → leaflet.
test('invalid provider value → leaflet', () => {
  const c = resolveMapConfig({ NEXT_PUBLIC_MAP_PROVIDER: 'mapbox', NEXT_PUBLIC_GOOGLE_MAPS_ENABLED: 'true', NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: KEY })
  assert.equal(c.requestedProvider, 'leaflet')
  assert.equal(c.provider, 'leaflet')
})

// Dependent capabilities only ON when google is the effective provider.
test('POI / route flags are gated behind an active google provider', () => {
  // requested google but disabled → dependent flags forced false even if "true"
  const off = resolveMapConfig({
    NEXT_PUBLIC_MAP_PROVIDER: 'google', NEXT_PUBLIC_GOOGLE_MAPS_ENABLED: 'false',
    NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: KEY,
    NEXT_PUBLIC_GOOGLE_EXTERNAL_POI_ENABLED: 'true', NEXT_PUBLIC_GOOGLE_ROUTE_PREVIEW_ENABLED: 'true',
  })
  assert.equal(off.externalPoiEnabled, false)
  assert.equal(off.routePreviewEnabled, false)

  const on = resolveMapConfig({
    NEXT_PUBLIC_MAP_PROVIDER: 'google', NEXT_PUBLIC_GOOGLE_MAPS_ENABLED: 'true',
    NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: KEY,
    NEXT_PUBLIC_GOOGLE_EXTERNAL_POI_ENABLED: 'true', NEXT_PUBLIC_GOOGLE_ROUTE_PREVIEW_ENABLED: 'true',
  })
  assert.equal(on.externalPoiEnabled, true)
  assert.equal(on.routePreviewEnabled, true)
})

// internalOnly defaults to TRUE (safer) when unset; parses when present.
test('internalOnly defaults true, parses explicit value', () => {
  assert.equal(resolveMapConfig({}).internalOnly, true)
  assert.equal(resolveMapConfig({ NEXT_PUBLIC_MAP_INTERNAL_ONLY: 'false' }).internalOnly, false)
  assert.equal(resolveMapConfig({ NEXT_PUBLIC_MAP_INTERNAL_ONLY: 'true' }).internalOnly, true)
})

// v2 gate is independent of provider.
test('v2Enabled parses independently', () => {
  assert.equal(resolveMapConfig({ NEXT_PUBLIC_MAP_V2_ENABLED: 'true' }).v2Enabled, true)
  assert.equal(resolveMapConfig({}).v2Enabled, false)
})

// Admin place picker availability — independent of the PUBLIC map provider.
test('adminGoogleAvailable: needs enabled + key + admin flag (not provider)', () => {
  // default → unavailable (picker falls back to manual coords)
  assert.equal(adminGoogleAvailable(resolveMapConfig({})), false)
  // enabled + key + admin flag, even with provider=leaflet → available
  const ok = resolveMapConfig({
    NEXT_PUBLIC_MAP_PROVIDER: 'leaflet', NEXT_PUBLIC_GOOGLE_MAPS_ENABLED: 'true',
    NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: KEY, NEXT_PUBLIC_ADMIN_PLACE_SEARCH_ENABLED: 'true',
  })
  assert.equal(ok.adminPlaceSearchEnabled, true)
  assert.equal(adminGoogleAvailable(ok), true)
  // missing key → unavailable (manual fallback)
  assert.equal(adminGoogleAvailable(resolveMapConfig({
    NEXT_PUBLIC_GOOGLE_MAPS_ENABLED: 'true', NEXT_PUBLIC_ADMIN_PLACE_SEARCH_ENABLED: 'true',
  })), false)
  // admin flag off → unavailable even if key present
  assert.equal(adminGoogleAvailable(resolveMapConfig({
    NEXT_PUBLIC_GOOGLE_MAPS_ENABLED: 'true', NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: KEY,
  })), false)
})

// External SEARCH availability — Phase 7. Independent of the base-map provider,
// but still requires the master switch + key + external-POI flag (all default off).
test('externalSearchAvailable: needs enabled + key + external flag (not provider)', () => {
  // default → unavailable (internal-only search; external Google OFF)
  assert.equal(externalSearchAvailable(resolveMapConfig({})), false)
  // enabled + key + external flag, even with provider=leaflet → available
  const ok = resolveMapConfig({
    NEXT_PUBLIC_MAP_PROVIDER: 'leaflet', NEXT_PUBLIC_GOOGLE_MAPS_ENABLED: 'true',
    NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: KEY, NEXT_PUBLIC_GOOGLE_EXTERNAL_POI_ENABLED: 'true',
  })
  assert.equal(ok.externalPoiFlag, true)
  assert.equal(externalSearchAvailable(ok), true)
  // base-map POI (provider-gated) stays OFF under leaflet even though search is available
  assert.equal(ok.externalPoiEnabled, false)
  // master switch off → unavailable
  assert.equal(externalSearchAvailable(resolveMapConfig({
    NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: KEY, NEXT_PUBLIC_GOOGLE_EXTERNAL_POI_ENABLED: 'true',
  })), false)
  // external flag off → unavailable even with key + master switch
  assert.equal(externalSearchAvailable(resolveMapConfig({
    NEXT_PUBLIC_GOOGLE_MAPS_ENABLED: 'true', NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: KEY,
  })), false)
})

// Route preview availability — Phase 8. Independent of the base-map provider; the
// server route additionally needs the server-only key (not in this client config).
test('routePreviewAvailable: needs master switch + route flag (not provider)', () => {
  // default → unavailable (only "Open in Google Maps" by default)
  assert.equal(routePreviewAvailable(resolveMapConfig({})), false)
  // master switch + route flag, even with provider=leaflet → available (client gate)
  const ok = resolveMapConfig({
    NEXT_PUBLIC_MAP_PROVIDER: 'leaflet', NEXT_PUBLIC_GOOGLE_MAPS_ENABLED: 'true',
    NEXT_PUBLIC_GOOGLE_ROUTE_PREVIEW_ENABLED: 'true',
  })
  assert.equal(ok.routePreviewFlag, true)
  assert.equal(routePreviewAvailable(ok), true)
  // base-map route preview (provider-gated) stays OFF under leaflet
  assert.equal(ok.routePreviewEnabled, false)
  // master switch off → unavailable even with the flag
  assert.equal(routePreviewAvailable(resolveMapConfig({ NEXT_PUBLIC_GOOGLE_ROUTE_PREVIEW_ENABLED: 'true' })), false)
})

// Map V2 base-map visibility is governed solely by the v2Enabled kill switch —
// it is the single PUBLIC base map for everyone (anon + authed). Auth must never
// downgrade it, so there is no auth-conditional gate to test here. `internalOnly`
// remains only for the Google dev surface (/map/lab) and is asserted above.

// Flag parsing accepts common truthy spellings; everything else is false.
test('parseFlag truthy/falsey spellings', () => {
  for (const v of ['true', 'TRUE', '1', 'yes', 'on', ' On ']) assert.equal(parseFlag(v), true, v)
  for (const v of ['false', '0', 'no', '', undefined, 'garbage']) assert.equal(parseFlag(v as string), false, String(v))
})
