import 'server-only';
import { unstable_cache, revalidateTag } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';
import type { PlaceEvent } from '@/lib/events';

// IO/loader layer for events (pure logic lives in lib/events.ts).
//
// Public reads use the cookie-free public client + unstable_cache so the
// published-events list is cacheable safe public data (never per-user). The
// time-sensitive today/weekend/expired bucketing is applied at render with a
// fresh `now`, so a short cache window cannot show expired events as upcoming.
// Admin reads/writes use the service-role client (in the server action layer).

type DbEvent = {
  id: string; slug: string | null; title: string; description: string | null;
  place_slug: string | null; venue: string | null; area: string | null; prefecture: string | null;
  starts_at: string; ends_at: string | null;
  price_type: string | null; price_min: number | null; price_max: number | null; currency: string | null;
  source_url: string | null; registration_url: string | null; last_verified_at: string | null;
  status: string; is_cancelled: boolean;
};

export function mapDbEvent(r: DbEvent): PlaceEvent {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    placeSlug: r.place_slug,
    venue: r.venue,
    area: r.area,
    prefecture: r.prefecture,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    priceType: (r.price_type as PlaceEvent['priceType']) ?? null,
    priceMin: r.price_min,
    priceMax: r.price_max,
    currency: r.currency,
    sourceUrl: r.source_url,
    registrationUrl: r.registration_url,
    lastVerifiedAt: r.last_verified_at,
    status: (r.status as PlaceEvent['status']) ?? 'draft',
    isCancelled: !!r.is_cancelled,
  };
}

const SELECT = 'id, slug, title, description, place_slug, venue, area, prefecture, starts_at, ends_at, price_type, price_min, price_max, currency, source_url, registration_url, last_verified_at, status, is_cancelled';

const loadPublished = unstable_cache(
  async (): Promise<PlaceEvent[]> => {
    try {
      const sb = createPublicClient();
      // Pull recently-relevant events only; expired filtering is done at render.
      const since = new Date(Date.now() - 2 * 86_400_000).toISOString();
      const { data, error } = await sb
        .from('place_events')
        .select(SELECT)
        .eq('status', 'published')
        .gte('starts_at', since)
        .order('starts_at', { ascending: true })
        .limit(200);
      if (error || !data) return [];
      return (data as DbEvent[]).map(mapDbEvent);
    } catch {
      return [];
    }
  },
  ['place-events-published-v1'],
  { tags: ['place-events'], revalidate: 300 },
);

/** Published, non-expired-ish events (cache-safe public data). */
export async function getPublishedEvents(): Promise<PlaceEvent[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [];
  return loadPublished();
}

export async function getEventBySlug(slug: string): Promise<PlaceEvent | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !slug) return null;
  try {
    const sb = createPublicClient();
    const { data } = await sb.from('place_events').select(SELECT).eq('slug', slug).eq('status', 'published').maybeSingle();
    return data ? mapDbEvent(data as DbEvent) : null;
  } catch {
    return null;
  }
}

/** Admin: every event including drafts (service-role; caller must be admin). */
export async function getAllEventsAdmin(): Promise<PlaceEvent[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [];
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();
    const { data } = await admin.from('place_events').select(SELECT).order('starts_at', { ascending: false }).limit(500);
    return (data ?? []).map((r) => mapDbEvent(r as DbEvent));
  } catch {
    return [];
  }
}

export function revalidateEvents(): void {
  revalidateTag('place-events');
}
