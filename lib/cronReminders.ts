import { timingSafeEqual } from 'crypto'

// Pure helpers for the return-user reminder cron. Kept free of server-only /
// Supabase imports so the window-keying + auth logic is unit-testable.

/** YYYY-MM-DD for the given instant in Asia/Tokyo (product uses Japan-local dates). */
export function jstDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/**
 * Dedup window key for a plan reminder: one reminder per plan per JST day. Re-runs
 * of the cron within the same day map to the same key → no duplicate delivery.
 */
export function planWindowKey(now: Date = new Date()): string {
  return jstDate(now)
}

/**
 * Dedup window key for an event-soon reminder: one reminder per event per JST day.
 * (event_soon only fires inside the start window, so a JST-day bucket is enough to
 * prevent every cron tick re-notifying the same savers.)
 */
export function eventWindowKey(now: Date = new Date()): string {
  return jstDate(now)
}

/**
 * Constant-time bearer-secret check. Returns false when the secret is unset or the
 * header is missing/incorrect. Never throws and never logs the secret.
 */
export function isAuthorizedCron(authHeader: string | null, secret: string | undefined): boolean {
  if (!secret) return false
  const expected = `Bearer ${secret}`
  if (typeof authHeader !== 'string' || authHeader.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
  } catch {
    return false
  }
}
