import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  RATE_LIMITS,
  resolveSubject,
  type RateLimitAction,
} from '@/lib/rateLimitPolicy'

// ─────────────────────────────────────────────────────────────────────────────
// Distributed, DB-backed rate limiting for abuse-prone Explore write paths.
//
// Authoritative counting happens in Postgres via the atomic `rate_limit_hit()`
// SECURITY DEFINER function (migration_rate_limits.sql) so the limit is shared
// across every serverless instance — unlike the per-instance in-memory limiter
// in lib/japanese/rateLimit.ts.
//
// PRIVACY: never persists raw IPs or raw user IDs — the stored subject is a
// sha256 of "action:identity" (see lib/rateLimitPolicy.ts).
// ─────────────────────────────────────────────────────────────────────────────

export { RATE_LIMITS, getPolicy } from '@/lib/rateLimitPolicy'
export type { RateLimitAction, RateLimitPolicy } from '@/lib/rateLimitPolicy'

export type RateLimitResult = {
  ok: boolean
  retryAfterSec: number
  /** localized-message KEY the caller looks up via next-intl. */
  messageKey: 'rate_limit.exceeded' | null
  reason?: 'auth_required' | 'limited' | 'error'
}

const ALLOW: RateLimitResult = { ok: true, retryAfterSec: 0, messageKey: null }

/**
 * Enforce a rate limit. Returns `{ ok:false }` when the caller is over the cap.
 * Fails OPEN (allows + logs) if the DB is unreachable so a limiter outage never
 * hard-breaks a legitimate write — upstream auth/RLS checks still apply.
 */
export async function checkRateLimit(
  action: RateLimitAction,
  ids: { userId?: string | null; guestToken?: string | null },
): Promise<RateLimitResult> {
  const policy = RATE_LIMITS[action]
  const subj = resolveSubject(action, ids)
  if (!subj.ok) {
    return { ok: false, retryAfterSec: 0, messageKey: null, reason: 'auth_required' }
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('rate_limit_hit', {
      p_subject: subj.subject,
      p_window_seconds: policy.windowSec,
      p_limit: policy.limit,
    })
    if (error) {
      console.error('[rateLimitDb] rpc error (fail-open):', error.message)
      return ALLOW
    }
    const row = Array.isArray(data) ? data[0] : data
    const allowed = row?.allowed !== false
    if (allowed) return ALLOW
    return {
      ok: false,
      retryAfterSec: Number(row?.retry_after ?? policy.windowSec),
      messageKey: 'rate_limit.exceeded',
      reason: 'limited',
    }
  } catch (err) {
    console.error('[rateLimitDb] unexpected error (fail-open):', err)
    return ALLOW
  }
}
