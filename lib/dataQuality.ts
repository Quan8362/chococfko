// Pure data-quality checks for the Explore platform. Repeatable + unit-testable;
// the Admin report and any CLI script run the SAME functions. These only REPORT
// problems — they never mutate production data (ambiguous values are surfaced for
// a human, not auto-corrected).

import { isValidHttpUrl, isValidCoordinate } from './placeFields.ts';
import type { Place } from './places';
import type { PlaceEvent } from './events';
import { isExpired } from './events.ts';

export type FindingMap = Record<string, string[]>; // check code → offending ids/slugs

function push(map: FindingMap, code: string, id: string) {
  (map[code] ??= []).push(id);
}

export const PLACE_CHECKS = [
  'missing_identity', 'invalid_coordinates', 'missing_coordinates', 'invalid_url',
  'contradictory_price', 'missing_price', 'missing_hours', 'open_unknown_hours',
  'missing_official_link', 'not_verified_recently', 'duplicate_slug',
] as const;

export interface PlaceAuditOpts {
  /** A place is "stale" if last_verified_at is older than this many days. Default 365. */
  verifyStaleDays?: number;
  now?: Date;
}

/** Audit a set of places. Returns check-code → list of slugs. */
export function auditPlaces(places: Place[], opts: PlaceAuditOpts = {}): FindingMap {
  const now = opts.now ?? new Date();
  const staleDays = opts.verifyStaleDays ?? 365;
  const map: FindingMap = {};
  const seenSlug = new Set<string>();

  for (const p of places) {
    const id = p.slug || p.name || '(unknown)';

    if (!p.slug || !p.name || !p.category) push(map, 'missing_identity', id);

    if (p.lat != null || p.lng != null) {
      if (!isValidCoordinate(p.lat, p.lng)) push(map, 'invalid_coordinates', id);
    } else {
      push(map, 'missing_coordinates', id);
    }

    for (const url of [p.officialWebsite, p.reservationUrl, p.socialUrl, p.sourceUrl, p.mapUrl]) {
      if (url && !isValidHttpUrl(url)) { push(map, 'invalid_url', id); break; }
    }

    if (p.priceMin != null && p.priceMax != null && p.priceMax < p.priceMin) push(map, 'contradictory_price', id);
    if (p.priceType == null && p.priceMin == null && p.priceMax == null && p.fee == null) push(map, 'missing_price', id);

    const hasHours = p.openingHours != null && typeof p.openingHours === 'object' && Object.keys(p.openingHours).length > 0;
    if (!hasHours) push(map, 'missing_hours', id);
    // "Open" status but no hours → can't honestly show open-now.
    if (p.temporaryStatus === 'open' && !hasHours) push(map, 'open_unknown_hours', id);

    if (!p.officialWebsite && !p.mapUrl) push(map, 'missing_official_link', id);

    const verified = p.lastVerifiedAt ? new Date(p.lastVerifiedAt) : null;
    const stale = !verified || (now.getTime() - verified.getTime()) / 86_400_000 > staleDays;
    if (stale) push(map, 'not_verified_recently', id);

    if (p.slug) {
      if (seenSlug.has(p.slug)) push(map, 'duplicate_slug', p.slug);
      seenSlug.add(p.slug);
    }
  }
  return map;
}

export const EVENT_CHECKS = ['expired_published', 'missing_source', 'invalid_url', 'contradictory_price', 'cancelled_published'] as const;

/** Audit events (admin/all set). Returns check-code → list of event ids. */
export function auditEvents(events: PlaceEvent[], now: Date = new Date()): FindingMap {
  const map: FindingMap = {};
  for (const ev of events) {
    const id = ev.id;
    if (ev.status === 'published' && isExpired(ev, now)) push(map, 'expired_published', id);
    if (ev.status === 'published' && !ev.sourceUrl) push(map, 'missing_source', id);
    for (const url of [ev.sourceUrl, ev.registrationUrl]) {
      if (url && !isValidHttpUrl(url)) { push(map, 'invalid_url', id); break; }
    }
    if (ev.priceMin != null && ev.priceMax != null && ev.priceMax < ev.priceMin) push(map, 'contradictory_price', id);
    if (ev.status === 'published' && ev.isCancelled) push(map, 'cancelled_published', id);
  }
  return map;
}

/** Total findings across a map (for a single "problems" headline number). */
export function totalFindings(map: FindingMap): number {
  return Object.values(map).reduce((n, list) => n + list.length, 0);
}
