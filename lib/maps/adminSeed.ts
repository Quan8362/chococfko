// ============================================================
// Admin "use this external place for a Chợ Cóc FKO article" seed (Phase 7). PURE.
//
// Carries a minimal external candidate from the public map to the Admin Place
// Picker via a URL param. It NEVER publishes content and copies only provider-
// attributed, non-restricted fields (id / name / address / coords). The admin
// must confirm + save in the picker for anything to persist.
//
// Encoded as URL-safe base64 of a small JSON object. Decoding is tolerant and
// returns null for anything malformed (no throw, no trust in untrusted input).
// ============================================================

export interface ExternalSeed {
  providerPlaceId: string | null;
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

export const SEED_PARAM = 'seed_place';

function b64urlEncode(s: string): string {
  // Works in both browser (btoa) and Node (Buffer).
  const b64 = typeof btoa === 'function'
    ? btoa(unescape(encodeURIComponent(s)))
    : Buffer.from(s, 'utf-8').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s: string): string | null {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    if (typeof atob === 'function') return decodeURIComponent(escape(atob(b64)));
    return Buffer.from(b64, 'base64').toString('utf-8');
  } catch {
    return null;
  }
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** Encode a seed into a URL-safe token. */
export function encodeExternalSeed(seed: ExternalSeed): string {
  const compact: ExternalSeed = {
    providerPlaceId: str(seed.providerPlaceId),
    name: str(seed.name),
    address: str(seed.address),
    lat: num(seed.lat),
    lng: num(seed.lng),
  };
  return b64urlEncode(JSON.stringify(compact));
}

/** Decode a seed token. Returns null when missing/malformed/empty. */
export function decodeExternalSeed(token: string | null | undefined): ExternalSeed | null {
  if (!token) return null;
  const json = b64urlDecode(token);
  if (!json) return null;
  try {
    const o = JSON.parse(json) as Record<string, unknown>;
    if (!o || typeof o !== 'object') return null;
    const seed: ExternalSeed = {
      providerPlaceId: str(o.providerPlaceId),
      name: str(o.name),
      address: str(o.address),
      lat: num(o.lat),
      lng: num(o.lng),
    };
    // Require at least an id or a name to be useful.
    if (!seed.providerPlaceId && !seed.name) return null;
    return seed;
  } catch {
    return null;
  }
}
