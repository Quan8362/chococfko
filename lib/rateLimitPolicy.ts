import { createHash } from 'crypto'

// Pure (no server-only / no Supabase) rate-limit policy + subject keying so it
// is unit-testable and importable from both the DB limiter and tests.

export type RateLimitAction =
  | 'place_report'
  | 'place_question'
  | 'place_answer'
  | 'place_comment'
  | 'helpful_mark'
  | 'visit_mark'
  | 'list_write'
  | 'plan_write'
  | 'share_token'
  | 'notif_pref'
  | 'save_toggle'

export type RateLimitPolicy = { limit: number; windowSec: number; requiresAuth: boolean }

// Rationale (documented, not arbitrary):
//   * Reports / Q&A / comments = main spam/abuse surface → tight caps.
//   * Helpful / visit marks = cheap but enumerable toggles → moderate.
//   * Saves / preference saves = normal high-frequency UX → generous ceiling.
//   * Share-token ops gate token churn.
export const RATE_LIMITS: Record<RateLimitAction, RateLimitPolicy> = {
  place_report:   { limit: 5,   windowSec: 3600, requiresAuth: true },
  place_question: { limit: 10,  windowSec: 3600, requiresAuth: true },
  place_answer:   { limit: 20,  windowSec: 3600, requiresAuth: true },
  place_comment:  { limit: 20,  windowSec: 3600, requiresAuth: true },
  helpful_mark:   { limit: 60,  windowSec: 3600, requiresAuth: true },
  visit_mark:     { limit: 60,  windowSec: 3600, requiresAuth: true },
  list_write:     { limit: 120, windowSec: 3600, requiresAuth: true },
  plan_write:     { limit: 120, windowSec: 3600, requiresAuth: true },
  share_token:    { limit: 30,  windowSec: 3600, requiresAuth: true },
  notif_pref:     { limit: 60,  windowSec: 3600, requiresAuth: true },
  save_toggle:    { limit: 240, windowSec: 3600, requiresAuth: false },
}

export function getPolicy(action: RateLimitAction): RateLimitPolicy {
  return RATE_LIMITS[action]
}

/** Opaque, privacy-preserving subject key. Pure + deterministic. */
export function hashSubject(action: RateLimitAction, identity: string): string {
  const digest = createHash('sha256').update(identity).digest('hex').slice(0, 32)
  return `${action}:${digest}`
}

export type SubjectResolution =
  | { ok: true; subject: string }
  | { ok: false; error: 'auth_required' }

/** Resolve the hashed subject from the available identity. Pure. */
export function resolveSubject(
  action: RateLimitAction,
  ids: { userId?: string | null; guestToken?: string | null },
): SubjectResolution {
  const policy = RATE_LIMITS[action]
  if (ids.userId) return { ok: true, subject: hashSubject(action, `u:${ids.userId}`) }
  if (policy.requiresAuth) return { ok: false, error: 'auth_required' }
  if (ids.guestToken) return { ok: true, subject: hashSubject(action, `g:${ids.guestToken}`) }
  return { ok: false, error: 'auth_required' }
}

/**
 * Reference implementation of the fixed-window decision that mirrors the SQL
 * `rate_limit_hit()` function. The DB is authoritative at runtime; this exists
 * for deterministic unit tests and to document the bucket math.
 *
 * `count` = the post-increment hit count for the current window.
 */
export function fixedWindowDecision(
  count: number,
  policy: RateLimitPolicy,
  nowMs: number,
): { allowed: boolean; retryAfterSec: number } {
  const windowMs = policy.windowSec * 1000
  const bucketStartMs = Math.floor(nowMs / windowMs) * windowMs
  const nextBucketMs = bucketStartMs + windowMs
  if (count <= policy.limit) return { allowed: true, retryAfterSec: 0 }
  return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((nextBucketMs - nowMs) / 1000)) }
}
