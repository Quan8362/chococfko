// Pure helpers describing which detail-page actions have a valid target, so the
// UI never shows an active button that goes nowhere.
import type { Place } from './places.ts';

export interface ActionAvailability {
  directions: boolean; // always (map_url or coords or name search)
  call: boolean;
  reserve: boolean;
  website: boolean;
  social: boolean;
  save: boolean;       // always
  share: boolean;      // always
  ask: boolean;        // always (community)
  report: boolean;     // always (feedback)
}

export function availableActions(p: Pick<Place, 'phone' | 'phoneE164' | 'reservationUrl' | 'officialWebsite' | 'socialUrl'>): ActionAvailability {
  return {
    directions: true,
    call: !!(p.phoneE164 || p.phone),
    reserve: !!p.reservationUrl,
    website: !!p.officialWebsite,
    social: !!p.socialUrl,
    save: true,
    share: true,
    ask: true,
    report: true,
  };
}

/** Best directions URL: explicit map_url, else coords, else a name search. */
export function directionsUrl(p: { mapUrl?: string | null; lat?: number | null; lng?: number | null; name: string }): string {
  if (p.mapUrl) return p.mapUrl;
  if (typeof p.lat === 'number' && typeof p.lng === 'number') {
    return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name} Japan`)}`;
}

export function telHref(p: Pick<Place, 'phone' | 'phoneE164'>): string | null {
  const t = p.phoneE164 || p.phone;
  return t ? `tel:${t}` : null;
}
