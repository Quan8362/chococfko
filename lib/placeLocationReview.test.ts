import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildManualReviewList } from './placeLocation.ts';

test('clean rows (valid or simply missing coords) need NO manual review', () => {
  const rows = [
    { slug: 'a', lat: 33.5, lng: 130.4 },           // valid
    { slug: 'b', lat: null, lng: null },             // missing (data entry, not anomaly)
    { slug: 'c', lat: null, lng: null, address: '福岡' }, // missing + address (data entry)
  ];
  assert.deepEqual(buildManualReviewList(rows), []);
});

test('flags incomplete pair, out-of-range, suspicious, out-of-Japan', () => {
  const rows = [
    { slug: 'incomplete', lat: 33.5, lng: null },
    { slug: 'range', lat: 999, lng: 130 },
    { slug: 'zero', lat: 0, lng: 0 },
    { slug: 'foreign', lat: 48.85, lng: 2.35 }, // Paris
    { slug: 'ok', lat: 33.59, lng: 130.40 },
  ];
  const review = buildManualReviewList(rows);
  const bySlug = Object.fromEntries(review.map((r) => [r.slug, r.reasons]));
  assert.deepEqual(bySlug.incomplete, ['incomplete_pair']);
  assert.deepEqual(bySlug.range, ['invalid_range']);
  // (0,0) is both Null Island AND outside Japan — both reasons are correct.
  assert.ok(bySlug.zero.includes('suspicious_zero'));
  assert.ok(bySlug.zero.includes('outside_japan'));
  assert.deepEqual(bySlug.foreign, ['outside_japan']);
  assert.equal('ok' in bySlug, false);
});

test('flags duplicate provider ids and duplicate coordinates', () => {
  const rows = [
    { slug: 'p1', lat: 33.5, lng: 130.4, provider_place_id: 'ChIJ_x' },
    { slug: 'p2', lat: 34.0, lng: 131.0, provider_place_id: 'ChIJ_x' },
    { slug: 'c1', lat: 35.0, lng: 132.0 },
    { slug: 'c2', lat: 35.0, lng: 132.0 },
  ];
  const review = buildManualReviewList(rows);
  const bySlug = Object.fromEntries(review.map((r) => [r.slug, r.reasons]));
  assert.ok(bySlug.p1.includes('duplicate_provider_id'));
  assert.ok(bySlug.p2.includes('duplicate_provider_id'));
  assert.ok(bySlug.c1.includes('duplicate_coordinates'));
  assert.ok(bySlug.c2.includes('duplicate_coordinates'));
});

test('output is sorted by slug and stable', () => {
  const rows = [{ slug: 'z', lat: 0, lng: 0 }, { slug: 'a', lat: 999, lng: 0 }];
  assert.deepEqual(buildManualReviewList(rows).map((r) => r.slug), ['a', 'z']);
});
