import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placesWithinBounds, type NearbyPlace } from '../placesNearby.ts';
import type { Place } from '../places.ts';

// Synthetic catalog of N places spread across (most of) Japan's bounds.
function synth(n: number): Place[] {
  const out: Place[] = [];
  for (let i = 0; i < n; i++) {
    const lat = 31 + (i % 1000) / 1000 * 12; // 31..43
    const lng = 130 + (i % 700) / 700 * 12;  // 130..142
    out.push({
      slug: `p-${i}`, name: `Place ${i}`, area: 'Area', desc: 'd',
      category: 'food', categoryLabel: 'Ẩm thực', fee: 'paid',
      mapUrl: '', photoUrl: '', img: '', imgFallback: '',
      lat, lng, searchEligible: true,
      // A long body that must NEVER reach the marker query result.
      body: 'x'.repeat(5000),
    } as Place);
  }
  return out;
}

const JAPAN = { north: 45.6, south: 24.0, east: 146.0, west: 122.9 };

for (const n of [100, 1000, 10000]) {
  test(`placesWithinBounds scales to ${n} places (capped, in-bounds)`, () => {
    const all = synth(n);
    const t0 = performance.now();
    const res = placesWithinBounds(all, JAPAN, { limit: 300 });
    const ms = performance.now() - t0;
    assert.ok(res.length <= 300, `cap honoured (${res.length})`);
    if (n >= 300) assert.equal(res.length, 300);
    for (const r of res) {
      assert.ok(r.lat >= JAPAN.south && r.lat <= JAPAN.north && r.lng >= JAPAN.west && r.lng <= JAPAN.east);
    }
    // Regression canary — pure in-memory filter stays well under a second even at 10k.
    assert.ok(ms < 1500, `10k filter should be fast (took ${ms.toFixed(0)}ms)`);
  });
}

// FIELD MINIMIZATION: marker results must NOT carry article bodies (payload size).
test('NearbyPlace results never include article body / heavy fields', () => {
  const res = placesWithinBounds(synth(50), JAPAN, { limit: 300 });
  assert.ok(res.length > 0);
  const sample = res[0] as NearbyPlace & Record<string, unknown>;
  assert.equal('body' in sample, false);
  assert.equal('desc' in sample, false);
  // The fields a map card needs are present.
  for (const k of ['slug', 'name', 'lat', 'lng', 'category', 'categoryLabel']) assert.ok(k in sample, `${k} present`);
});

test('distance-from-centre ordering is stable (closest first)', () => {
  const res = placesWithinBounds(synth(2000), JAPAN, { limit: 300 });
  for (let i = 1; i < res.length; i++) assert.ok(res[i].distanceKm >= res[i - 1].distanceKm);
});
