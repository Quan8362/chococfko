// ============================================================
// Routes API request/response shaping + validation (Map UX Phase 8). PURE.
//
// No network here — this builds the Compute Routes body, the MINIMAL field mask,
// and parses the response, so the server route stays thin and everything is
// unit-testable without a key. Cost control: the field mask requests only
// distance, duration, the encoded polyline, and a short description — never
// per-step instructions, fares, or other expensive fields.
// ============================================================

import { ROUTES_API_MODE, type TravelMode, isTravelMode } from './directions.ts';
import { isValidCoordinate } from '../coordinates.ts';
import { haversineKm } from '../geo.ts';

export interface RoutePoint { lat: number; lng: number }
export interface RouteRequestInput {
  origin: RoutePoint;
  destination: RoutePoint;
  mode: TravelMode;
  alternatives?: boolean;
  languageCode?: string;
}

/** Minimal Compute Routes field mask (no steps / fares / legs / viewport). */
export const ROUTES_FIELD_MASK = 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.description';

export const COMPUTE_ROUTES_ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';

/** Distance under which origin & destination are treated as the same point (~15 m). */
export const SAME_POINT_KM = 0.015;

export type RouteValidationError =
  | 'invalid_origin' | 'invalid_destination' | 'unsupported_mode' | 'origin_equals_destination';

/** Validate a route request. Returns an error code or null. PURE. */
export function validateRouteRequest(req: Partial<RouteRequestInput> | null | undefined): RouteValidationError | null {
  if (!req || !req.origin || !isValidCoordinate(req.origin.lat, req.origin.lng)) return 'invalid_origin';
  if (!req.destination || !isValidCoordinate(req.destination.lat, req.destination.lng)) return 'invalid_destination';
  if (!isTravelMode(req.mode)) return 'unsupported_mode';
  if (haversineKm(req.origin, req.destination) < SAME_POINT_KM) return 'origin_equals_destination';
  return null;
}

/** Build the Compute Routes JSON body. */
export function buildComputeRoutesBody(req: RouteRequestInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    origin: { location: { latLng: { latitude: req.origin.lat, longitude: req.origin.lng } } },
    destination: { location: { latLng: { latitude: req.destination.lat, longitude: req.destination.lng } } },
    travelMode: ROUTES_API_MODE[req.mode],
    polylineQuality: 'OVERVIEW',
    computeAlternativeRoutes: !!req.alternatives,
    units: 'METRIC',
    languageCode: req.languageCode || 'en',
  };
  // Traffic-aware routing only applies to DRIVE / TWO_WHEELER.
  if (req.mode === 'driving') body.routingPreference = 'TRAFFIC_AWARE';
  return body;
}

export interface ParsedRoute {
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline: string;
  summary: string | null;
}

/** Parse a Google `duration` string like "1234s" into seconds. */
export function parseDurationString(d: unknown): number {
  if (typeof d === 'number' && Number.isFinite(d)) return d;
  if (typeof d !== 'string') return 0;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(d.trim());
  return m ? Math.round(Number(m[1])) : 0;
}

/** Parse a Compute Routes response into our minimal route list. Tolerant; never throws. */
export function parseComputeRoutesResponse(json: unknown): ParsedRoute[] {
  const routes = (json as { routes?: unknown[] } | null)?.routes;
  if (!Array.isArray(routes)) return [];
  const out: ParsedRoute[] = [];
  for (const r of routes) {
    const row = r as Record<string, unknown>;
    const poly = (row.polyline as { encodedPolyline?: string } | undefined)?.encodedPolyline;
    if (!poly) continue;
    out.push({
      distanceMeters: typeof row.distanceMeters === 'number' ? row.distanceMeters : 0,
      durationSeconds: parseDurationString(row.duration),
      encodedPolyline: poly,
      summary: typeof row.description === 'string' && row.description.trim() ? row.description.trim() : null,
    });
  }
  return out;
}

/** Outcome status the API route returns and the client renders. */
export type RouteStatus = 'ok' | 'no_route' | 'unsupported_mode' | 'unavailable' | 'quota' | 'invalid' | 'region_unsupported';

/** Map an HTTP status + parsed routes into a RouteStatus. PURE. */
export function statusFromResponse(httpStatus: number, routes: ParsedRoute[]): RouteStatus {
  if (httpStatus === 429) return 'quota';
  if (httpStatus === 403) return 'unavailable';
  if (httpStatus >= 500) return 'unavailable';
  if (httpStatus >= 400) return 'invalid';
  return routes.length ? 'ok' : 'no_route';
}
