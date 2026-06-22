import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXTERNAL_PREVIEW_FIELDS, EXPENSIVE_FIELDS_NEVER_DEFAULT,
  mapPlaceToExternalPreview, externalOpenInMapsUrl, externalDirectionsUrl, humanizeType,
} from './externalPlace.ts';

// COST GUARDRAIL: the minimal mask must never include an expensive field.
test('EXTERNAL_PREVIEW_FIELDS is disjoint from EXPENSIVE_FIELDS_NEVER_DEFAULT', () => {
  const expensive = new Set<string>(EXPENSIVE_FIELDS_NEVER_DEFAULT);
  for (const f of EXTERNAL_PREVIEW_FIELDS) assert.equal(expensive.has(f), false, `${f} must not be requested by default`);
});

test('mask contains only the 6 essentials fields', () => {
  assert.deepEqual([...EXTERNAL_PREVIEW_FIELDS], ['id', 'displayName', 'formattedAddress', 'location', 'types', 'googleMapsURI']);
});

test('mapPlaceToExternalPreview maps a New-API Place shape', () => {
  const p = mapPlaceToExternalPreview({
    id: 'ChIJxyz',
    displayName: { text: 'Ichiran Hakata' },
    formattedAddress: 'Fukuoka, Hakata-ku',
    location: { lat: 33.59, lng: 130.42 },
    types: ['ramen_restaurant', 'restaurant', 'food'],
    googleMapsURI: 'https://maps.google.com/?cid=1',
  });
  assert.equal(p.source, 'google');
  assert.equal(p.providerPlaceId, 'ChIJxyz');
  assert.equal(p.name, 'Ichiran Hakata');
  assert.equal(p.primaryType, 'ramen restaurant');
  assert.equal(p.lat, 33.59);
  assert.equal(p.mapsUrl, 'https://maps.google.com/?cid=1');
});

test('mapPlaceToExternalPreview tolerates method-style LatLng and string displayName', () => {
  const p = mapPlaceToExternalPreview({
    id: 'x', displayName: 'Plain Name',
    location: { lat: () => 10, lng: () => 20 } as never, types: null,
  });
  assert.equal(p.name, 'Plain Name');
  assert.equal(p.lat, 10);
  assert.equal(p.lng, 20);
  assert.deepEqual(p.types, []);
  assert.equal(p.primaryType, null);
});

test('mapPlaceToExternalPreview keeps preview when coordinates are absent', () => {
  const p = mapPlaceToExternalPreview({ id: 'x', displayName: 'No Coords', formattedAddress: 'Somewhere' });
  assert.equal(p.lat, null);
  assert.equal(p.lng, null);
  assert.equal(p.name, 'No Coords');
});

test('externalOpenInMapsUrl prefers canonical URI, then place id, then coords', () => {
  assert.equal(externalOpenInMapsUrl({ mapsUrl: 'https://g/abc', providerPlaceId: null, lat: null, lng: null, name: 'X' }), 'https://g/abc');
  assert.match(externalOpenInMapsUrl({ mapsUrl: null, providerPlaceId: 'ChIJ', lat: null, lng: null, name: 'X' }), /query_place_id=ChIJ/);
  assert.match(externalOpenInMapsUrl({ mapsUrl: null, providerPlaceId: null, lat: 1, lng: 2, name: 'X' }), /query=1,2/);
});

test('externalDirectionsUrl builds a coords+place-id deep link', () => {
  const u = externalDirectionsUrl({ providerPlaceId: 'ChIJ', lat: 33.5, lng: 130.4, name: 'X' });
  assert.match(u, /destination=33\.5,130\.4/);
  assert.match(u, /destination_place_id=ChIJ/);
});

test('humanizeType replaces underscores; null-safe', () => {
  assert.equal(humanizeType('food_court'), 'food court');
  assert.equal(humanizeType(null), null);
  assert.equal(humanizeType('  '), null);
});
