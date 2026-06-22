import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapEnvStatus, validateMapEnv } from './env.ts';

const KEY = 'AIza-browser';

test('mapEnvStatus returns booleans only (never values)', () => {
  const s = mapEnvStatus({ NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: KEY, GOOGLE_MAPS_SERVER_KEY: 'srv' });
  for (const v of Object.values(s)) assert.equal(typeof v, 'boolean');
  assert.equal(s.browser_key_configured, true);
  assert.equal(s.server_routes_key_configured, true);
  // The actual key value never appears anywhere in the output.
  assert.equal(JSON.stringify(s).includes(KEY), false);
});

test('default (all flags off) → valid, nothing missing', () => {
  assert.deepEqual(validateMapEnv({}), { ok: true, missing: [], warnings: [] });
});

test('external search enabled without a browser key → missing browser key', () => {
  const v = validateMapEnv({ NEXT_PUBLIC_GOOGLE_MAPS_ENABLED: 'true', NEXT_PUBLIC_GOOGLE_EXTERNAL_POI_ENABLED: 'true' });
  assert.equal(v.ok, false);
  assert.ok(v.missing.includes('NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY'));
});

test('route preview enabled without the server key → missing server key', () => {
  const v = validateMapEnv({ NEXT_PUBLIC_GOOGLE_MAPS_ENABLED: 'true', NEXT_PUBLIC_GOOGLE_ROUTE_PREVIEW_ENABLED: 'true' });
  assert.ok(v.missing.includes('GOOGLE_MAPS_SERVER_KEY'));
});

test('provider=google without a Map ID → warning (not fatal)', () => {
  const v = validateMapEnv({ NEXT_PUBLIC_MAP_PROVIDER: 'google', NEXT_PUBLIC_GOOGLE_MAPS_ENABLED: 'true', NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: KEY });
  assert.ok(v.warnings.includes('NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID'));
  assert.equal(v.ok, true); // warning only
});

test('fully configured google search → ok', () => {
  const v = validateMapEnv({
    NEXT_PUBLIC_GOOGLE_MAPS_ENABLED: 'true', NEXT_PUBLIC_GOOGLE_EXTERNAL_POI_ENABLED: 'true',
    NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: KEY,
  });
  assert.deepEqual(v, { ok: true, missing: [], warnings: [] });
});
