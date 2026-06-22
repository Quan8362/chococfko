// Minimal serializable place shape for list/plan rows (passed server→client).
import { categoryEmoji, type Place } from './places.ts';

export interface PlaceLite {
  slug: string;
  name: string;
  area: string;
  emoji: string;
  categoryLabel: string;
  fee: string | null;
  img: string | null;
  mapUrl: string | null;
  lat: number | null;
  lng: number | null;
  openingHours: Record<string, unknown> | null;
  closedDays: string[] | null;
  temporaryStatus: string | null;
  reservationRequired: boolean | null;
  verificationStatus: string | null;
  lastVerifiedAt: string | null;
}

export function toPlaceLite(p: Place, categoryLabel: string): PlaceLite {
  return {
    slug: p.slug, name: p.name, area: p.area,
    emoji: categoryEmoji[p.category] ?? '📍', categoryLabel,
    fee: p.fee, img: p.img, mapUrl: p.mapUrl,
    lat: p.lat ?? null, lng: p.lng ?? null,
    openingHours: (p.openingHours as Record<string, unknown> | null) ?? null,
    closedDays: p.closedDays ?? null,
    temporaryStatus: p.temporaryStatus ?? null,
    reservationRequired: p.reservationRequired ?? null,
    verificationStatus: p.verificationStatus ?? null,
    lastVerifiedAt: p.lastVerifiedAt ?? null,
  };
}
