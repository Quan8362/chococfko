import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRouteRequest, buildComputeRoutesBody, parseComputeRoutesResponse,
  parseDurationString, statusFromResponse, ROUTES_FIELD_MASK, type RouteRequestInput,
} from './routeRequest.ts';

const OK: RouteRequestInput = { origin: { lat: 33.59, lng: 130.40 }, destination: { lat: 33.52, lng: 130.53 }, mode: 'transit' };

test('valid request passes validation', () => {
  assert.equal(validateRouteRequest(OK), null);
});

test('invalid origin / destination / mode are caught', () => {
  assert.equal(validateRouteRequest({ ...OK, origin: { lat: 999, lng: 0 } }), 'invalid_origin');
  assert.equal(validateRouteRequest({ ...OK, destination: { lat: NaN, lng: 0 } }), 'invalid_destination');
  assert.equal(validateRouteRequest({ ...OK, mode: 'flying' as never }), 'unsupported_mode');
  assert.equal(validateRouteRequest(null), 'invalid_origin');
});

test('origin equals destination is rejected', () => {
  assert.equal(validateRouteRequest({ ...OK, destination: { lat: 33.59, lng: 130.40 } }), 'origin_equals_destination');
  // ~5 m apart still counts as same point
  assert.equal(validateRouteRequest({ ...OK, destination: { lat: 33.59003, lng: 130.40003 } }), 'origin_equals_destination');
});

test('field mask is minimal — no steps/legs/fares', () => {
  assert.equal(ROUTES_FIELD_MASK, 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.description');
  for (const banned of ['legs', 'steps', 'fare', 'travelAdvisory', 'viewport']) assert.equal(ROUTES_FIELD_MASK.includes(banned), false);
});

test('buildComputeRoutesBody shapes origin/destination/mode', () => {
  const body = buildComputeRoutesBody(OK) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  assert.equal(body.travelMode, 'TRANSIT');
  assert.equal(body.origin.location.latLng.latitude, 33.59);
  assert.equal(body.destination.location.latLng.longitude, 130.53);
  assert.equal(body.computeAlternativeRoutes, false);
  assert.equal(body.routingPreference, undefined); // only for driving
});

test('driving adds TRAFFIC_AWARE routing preference', () => {
  const body = buildComputeRoutesBody({ ...OK, mode: 'driving' }) as Record<string, unknown>;
  assert.equal(body.routingPreference, 'TRAFFIC_AWARE');
});

test('parseDurationString handles "1234s" and numbers', () => {
  assert.equal(parseDurationString('1234s'), 1234);
  assert.equal(parseDurationString('600s'), 600);
  assert.equal(parseDurationString(42), 42);
  assert.equal(parseDurationString('bogus'), 0);
  assert.equal(parseDurationString(undefined), 0);
});

test('parseComputeRoutesResponse extracts minimal routes; tolerant', () => {
  const json = { routes: [
    { distanceMeters: 5200, duration: '900s', polyline: { encodedPolyline: 'abc' }, description: 'Via Rt 3' },
    { distanceMeters: 6000, duration: '1100s' }, // no polyline → skipped
  ] };
  const routes = parseComputeRoutesResponse(json);
  assert.equal(routes.length, 1);
  assert.deepEqual(routes[0], { distanceMeters: 5200, durationSeconds: 900, encodedPolyline: 'abc', summary: 'Via Rt 3' });
  assert.deepEqual(parseComputeRoutesResponse(null), []);
  assert.deepEqual(parseComputeRoutesResponse({}), []);
});

test('statusFromResponse maps HTTP + result to RouteStatus', () => {
  assert.equal(statusFromResponse(200, [{ distanceMeters: 1, durationSeconds: 1, encodedPolyline: 'x', summary: null }]), 'ok');
  assert.equal(statusFromResponse(200, []), 'no_route');
  assert.equal(statusFromResponse(429, []), 'quota');
  assert.equal(statusFromResponse(403, []), 'unavailable');
  assert.equal(statusFromResponse(500, []), 'unavailable');
  assert.equal(statusFromResponse(400, []), 'invalid');
});
