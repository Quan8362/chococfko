import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodePolyline, polylineBounds } from './polyline.ts';

// Canonical example from Google's Encoded Polyline Algorithm docs.
test('decodes the canonical Google example', () => {
  const pts = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  assert.equal(pts.length, 3);
  assert.deepEqual(pts[0].map((n) => Math.round(n * 1000) / 1000), [38.5, -120.2]);
  assert.deepEqual(pts[1].map((n) => Math.round(n * 1000) / 1000), [40.7, -120.95]);
  assert.deepEqual(pts[2].map((n) => Math.round(n * 1000) / 1000), [43.252, -126.453]);
});

test('empty / null / garbage inputs are safe', () => {
  assert.deepEqual(decodePolyline(''), []);
  assert.deepEqual(decodePolyline(null), []);
  assert.deepEqual(decodePolyline(undefined), []);
  // garbage never throws
  assert.doesNotThrow(() => decodePolyline('!!!not-a-polyline!!!'));
});

test('polylineBounds computes the enclosing box', () => {
  const b = polylineBounds([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
  assert.deepEqual(b, { north: 43.252, south: 38.5, east: -120.2, west: -126.453 });
});

test('polylineBounds returns null for empty input', () => {
  assert.equal(polylineBounds([]), null);
});
