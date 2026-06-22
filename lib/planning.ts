// Pure trip-planning logic: reorder, straight-line distances, and non-blocking
// warnings (opening-hour conflicts, time overlaps, missing data). No routing —
// distances are honest straight-line approximations only.
import { haversineKm } from './geo.ts';
import { openStatus, jstParts } from './placeOpenNow.ts';

/** Move an array item from one index to another (immutable, bounds-safe). */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const copy = arr.slice();
  if (from === to || from < 0 || to < 0 || from >= copy.length || to >= copy.length) return copy;
  const [it] = copy.splice(from, 1);
  copy.splice(to, 0, it);
  return copy;
}

export interface PlanStopInput {
  slug: string;
  lat?: number | null;
  lng?: number | null;
  openingHours?: Record<string, unknown> | null;
  closedDays?: string[] | null;
  temporaryStatus?: string | null;
  reservationRequired?: boolean | null;
  verificationStatus?: string | null;
  lastVerifiedAt?: string | null;
  arrivalTime?: string | null;   // 'HH:MM'
  departureTime?: string | null; // 'HH:MM'
}

export type StopWarning =
  | 'closed_on_day' | 'arrival_outside_hours' | 'hours_unknown' | 'reservation_required'
  | 'missing_coordinates' | 'temporarily_closed' | 'not_verified_recently';
export type PlanWarning = 'time_overlap' | 'large_distance';

export interface StopAnalysis {
  slug: string;
  warnings: StopWarning[];
  distanceFromPrevKm: number | null;
  overlapsWithPrev: boolean;
}
export interface PlanAnalysis {
  stops: StopAnalysis[];
  planWarnings: PlanWarning[];
}

export interface PlanAnalysisOpts {
  planDate?: string | null;       // 'YYYY-MM-DD' (Asia/Tokyo)
  largeDistanceKm?: number;       // default 15
  staleVerifyDays?: number;       // default 365
  now?: Date;
}

function toMin(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{2}):(\d{2})/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Build a JST-wall-clock Date from a date string (+ optional time). */
function jstDate(dateStr: string, timeStr?: string | null): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!dm) return null;
  const y = Number(dm[1]); const mo = Number(dm[2]); const d = Number(dm[3]);
  let hh = 12; let mi = 0;
  const tm = timeStr ? /^(\d{2}):(\d{2})/.exec(timeStr) : null;
  if (tm) { hh = Number(tm[1]); mi = Number(tm[2]); }
  return new Date(Date.UTC(y, mo - 1, d, hh, mi) - 9 * 3600_000);
}

function dayIsClosed(oh: Record<string, unknown> | null | undefined, closedDays: string[] | null | undefined, weekday: string): boolean {
  if (closedDays?.includes(weekday)) return true;
  const slots = oh?.[weekday];
  return Array.isArray(slots) && slots.length === 0; // explicit empty = closed; absent = unknown
}

function analyzeStop(s: PlanStopInput, opts: Required<Pick<PlanAnalysisOpts, 'staleVerifyDays' | 'now'>> & { planDate?: string | null }): StopWarning[] {
  const w: StopWarning[] = [];
  const hasCoords = typeof s.lat === 'number' && typeof s.lng === 'number';
  if (!hasCoords) w.push('missing_coordinates');
  if (s.temporaryStatus === 'temporarily_closed' || s.temporaryStatus === 'permanently_closed') w.push('temporarily_closed');
  if (s.reservationRequired === true) w.push('reservation_required');

  // Not verified recently: no recorded verification, or older than the threshold.
  const verifiedAt = s.lastVerifiedAt ? Date.parse(s.lastVerifiedAt) : NaN;
  const stale = Number.isNaN(verifiedAt) || (opts.now.getTime() - verifiedAt) > opts.staleVerifyDays * 86_400_000;
  if (stale && s.verificationStatus !== 'verified') w.push('not_verified_recently');

  // Opening-hour checks.
  if (!s.openingHours) {
    w.push('hours_unknown');
  } else if (opts.planDate) {
    const dayDate = jstDate(opts.planDate, s.arrivalTime);
    if (dayDate) {
      const { weekday } = jstParts(dayDate);
      if (dayIsClosed(s.openingHours, s.closedDays, weekday)) {
        w.push('closed_on_day');
      } else if (s.arrivalTime) {
        const st = openStatus(s.openingHours, s.closedDays, { now: dayDate, temporaryStatus: s.temporaryStatus });
        if (st === 'hours_unknown') w.push('hours_unknown');
        else if (st === 'closed' || st === 'opens_later') w.push('arrival_outside_hours');
      }
    }
  }
  return w;
}

export function analyzePlan(stops: PlanStopInput[], opts: PlanAnalysisOpts = {}): PlanAnalysis {
  const planDate = opts.planDate ?? null;
  const largeKm = opts.largeDistanceKm ?? 15;
  const staleVerifyDays = opts.staleVerifyDays ?? 365;
  const now = opts.now ?? new Date();

  const out: StopAnalysis[] = [];
  const planWarnings = new Set<PlanWarning>();

  stops.forEach((s, i) => {
    const prev = i > 0 ? stops[i - 1] : null;
    let dist: number | null = null;
    if (prev && typeof prev.lat === 'number' && typeof prev.lng === 'number' && typeof s.lat === 'number' && typeof s.lng === 'number') {
      dist = haversineKm({ lat: prev.lat, lng: prev.lng }, { lat: s.lat, lng: s.lng });
      if (dist > largeKm) planWarnings.add('large_distance');
    }
    let overlap = false;
    const prevDep = toMin(prev?.departureTime);
    const arr = toMin(s.arrivalTime);
    if (prevDep != null && arr != null && arr < prevDep) { overlap = true; planWarnings.add('time_overlap'); }

    out.push({ slug: s.slug, warnings: analyzeStop(s, { staleVerifyDays, now, planDate }), distanceFromPrevKm: dist, overlapsWithPrev: overlap });
  });

  return { stops: out, planWarnings: Array.from(planWarnings) };
}
