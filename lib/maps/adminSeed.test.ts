import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeExternalSeed, decodeExternalSeed, SEED_PARAM } from './adminSeed.ts';

test('round-trips a full seed', () => {
  const seed = { providerPlaceId: 'ChIJabc', name: '太宰府天満宮', address: '福岡県太宰府市', lat: 33.52, lng: 130.53 };
  const token = encodeExternalSeed(seed);
  assert.deepEqual(decodeExternalSeed(token), seed);
});

test('token is URL-safe (no +, /, = or whitespace)', () => {
  const token = encodeExternalSeed({ providerPlaceId: 'x', name: 'Ünïçödé/+=name', address: null, lat: 1, lng: 2 });
  assert.doesNotMatch(token, /[+/=\s]/);
});

test('decodes with only a name (no id)', () => {
  const token = encodeExternalSeed({ providerPlaceId: null, name: 'Just A Name', address: null, lat: null, lng: null });
  assert.equal(decodeExternalSeed(token)?.name, 'Just A Name');
});

test('returns null for empty/garbage/insufficient input', () => {
  assert.equal(decodeExternalSeed(null), null);
  assert.equal(decodeExternalSeed(''), null);
  assert.equal(decodeExternalSeed('!!!not base64!!!'), null);
  // valid base64 but no id/name → unusable
  const empty = encodeExternalSeed({ providerPlaceId: null, name: null, address: 'addr only', lat: 1, lng: 2 });
  assert.equal(decodeExternalSeed(empty), null);
});

test('coerces invalid numeric/string fields to null', () => {
  const token = encodeExternalSeed({ providerPlaceId: '  ', name: 'N', address: '  ', lat: NaN, lng: 2 });
  const d = decodeExternalSeed(token)!;
  assert.equal(d.providerPlaceId, null);
  assert.equal(d.address, null);
  assert.equal(d.lat, null);
  assert.equal(d.lng, 2);
});

test('SEED_PARAM is the stable query key', () => {
  assert.equal(SEED_PARAM, 'seed_place');
});
