// ============================================================
// Pure parser for Google Maps URLs (Map UX Phase 5).
//
// Extracts what is RELIABLY available from a pasted link: coordinates, a Place
// ID (only from explicit place_id / query_place_id / destination_place_id
// params — the hex "ftid" 0x..:0x.. in /maps/place URLs is NOT a Place ID), a
// place name, or a free-text query. Short links (maps.app.goo.gl / goo.gl) can't
// be resolved client-side (they need a redirect follow) → returned as 'short' so
// a server action can expand them.
//
// Security: only accepts Google-owned hosts (no open-redirect / SSRF surface).
// Never throws; returns null when nothing usable is found.
//
// PURE & dependency-light (only the canonical coordinate validator). Tested.
// ============================================================

import { isValidCoordinate } from '../coordinates.ts';

export type GoogleMapsLink =
  | { kind: 'coords'; lat: number; lng: number; placeId: string | null; name: string | null }
  | { kind: 'placeId'; placeId: string; name: string | null }
  | { kind: 'query'; query: string }
  | { kind: 'short'; url: string };

/** Google-owned hosts we accept (defends the short-link expander from SSRF). */
export function isGoogleMapsHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'goo.gl' || h === 'maps.app.goo.gl' || h === 'app.goo.gl' || h === 'g.co') return true;
  // `google` must be the REGISTRABLE domain (immediately followed by a TLD at the
  // end), so google.com / maps.google.com / google.co.jp match, but
  // google.evil.com / notgoogle.com do NOT.
  return /(^|\.)google\.([a-z]{2,3}|co\.[a-z]{2}|com\.[a-z]{2})$/.test(h);
}

function isShortHost(h: string): boolean {
  const x = h.toLowerCase();
  return x === 'goo.gl' || x === 'maps.app.goo.gl' || x === 'app.goo.gl' || x === 'g.co';
}

// A coordinate pair like "33.5902,130.4017" (optionally with whitespace).
const COORD_RE = /^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/;
// Place IDs are long opaque tokens (ChIJ…, GhIJ…, Ei…). Be permissive but bounded.
const PLACE_ID_RE = /^[A-Za-z0-9_-]{15,}$/;

function coordsFrom(latRaw: string, lngRaw: string): { lat: number; lng: number } | null {
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  return isValidCoordinate(lat, lng) ? { lat, lng } : null;
}

function decode(s: string): string {
  try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; }
}

/** Parse a Google Maps URL/string. Returns null if not a usable Google link. */
export function parseGoogleMapsUrl(raw: string): GoogleMapsLink | null {
  const input = (raw ?? '').trim();
  if (!input) return null;

  // geo: URI — geo:lat,lng
  const geo = /^geo:(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/i.exec(input);
  if (geo) {
    const c = coordsFrom(geo[1], geo[2]);
    if (c) return { kind: 'coords', ...c, placeId: null, name: null };
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null; // not a URL (bare text is handled by autocomplete, not here)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!isGoogleMapsHost(url.hostname)) return null;

  // Short links must be expanded server-side first.
  if (isShortHost(url.hostname)) return { kind: 'short', url: url.toString() };

  const params = url.searchParams;
  const placeId =
    params.get('query_place_id') || params.get('destination_place_id') || params.get('place_id') || null;
  const validPlaceId = placeId && PLACE_ID_RE.test(placeId) ? placeId : null;

  // Name from /maps/place/<Name>/...
  let name: string | null = null;
  const placeSeg = /\/maps\/place\/([^/@]+)/.exec(url.pathname);
  if (placeSeg) {
    const n = decode(placeSeg[1]).trim();
    if (n && !COORD_RE.test(n)) name = n;
  }

  // Coordinates: prefer the explicit data marker !3dLAT!4dLNG, then @lat,lng,
  // then q/query/destination/ll/center when they hold a coord pair.
  const data3d4d = /!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/.exec(input);
  const atSign = /@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/.exec(url.pathname + url.search);
  const paramCoordKeys = ['q', 'query', 'destination', 'll', 'center', 'sll'];
  let paramCoord: { lat: number; lng: number } | null = null;
  let textQuery: string | null = null;
  for (const k of paramCoordKeys) {
    const v = params.get(k);
    if (!v) continue;
    const m = COORD_RE.exec(v.trim());
    if (m) { paramCoord = coordsFrom(m[1], m[2]); if (paramCoord) break; }
    else if (!textQuery && (k === 'q' || k === 'query' || k === 'destination')) textQuery = decode(v).trim();
  }

  const coord =
    (data3d4d && coordsFrom(data3d4d[1], data3d4d[2])) ||
    (atSign && coordsFrom(atSign[1], atSign[2])) ||
    paramCoord ||
    null;

  if (coord) return { kind: 'coords', ...coord, placeId: validPlaceId, name };
  if (validPlaceId) return { kind: 'placeId', placeId: validPlaceId, name };
  if (name) return { kind: 'query', query: name };
  if (textQuery) return { kind: 'query', query: textQuery };
  return null;
}
