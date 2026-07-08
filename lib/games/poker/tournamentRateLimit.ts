import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  TNMT_RATE_POLICIES,
  tnmtRateSubject,
  type TnmtRateFamily,
} from './tournamentRateLimitPolicy'

// ─────────────────────────────────────────────────────────────────────────────
// Server-only enforcement for the Tournament rate limiter.
//
// Runs BEFORE the expensive DB work in each tournament server action, keyed by
// the SERVER-trusted authenticated user id. Authoritative counting is atomic in
// Postgres via `poker_tournament_rate_limit_hit` (migration_poker_tournament_
// rate_limits.sql), so the cap is shared across every serverless instance.
//
// FAIL MODE (per policy):
//   * mutations  → fail-CLOSED: a limiter-backend outage rejects the request, so
//                  a limiter failure can never open the floodgates on writes.
//   * reads      → fail-OPEN: a limiter-backend outage allows the request, so a
//                  limiter outage never blocks legitimate reconnect/recovery reads.
//
// The RPC is called through the service-role admin client only; browser code can
// neither reach the service role nor call the function (granted to service_role).
// No private data (ids, cards, seeds, tokens) ever enters a key, error, or log.
// ─────────────────────────────────────────────────────────────────────────────

export type { TnmtRateFamily } from './tournamentRateLimitPolicy'
export { TNMT_RATE_POLICIES } from './tournamentRateLimitPolicy'

export interface TnmtRateResult {
  /** true = admitted; false = throttled (do the work only when ok). */
  readonly ok: boolean
  /** ms the caller should wait before retrying (0 when admitted). */
  readonly retryAfterMs: number
  /** stable, user-safe error code (only when rejected). */
  readonly code: 'rate_limited' | null
  /** internal classification for logs/telemetry (never returned to the browser as-is). */
  readonly reason: 'ok' | 'limited' | 'backend_error' | 'no_identity'
}

const ADMIT: TnmtRateResult = { ok: true, retryAfterMs: 0, code: null, reason: 'ok' }

function reject(retryAfterMs: number, reason: TnmtRateResult['reason']): TnmtRateResult {
  return { ok: false, retryAfterMs: Math.max(1, retryAfterMs), code: 'rate_limited', reason }
}

/**
 * Enforce the tournament rate limit for `family` on the authenticated `userId`.
 * Returns `{ ok:false, code:'rate_limited', retryAfterMs }` when throttled.
 */
export async function checkTnmtRateLimit(
  family: TnmtRateFamily,
  userId: string | null | undefined,
): Promise<TnmtRateResult> {
  const policy = TNMT_RATE_POLICIES[family]
  // No trusted identity ⇒ apply the family's fail mode (mutations closed, reads open).
  if (!userId) {
    return policy.failMode === 'open' ? ADMIT : reject(1000, 'no_identity')
  }

  const subject = tnmtRateSubject(family, `u:${userId}`)
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('poker_tournament_rate_limit_hit', {
      p_subject: subject,
      p_capacity: policy.capacity,
      p_refill_per_sec: policy.refillPerSec,
    })
    if (error) {
      // Backend error → honor fail mode. Log the family only (never the subject/user).
      console.error(`[tnmtRateLimit] rpc error family=${family} (fail-${policy.failMode})`)
      return policy.failMode === 'open' ? ADMIT : reject(1000, 'backend_error')
    }
    const row = Array.isArray(data) ? data[0] : data
    if (row?.allowed === false) {
      return reject(Number(row?.retry_after_ms ?? 1000), 'limited')
    }
    return ADMIT
  } catch {
    console.error(`[tnmtRateLimit] unexpected error family=${family} (fail-${policy.failMode})`)
    return policy.failMode === 'open' ? ADMIT : reject(1000, 'backend_error')
  }
}
