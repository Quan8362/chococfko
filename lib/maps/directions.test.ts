import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGoogleMapsDirectionsUrl, isTravelMode, TRAVEL_MODES, ROUTES_API_MODE,
  straightLineKm, formatDurationSeconds, metresToKm,
} from './directions.ts';

function params(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

test('all four travel modes are recognized; junk is not', () => {
  for (const m of TRAVEL_MODES) assert.equal(isTravelMode(m), true);
  assert.equal(isTravelMode('flying'), false);
  assert.equal(isTravelMode(null), false);
});

test('open-in-maps prefers Place ID (with destination companion)', () => {
  const url = buildGoogleMapsDirectionsUrl({ destination: { placeId: 'ChIJ_x', lat: 33.5, lng: 130.4, name: 'Dazaifu' }, mode: 'transit' });
  const p = params(url);
  assert.equal(new URL(url).origin + new URL(url).pathname, 'https://www.google.com/maps/dir/');
  assert.equal(p.get('api'), '1');
  assert.equal(p.get('destination_place_id'), 'ChIJ_x');
  assert.equal(p.get('destination'), '33.5,130.4'); // coords used as the text value
  assert.equal(p.get('travelmode'), 'transit');
});

test('coordinate fallback when no Place ID', () => {
  const url = buildGoogleMapsDirectionsUrl({ destination: { lat: 33.59, lng: 130.42, name: 'X' }, mode: 'driving' });
  const p = params(url);
  assert.equal(p.get('destination'), '33.59,130.42');
  assert.equal(p.get('destination_place_id'), null);
  assert.equal(p.get('travelmode'), 'driving');
});

test('name fallback when neither Place ID nor coords', () => {
  const url = buildGoogleMapsDirectionsUrl({ destination: { name: 'Ohori Park' }, mode: 'walking' });
  const p = params(url);
  assert.equal(p.get('destination'), 'Ohori Park');
});

test('walking & bicycling modes encode correctly', () => {
  assert.equal(params(buildGoogleMapsDirectionsUrl({ destination: { lat: 1, lng: 2 }, mode: 'walking' })).get('travelmode'), 'walking');
  assert.equal(params(buildGoogleMapsDirectionsUrl({ destination: { lat: 1, lng: 2 }, mode: 'bicycling' })).get('travelmode'), 'bicycling');
});

test('origin omitted by default and for "current" (device location)', () => {
  assert.equal(params(buildGoogleMapsDirectionsUrl({ destination: { lat: 1, lng: 2 } })).get('origin'), null);
  assert.equal(params(buildGoogleMapsDirectionsUrl({ destination: { lat: 1, lng: 2 }, origin: 'current' })).get('origin'), null);
});

test('explicit coordinate origin is included', () => {
  const p = params(buildGoogleMapsDirectionsUrl({ destination: { lat: 1, lng: 2 }, origin: { lat: 33.5, lng: 130.4 } }));
  assert.equal(p.get('origin'), '33.5,130.4');
});

test('typed-text origin is encoded safely (no injection)', () => {
  const url = buildGoogleMapsDirectionsUrl({ destination: { lat: 1, lng: 2 }, origin: { name: 'Hakata Station & co/?x=1' } });
  // URL parses cleanly and the origin round-trips without breaking other params.
  const p = params(url);
  assert.equal(p.get('origin'), 'Hakata Station & co/?x=1');
  assert.equal(p.get('destination'), '1,2');
});

test('URL encoding: special chars in name are percent-encoded, host fixed', () => {
  const url = buildGoogleMapsDirectionsUrl({ destination: { name: '太宰府 #1 &b' } });
  assert.match(url, /^https:\/\/www\.google\.com\/maps\//);
  assert.doesNotMatch(url, /\s/); // no raw spaces
  assert.doesNotThrow(() => new URL(url));
});

test('no open-redirect: host is always google.com', () => {
  for (const o of [undefined, 'current', { name: 'evil.com' }, { lat: 9, lng: 9 }] as const) {
    const url = buildGoogleMapsDirectionsUrl({ destination: { name: 'x', lat: 1, lng: 2 }, origin: o });
    assert.equal(new URL(url).hostname, 'www.google.com');
  }
});

test('empty destination degrades to a maps search (still a Google URL)', () => {
  const url = buildGoogleMapsDirectionsUrl({ destination: {} });
  assert.equal(new URL(url).hostname, 'www.google.com');
  assert.match(url, /\/maps\/search\//);
});

test('Routes API mode mapping', () => {
  assert.equal(ROUTES_API_MODE.walking, 'WALK');
  assert.equal(ROUTES_API_MODE.driving, 'DRIVE');
  assert.equal(ROUTES_API_MODE.bicycling, 'BICYCLE');
  assert.equal(ROUTES_API_MODE.transit, 'TRANSIT');
});

test('straightLineKm + formatters', () => {
  assert.ok(straightLineKm({ lat: 33.5, lng: 130.4 }, { lat: 33.6, lng: 130.5 }) > 0);
  assert.deepEqual(formatDurationSeconds(0), { hours: 0, minutes: 0 });
  assert.deepEqual(formatDurationSeconds(90), { hours: 0, minutes: 2 }); // rounds 1.5→2
  assert.deepEqual(formatDurationSeconds(3900), { hours: 1, minutes: 5 });
  assert.equal(metresToKm(2530), 2.5);
});
