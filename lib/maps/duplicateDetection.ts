// ============================================================
// Duplicate detection (Map UX Phase 7). PURE/testable.
//
// When an external Google place already corresponds to a Chợ Cóc FKO editorial
// place, we PREFER the internal one and link to its article instead of letting
// the user create a confusing duplicate / treat external as editorial.
//
// Match precedence (strongest first):
//   1. provider_place_id  — exact, non-null Google Place ID match.
//   2. proximity          — coordinates within `proximityKm` AND a shared name
//                           token (proximity alone is too weak in dense areas).
//   3. name_address       — normalized name equality/containment AND a shared
//                           address token.
// ============================================================

import { haversineKm } from '../geo.ts';
import { normalizeText, tokenize } from '../placeSearch.ts';

export interface InternalPlaceLite {
  slug: string;
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  providerPlaceId?: string | null;
}

export interface ExternalCandidate {
  providerPlaceId: string | null;
  name: string | null;
  formattedAddress: string | null;
  lat: number | null;
  lng: number | null;
}

export type DuplicateReason = 'provider_place_id' | 'proximity' | 'name_address';

export interface DuplicateMatch {
  slug: string;
  name: string;
  reason: DuplicateReason;
}

/** Default proximity threshold for the "same physical place" heuristic (60 m). */
export const DEFAULT_PROXIMITY_KM = 0.06;

function tokenSet(s: string | null | undefined): Set<string> {
  return new Set(tokenize(normalizeText(s ?? '')).filter((t) => t.length >= 2));
}
function sharesToken(a: Set<string>, b: Set<string>): boolean {
  for (const t of Array.from(a)) if (b.has(t)) return true;
  return false;
}
function hasCoords(lat: number | null | undefined, lng: number | null | undefined): boolean {
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng);
}

/**
 * Find the internal place an external candidate duplicates, or null. Pure &
 * deterministic; checks all internals and returns the highest-precedence match.
 */
export function findInternalDuplicate(
  ext: ExternalCandidate,
  internals: InternalPlaceLite[],
  opts: { proximityKm?: number } = {},
): DuplicateMatch | null {
  const proximityKm = opts.proximityKm ?? DEFAULT_PROXIMITY_KM;
  const extId = (ext.providerPlaceId ?? '').trim();
  const extNameTokens = tokenSet(ext.name);
  const extAddrTokens = tokenSet(ext.formattedAddress);
  const extNameNorm = normalizeText(ext.name ?? '');

  let proximityHit: DuplicateMatch | null = null;
  let nameAddrHit: DuplicateMatch | null = null;

  for (const p of internals) {
    // 1. Provider Place ID — strongest, return immediately.
    if (extId && (p.providerPlaceId ?? '').trim() === extId) {
      return { slug: p.slug, name: p.name, reason: 'provider_place_id' };
    }
    // 2. Proximity + shared name token.
    if (!proximityHit && hasCoords(ext.lat, ext.lng) && hasCoords(p.lat, p.lng)) {
      const d = haversineKm({ lat: ext.lat as number, lng: ext.lng as number }, { lat: p.lat as number, lng: p.lng as number });
      if (d <= proximityKm && sharesToken(extNameTokens, tokenSet(p.name))) {
        proximityHit = { slug: p.slug, name: p.name, reason: 'proximity' };
      }
    }
    // 3. Normalized name equality/containment + shared address token.
    if (!nameAddrHit && extNameNorm) {
      const pNameNorm = normalizeText(p.name);
      const nameMatch = pNameNorm === extNameNorm || pNameNorm.includes(extNameNorm) || extNameNorm.includes(pNameNorm);
      if (nameMatch && sharesToken(extAddrTokens, tokenSet(p.address))) {
        nameAddrHit = { slug: p.slug, name: p.name, reason: 'name_address' };
      }
    }
  }
  return proximityHit ?? nameAddrHit;
}
