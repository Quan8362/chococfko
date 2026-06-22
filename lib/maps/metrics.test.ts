import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMapMetric, isMapMetric, latencyBucket, containsNoSensitiveData, MAP_METRICS,
} from './metrics.ts';

test('known events recognized; junk rejected', () => {
  for (const e of MAP_METRICS) assert.equal(isMapMetric(e), true);
  assert.equal(isMapMetric('exfiltrate'), false);
  assert.equal(buildMapMetric('exfiltrate', {}), null);
});

test('latencyBucket maps to coarse aggregate buckets', () => {
  assert.equal(latencyBucket(50), '<100');
  assert.equal(latencyBucket(200), '100-300');
  assert.equal(latencyBucket(800), '300-1000');
  assert.equal(latencyBucket(2000), '1000-3000');
  assert.equal(latencyBucket(5000), '>3000');
  assert.equal(latencyBucket(-1), 'na');
});

test('buildMapMetric keeps only allow-listed dims', () => {
  const p = buildMapMetric('viewport_query', { ok: true, latency_ms: 42, latency_bucket: '<100', provider: 'leaflet' });
  assert.deepEqual(p?.dims, { ok: true, latency_ms: 42, latency_bucket: '<100', provider: 'leaflet' });
});

// PRIVACY: coordinates / addresses / keys passed as dims are DROPPED.
test('buildMapMetric DROPS coordinates / address / key / query', () => {
  const p = buildMapMetric('route_preview_requested', {
    mode: 'transit',
    lat: 33.59, lng: 130.4, latitude: 1, longitude: 2,
    origin_lat: 5, address: '福岡県…', key: 'AIza-secret', query: 'my home',
  } as Record<string, unknown>);
  assert.deepEqual(p?.dims, { mode: 'transit' });
  assert.equal(containsNoSensitiveData(p), true);
  assert.equal('lat' in (p!.dims as object), false);
  assert.equal('address' in (p!.dims as object), false);
});

test('status string is length-capped', () => {
  const p = buildMapMetric('route_preview_failed', { status: 'x'.repeat(200) });
  assert.ok((p!.dims.status as string).length <= 48);
});

test('containsNoSensitiveData flags forbidden keys (nested)', () => {
  assert.equal(containsNoSensitiveData({ event: 'map_loaded', dims: { provider: 'leaflet' } }), true);
  assert.equal(containsNoSensitiveData({ dims: { lat: 1 } }), false);
  assert.equal(containsNoSensitiveData({ a: { address: 'x' } }), false);
  assert.equal(containsNoSensitiveData({ a: { token: 'x' } }), false);
});
