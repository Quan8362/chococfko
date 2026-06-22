// Pure "open now" logic for places, evaluated in Japan time (Asia/Tokyo, UTC+9,
// no DST). Works on the structured opening_hours JSON produced in Phase 1:
//   { mon:[{open:"09:00",close:"18:00"}], ..., sun:[], ph:[...], notes:"" }
// A weekday key absent → unknown for that day. Slots with close <= open wrap
// past midnight (e.g. 18:00–02:00). closed_days forces that weekday closed.

// Loosely typed (the stored JSON is Record<string, unknown>); shapes are checked
// at runtime via Array.isArray + HH:MM validation.
export type OpeningHours = Record<string, unknown>;

const ORDER = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export interface JstParts { weekday: string; minutes: number }

/** Wall-clock weekday + minutes-since-midnight in Asia/Tokyo for a given instant. */
export function jstParts(date: Date = new Date()): JstParts {
  const shifted = new Date(date.getTime() + 9 * 3600_000); // +9h, then read UTC fields
  return { weekday: ORDER[shifted.getUTCDay()], minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
}

function toMin(hhmm: unknown): number | null {
  if (typeof hhmm !== 'string') return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function slotsFor(oh: OpeningHours, day: string): { open?: string; close?: string }[] | undefined {
  const v = oh[day];
  return Array.isArray(v) ? (v as { open?: string; close?: string }[]) : undefined;
}

const prevDay = (d: string) => ORDER[(ORDER.indexOf(d as (typeof ORDER)[number]) + 6) % 7];

/**
 * Is the place open at `now` (JST)?
 *   true  — within an opening slot
 *   false — known hours but currently closed
 *   null  — unknown (no hours data for the relevant day)
 */
export function isOpenNow(
  openingHours: OpeningHours | null | undefined,
  closedDays?: string[] | null,
  now: Date = new Date(),
): boolean | null {
  if (!openingHours || typeof openingHours !== 'object') return null;
  const { weekday, minutes } = jstParts(now);
  const closed = new Set(closedDays ?? []);

  const today = slotsFor(openingHours, weekday);
  const yest = slotsFor(openingHours, prevDay(weekday));
  if (today === undefined && yest === undefined) return null; // no data either day

  if (!closed.has(weekday) && today) {
    for (const s of today) {
      const o = toMin(s.open);
      const c = toMin(s.close);
      if (o === null || c === null) continue;
      if (c > o) { if (minutes >= o && minutes < c) return true; }
      else if (minutes >= o) return true; // wraps past midnight: open from o until 24:00+
    }
  }
  // A slot from yesterday that wraps past midnight may still be open early today.
  if (yest && !closed.has(prevDay(weekday))) {
    for (const s of yest) {
      const o = toMin(s.open);
      const c = toMin(s.close);
      if (o === null || c === null) continue;
      if (c <= o && minutes < c) return true;
    }
  }
  return false;
}

// ── Explicit open-now state machine (for badges) ────────────────────
// States: open | closing_soon | closed | opens_later | temporarily_closed |
//         hours_unknown. Never returns a definite open/closed when hours for the
// relevant day are unknown — it returns 'hours_unknown' instead.
export type OpenState = 'open' | 'closing_soon' | 'closed' | 'opens_later' | 'temporarily_closed' | 'hours_unknown';

export interface OpenStatusOpts {
  now?: Date;
  /** From places.temporary_status — overrides hours when temporarily/permanently closed. */
  temporaryStatus?: string | null;
  /** Minutes-before-close that count as "closing soon" (default 30). */
  closingSoonMins?: number;
  /** If today is a public holiday and an `ph` slot list exists, use it. */
  isHoliday?: boolean;
}

/**
 * Logic (Asia/Tokyo):
 *  1. temporary/permanent closure → 'temporarily_closed'.
 *  2. no hours object → 'hours_unknown'.
 *  3. pick day slots (holiday→`ph` if present, else weekday). closed_days marks
 *     a weekday explicitly closed.
 *  4. if inside a slot (incl. overnight wrap from yesterday): 'closing_soon' when
 *     ≤ closingSoonMins to close, else 'open'.
 *  5. otherwise: if today's hours are UNKNOWN (key absent and not a closing day)
 *     → 'hours_unknown'; if a later slot opens today → 'opens_later'; else 'closed'.
 */
export function openStatus(
  openingHours: OpeningHours | null | undefined,
  closedDays: string[] | null | undefined,
  opts: OpenStatusOpts = {},
): OpenState {
  const { now = new Date(), temporaryStatus, closingSoonMins = 30, isHoliday = false } = opts;
  if (temporaryStatus === 'temporarily_closed' || temporaryStatus === 'permanently_closed') return 'temporarily_closed';
  if (!openingHours || typeof openingHours !== 'object') return 'hours_unknown';

  const { weekday, minutes } = jstParts(now);
  const closed = new Set(closedDays ?? []);
  const dayKey = isHoliday && Array.isArray(openingHours.ph) ? 'ph' : weekday;
  const today = slotsFor(openingHours, dayKey);
  const yest = slotsFor(openingHours, prevDay(weekday));
  if (today === undefined && yest === undefined) return 'hours_unknown';

  // (4) currently inside a slot?
  if (!closed.has(weekday) && today) {
    for (const s of today) {
      const o = toMin(s.open);
      const c = toMin(s.close);
      if (o === null || c === null) continue;
      const within = c > o ? minutes >= o && minutes < c : minutes >= o;
      if (within) {
        const closeMin = c > o ? c : c + 1440; // overnight: close is next day
        return closeMin - minutes <= closingSoonMins ? 'closing_soon' : 'open';
      }
    }
  }
  if (yest && !closed.has(prevDay(weekday))) {
    for (const s of yest) {
      const o = toMin(s.open);
      const c = toMin(s.close);
      if (o === null || c === null) continue;
      if (c <= o && minutes < c) return c - minutes <= closingSoonMins ? 'closing_soon' : 'open';
    }
  }

  // (5) not open now
  const todayKnown = today !== undefined || closed.has(weekday);
  if (!todayKnown) return 'hours_unknown';
  if (today) {
    for (const s of today) {
      const o = toMin(s.open);
      if (o !== null && o > minutes) return 'opens_later';
    }
  }
  return 'closed';
}
