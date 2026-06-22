import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findInternalDuplicate, type InternalPlaceLite, type ExternalCandidate } from './duplicateDetection.ts';

const INTERNAL: InternalPlaceLite[] = [
  { slug: 'dazaifu', name: '太宰府天満宮', address: '福岡県太宰府市宰府4丁目7-1', lat: 33.5213, lng: 130.5350, providerPlaceId: 'ChIJ_dazaifu' },
  { slug: 'ohori', name: 'Ohori Park', address: 'Fukuoka, Chuo-ku', lat: 33.5860, lng: 130.3790, providerPlaceId: null },
  { slug: 'pho', name: 'Phở Quán', address: 'Hakata-ku, Fukuoka', lat: null, lng: null },
];

test('matches by provider_place_id (strongest, ignores distance)', () => {
  const ext: ExternalCandidate = { providerPlaceId: 'ChIJ_dazaifu', name: 'Different Name', formattedAddress: 'Elsewhere', lat: 0, lng: 0 };
  assert.deepEqual(findInternalDuplicate(ext, INTERNAL), { slug: 'dazaifu', name: '太宰府天満宮', reason: 'provider_place_id' });
});

test('matches by proximity + shared name token when within threshold', () => {
  const ext: ExternalCandidate = { providerPlaceId: null, name: 'Ohori Park Pond', formattedAddress: 'somewhere', lat: 33.5861, lng: 130.3791 };
  const m = findInternalDuplicate(ext, INTERNAL);
  assert.equal(m?.slug, 'ohori');
  assert.equal(m?.reason, 'proximity');
});

test('proximity NOT matched without a shared name token', () => {
  const ext: ExternalCandidate = { providerPlaceId: null, name: 'Totally Unrelated Cafe', formattedAddress: 'x', lat: 33.5861, lng: 130.3791 };
  assert.equal(findInternalDuplicate(ext, INTERNAL), null);
});

test('proximity NOT matched when far apart', () => {
  const ext: ExternalCandidate = { providerPlaceId: null, name: 'Ohori Park', formattedAddress: 'x', lat: 34.7, lng: 135.5 };
  assert.equal(findInternalDuplicate(ext, INTERNAL), null);
});

test('matches by normalized name + shared address token (no coords needed)', () => {
  const ext: ExternalCandidate = { providerPlaceId: null, name: 'Phở Quán', formattedAddress: 'Hakata-ku, Fukuoka, Japan', lat: null, lng: null };
  const m = findInternalDuplicate(ext, INTERNAL);
  assert.equal(m?.slug, 'pho');
  assert.equal(m?.reason, 'name_address');
});

test('name match without shared address token does NOT count', () => {
  const ext: ExternalCandidate = { providerPlaceId: null, name: 'Phở Quán', formattedAddress: 'Sapporo, Hokkaido', lat: null, lng: null };
  assert.equal(findInternalDuplicate(ext, INTERNAL), null);
});

test('returns null for an unrelated external place', () => {
  const ext: ExternalCandidate = { providerPlaceId: 'ChIJ_other', name: 'Starbucks Tenjin', formattedAddress: 'Tenjin, Fukuoka', lat: 33.59, lng: 130.40 };
  assert.equal(findInternalDuplicate(ext, INTERNAL), null);
});

test('provider_place_id takes precedence over proximity', () => {
  const internals: InternalPlaceLite[] = [
    { slug: 'a', name: 'Near Place', lat: 33.5861, lng: 130.3791, providerPlaceId: null },
    { slug: 'b', name: 'Far Place', lat: 0, lng: 0, providerPlaceId: 'ChIJ_match' },
  ];
  const ext: ExternalCandidate = { providerPlaceId: 'ChIJ_match', name: 'Near Place', formattedAddress: '', lat: 33.5861, lng: 130.3791 };
  assert.equal(findInternalDuplicate(ext, internals)?.slug, 'b');
});
