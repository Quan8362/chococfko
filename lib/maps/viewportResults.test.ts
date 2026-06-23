import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { NearbyPlace } from '../placesNearby.ts';
import type { InternalResultItem } from './unifiedSearch.ts';
import { internalToNearby, mergePinnedPlace } from './viewportResults.ts';

function np(slug: string, lat: number, lng: number): NearbyPlace {
  return {
    slug, name: slug, area: '', category: 'food', categoryLabel: '',
    fee: null, img: null, imgFallback: null, mapUrl: null, lat, lng,
    nearestStation: null, stationWalkMinutes: null, openingHours: null,
    closedDays: null, temporaryStatus: null, priceType: null, priceMin: null,
    priceMax: null, currency: null, distanceKm: 0,
  };
}

const dazaifuItem: InternalResultItem = {
  kind: 'internal', slug: 'dazaifu', name: '太宰府天満宮', categoryCode: 'landmark',
  categoryLabel: 'Tham quan', area: 'Dazaifu', nearestStation: 'Dazaifu Station',
  img: null, hasCoordinates: true, lat: 33.52, lng: 130.53, score: 8,
};

test('internalToNearby carries coordinates + identity from the search result', () => {
  const n = internalToNearby(dazaifuItem);
  assert.equal(n.slug, 'dazaifu');
  assert.equal(n.name, '太宰府天満宮');
  assert.equal(n.category, 'landmark');
  assert.equal(n.lat, 33.52);
  assert.equal(n.lng, 130.53);
  assert.equal(n.distanceKm, 0);
});

test('mergePinnedPlace prepends the pin when the viewport covers it and the server omitted it', () => {
  const pin = internalToNearby(dazaifuItem);
  const server = [np('a', 33.5, 130.5)];
  const merged = mergePinnedPlace(server, pin, () => true);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].slug, 'dazaifu'); // selection never flashes to 0
});

test('mergePinnedPlace does NOT duplicate a pin the server already returned', () => {
  const pin = internalToNearby(dazaifuItem);
  const server = [np('dazaifu', 33.52, 130.53), np('a', 33.5, 130.5)];
  const merged = mergePinnedPlace(server, pin, () => true);
  assert.equal(merged.length, 2);
  assert.equal(merged.filter((p) => p.slug === 'dazaifu').length, 1);
});

test('mergePinnedPlace drops the pin once the viewport no longer covers it', () => {
  const pin = internalToNearby(dazaifuItem);
  const server = [np('a', 35, 139)];
  const merged = mergePinnedPlace(server, pin, () => false);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].slug, 'a');
});

test('mergePinnedPlace is a no-op without a pin', () => {
  const server = [np('a', 33.5, 130.5)];
  assert.deepEqual(mergePinnedPlace(server, null, () => true), server);
});
