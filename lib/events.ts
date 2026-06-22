// Pure event logic for the Explore platform, evaluated in Japan time
// (Asia/Tokyo, UTC+9, no DST → a fixed +9h offset is exact). No DOM / Next /
// Supabase deps so it is unit-testable with an injectable `now`.
//
// Rules enforced here (the rest of the app must not re-derive them):
//   • Expired events (their effective end is in the past) are NEVER "upcoming".
//   • Cancelled events keep their bucket but are flagged so the UI can label
//     them — they are never silently shown as if happening.
//   • "today" / "this weekend" are computed on the JST CALENDAR, not the
//     viewer's local clock.

export type EventStatus = 'draft' | 'published';
export type EventPriceType = 'free' | 'paid' | 'varies';
export type EventView = 'today' | 'weekend' | 'upcoming' | 'free' | 'all';

export interface PlaceEvent {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  /** Optional link to a place in `places` (by slug). */
  placeSlug: string | null;
  venue: string | null;
  area: string | null;
  prefecture: string | null;
  /** ISO timestamptz (UTC). Required. */
  startsAt: string;
  /** ISO timestamptz (UTC). Null = single-instant / unknown end. */
  endsAt: string | null;
  priceType: EventPriceType | null;
  priceMin: number | null;
  priceMax: number | null;
  currency: string | null;
  sourceUrl: string | null;
  registrationUrl: string | null;
  lastVerifiedAt: string | null;
  status: EventStatus;
  isCancelled: boolean;
}

const MS_PER_DAY = 86_400_000;
const JST_OFFSET_MS = 9 * 3_600_000;

/** Day number since the Unix epoch in the JST calendar (stable for date math). */
export function jstDayNumber(date: Date): number {
  return Math.floor((date.getTime() + JST_OFFSET_MS) / MS_PER_DAY);
}

/** JST weekday for an instant: 0 = Sunday … 6 = Saturday. */
export function jstWeekday(date: Date): number {
  return new Date(date.getTime() + JST_OFFSET_MS).getUTCDay();
}

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Effective end instant: explicit end, else the start (single-instant event). */
export function effectiveEnd(ev: PlaceEvent): Date | null {
  return parseDate(ev.endsAt) ?? parseDate(ev.startsAt);
}

/** An event is expired once its effective end has passed (instant comparison). */
export function isExpired(ev: PlaceEvent, now: Date = new Date()): boolean {
  const end = effectiveEnd(ev);
  if (!end) return false; // unparseable date → don't hide it; surface for review
  return end.getTime() < now.getTime();
}

export function isFree(ev: PlaceEvent): boolean {
  return ev.priceType === 'free' || (ev.priceMin === 0 && (ev.priceMax === 0 || ev.priceMax == null));
}

/** Inclusive [satDay, sunDay] JST day numbers for the current/nearest weekend. */
export function weekendRange(now: Date = new Date()): { satDay: number; sunDay: number } {
  const today = jstDayNumber(now);
  const wd = jstWeekday(now); // 0 Sun .. 6 Sat
  if (wd === 0) return { satDay: today - 1, sunDay: today };       // Sunday: weekend ends today
  const daysUntilSat = 6 - wd;                                      // Mon..Sat
  const satDay = today + daysUntilSat;
  return { satDay, sunDay: satDay + 1 };
}

/** Does the event's date span overlap a given inclusive JST day-number range? */
function overlapsDayRange(ev: PlaceEvent, fromDay: number, toDay: number): boolean {
  const start = parseDate(ev.startsAt);
  if (!start) return false;
  const startDay = jstDayNumber(start);
  const end = effectiveEnd(ev) ?? start;
  const endDay = jstDayNumber(end);
  return startDay <= toDay && endDay >= fromDay;
}

/** Happening on the JST calendar "today" (spans today), and not expired. */
export function isToday(ev: PlaceEvent, now: Date = new Date()): boolean {
  if (isExpired(ev, now)) return false;
  const today = jstDayNumber(now);
  return overlapsDayRange(ev, today, today);
}

/** Overlaps this/the nearest weekend (Sat–Sun), and not expired. */
export function isThisWeekend(ev: PlaceEvent, now: Date = new Date()): boolean {
  if (isExpired(ev, now)) return false;
  const { satDay, sunDay } = weekendRange(now);
  return overlapsDayRange(ev, satDay, sunDay);
}

/** Has not started yet (future start) — the strict "upcoming" meaning. */
export function isUpcoming(ev: PlaceEvent, now: Date = new Date()): boolean {
  const start = parseDate(ev.startsAt);
  if (!start) return false;
  return start.getTime() > now.getTime();
}

export type EventBucket = 'past' | 'today' | 'weekend' | 'upcoming';

/** Primary bucket (mutually exclusive), used for grouping. */
export function eventBucket(ev: PlaceEvent, now: Date = new Date()): EventBucket {
  if (isExpired(ev, now)) return 'past';
  if (isToday(ev, now)) return 'today';
  if (isThisWeekend(ev, now)) return 'weekend';
  return 'upcoming';
}

export interface EventFilterOpts {
  view?: EventView;
  prefecture?: string | null;
  free?: boolean;
  /** Include past/expired events (default false — expired are dropped). */
  includePast?: boolean;
  now?: Date;
}

/**
 * Filter a published-events list for a view. Expired events are dropped unless
 * `includePast`. `prefecture` + `free` compose with `view`.
 */
export function filterEvents(events: PlaceEvent[], opts: EventFilterOpts = {}): PlaceEvent[] {
  const now = opts.now ?? new Date();
  const view = opts.view ?? 'all';
  return events.filter((ev) => {
    if (!opts.includePast && isExpired(ev, now)) return false;
    if (opts.prefecture && ev.prefecture !== opts.prefecture) return false;
    if (opts.free && !isFree(ev)) return false;
    switch (view) {
      case 'today':    return isToday(ev, now);
      case 'weekend':  return isThisWeekend(ev, now);
      case 'upcoming': return !isExpired(ev, now); // any non-expired, sorted by start
      case 'free':     return isFree(ev);
      case 'all':      return true;
    }
  });
}

/** Soonest first; cancelled sink below live events sharing the same start. */
export function sortEvents(events: PlaceEvent[]): PlaceEvent[] {
  return [...events].sort((a, b) => {
    const ta = parseDate(a.startsAt)?.getTime() ?? Infinity;
    const tb = parseDate(b.startsAt)?.getTime() ?? Infinity;
    if (ta !== tb) return ta - tb;
    return Number(a.isCancelled) - Number(b.isCancelled);
  });
}

/** "Starting soon" within `withinMinutes` (for the event-soon reminder). */
export function startsSoon(ev: PlaceEvent, withinMinutes: number, now: Date = new Date()): boolean {
  if (ev.isCancelled || ev.status !== 'published') return false;
  const start = parseDate(ev.startsAt);
  if (!start) return false;
  const diffMin = (start.getTime() - now.getTime()) / 60_000;
  return diffMin > 0 && diffMin <= withinMinutes;
}
