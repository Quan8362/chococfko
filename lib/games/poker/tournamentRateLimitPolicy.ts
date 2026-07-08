import { createHash } from 'crypto'

// ─────────────────────────────────────────────────────────────────────────────
// Tournament rate-limit POLICY (pure — no server-only / no Supabase).
//
// This is the reviewable, unit-testable half of the tournament rate limiter. The
// server wrapper (lib/games/poker/tournamentRateLimit.ts) enforces it at runtime
// via the atomic SECURITY DEFINER RPC `poker_tournament_rate_limit_hit`; the SQL
// is authoritative under concurrency. `tokenBucketDecision` here mirrors that SQL
// exactly so the bucket math can be tested deterministically without a database
// (the same split the Explore limiter uses: rateLimitPolicy.ts ↔ rate_limit_hit).
//
// ALGORITHM: token bucket. Each subject holds up to `capacity` tokens (the BURST
// allowance) that refill continuously at `refillPerSec` (the SUSTAINED rate). A
// request costs one token; if fewer than one is available it is rejected with a
// precise retry delay. Token buckets — unlike a fixed window — express "≈R req/s
// with burst B" directly and give smooth, reconnect-friendly refill (no window
// edge that rejects a whole cluster of legitimate reconciles at once).
//
// PRIVACY: the stored subject is a sha256 of "tnmt:<family>:u:<userId>". Raw user
// IDs, emails, JWTs, cards, seeds and serialized state NEVER enter a key or log.
//
// SPOOF-RESISTANCE: the identity in every enforced key is the SERVER-trusted
// authenticated user id (from supabase.auth.getUser()), never a client value. No
// client-supplied field (tournamentId, handId, tableNo) is part of an enforced
// key — otherwise an attacker could mint unlimited fresh buckets by rotating a
// fake id and defeat the limiter. Gameplay buckets are therefore per-user-global
// by deliberate design (a participant is seated at exactly one tournament table
// at internal-alpha, so there is no legitimate cross-tournament contention).
// ─────────────────────────────────────────────────────────────────────────────

export type TnmtRateFamily =
  | 'tnmt_action'    // submitTournamentAction — live betting (hot mutation)
  | 'tnmt_view'      // getTournamentTableView — reconcile/watchdog read (auto-advances)
  | 'tnmt_ensure'    // ensureTournamentTableHand — participant next-hand open
  | 'tnmt_register'  // register / unregister
  | 'tnmt_create'    // createTournament (operator)
  | 'tnmt_operator'  // operator lifecycle mutations (transition/draw/advance/deal/settle/recover)

/**
 * failMode:
 *  - 'closed' → a limiter-backend outage REJECTS the request (mutations must never
 *               fall back to unthrottled: fail-closed is the safe default for writes).
 *  - 'open'   → a limiter-backend outage ALLOWS the request (reads stay reconnect-
 *               tolerant: a limiter outage must never block legitimate recovery).
 */
export type TnmtRateFailMode = 'open' | 'closed'

export interface TnmtRatePolicy {
  readonly family: TnmtRateFamily
  /** BURST: max tokens the bucket holds. */
  readonly capacity: number
  /** SUSTAINED rate: tokens replenished per second. */
  readonly refillPerSec: number
  readonly failMode: TnmtRateFailMode
  /** Human-readable rationale (documented, not arbitrary). */
  readonly rationale: string
}

// Final chosen limits (validated against the I2 recommendations + real client cadence:
// useTournamentTable pumps reconcile at ~0.67/s idle, watchdog 12s, plus realtime echoes;
// a human bettor clicks ≤1–2 actions/s). Each is generous for legitimate play yet bounds
// abuse to a small constant per user.
export const TNMT_RATE_POLICIES: Record<TnmtRateFamily, TnmtRatePolicy> = {
  // ≈10 req/s sustained, burst 20. Absorbs rapid legitimate multi-street action while
  // capping a spammer at 10/s. MUTATION → fail-closed.
  tnmt_action: {
    family: 'tnmt_action', capacity: 20, refillPerSec: 10, failMode: 'closed',
    rationale: 'Live betting: humans click ≤1–2/s; 10/s sustained + burst 20 never blocks legit play, hard-caps spam.',
  },
  // ≈5 req/s sustained, burst 10. Covers reconcile + watchdog + realtime echoes + a
  // reconnect double-fire. READ → fail-open so a limiter outage never blocks recovery.
  tnmt_view: {
    family: 'tnmt_view', capacity: 10, refillPerSec: 5, failMode: 'open',
    rationale: 'Reconcile/watchdog reads: fail-open + generous burst keep reconnect recovery usable during a limiter outage.',
  },
  // Opens hands; tightly bounded. ≈0.5/s (30/min) sustained, burst 6. MUTATION → fail-closed.
  tnmt_ensure: {
    family: 'tnmt_ensure', capacity: 6, refillPerSec: 0.5, failMode: 'closed',
    rationale: 'Participant next-hand open is idempotent + resource-heavy; bound tightly per user.',
  },
  // ≈5/min. MUTATION → fail-closed.
  tnmt_register: {
    family: 'tnmt_register', capacity: 5, refillPerSec: 5 / 60, failMode: 'closed',
    rationale: 'Register/unregister churn: ~5/min per user is far above any legitimate need.',
  },
  // ≈3/min. Operator-only, expensive insert. MUTATION → fail-closed.
  tnmt_create: {
    family: 'tnmt_create', capacity: 3, refillPerSec: 3 / 60, failMode: 'closed',
    rationale: 'Tournament creation is rare and heavy; low per-minute cap even for operators.',
  },
  // ≈30/min, burst 10. Operator lifecycle mutations. MUTATION → fail-closed.
  tnmt_operator: {
    family: 'tnmt_operator', capacity: 10, refillPerSec: 0.5, failMode: 'closed',
    rationale: 'Operator lifecycle ops (transition/draw/advance/deal/settle/recover): generous for real ops, bounds abuse.',
  },
}

export function getTnmtRatePolicy(family: TnmtRateFamily): TnmtRatePolicy {
  return TNMT_RATE_POLICIES[family]
}

/**
 * Opaque, privacy-preserving subject key. Pure + deterministic.
 * `identity` MUST be a server-trusted value (the authenticated user id) — callers
 * pass it prefixed (e.g. "u:<uuid>"). The raw value never survives the hash.
 */
export function tnmtRateSubject(family: TnmtRateFamily, identity: string): string {
  const digest = createHash('sha256').update(`${family}|${identity}`).digest('hex').slice(0, 32)
  return `${family}:${digest}`
}

export interface BucketState {
  /** tokens available at `updatedAtMs`. */
  readonly tokens: number
  /** last-touch timestamp (ms since epoch, server clock). */
  readonly updatedAtMs: number
}

export interface BucketDecision {
  readonly allowed: boolean
  /** tokens remaining AFTER this request (post-refill, post-consume). */
  readonly tokensAfter: number
  /** ms until at least one token is available again (0 when allowed). */
  readonly retryAfterMs: number
}

/**
 * Pure reference implementation of the token-bucket decision. Mirrors the SQL
 * `poker_tournament_rate_limit_hit()` EXACTLY (same refill + clamp + cost = 1
 * math) so the DB behaviour is deterministically testable here. The DB is
 * authoritative + atomic at runtime; this documents the math and guards regressions.
 *
 * `state` is the bucket BEFORE this request (a brand-new subject starts full:
 * { tokens: capacity, updatedAtMs: nowMs }).
 */
export function tokenBucketDecision(
  state: BucketState,
  policy: TnmtRatePolicy,
  nowMs: number,
): BucketDecision {
  const elapsedSec = Math.max(0, (nowMs - state.updatedAtMs) / 1000)
  const refilled = Math.min(policy.capacity, state.tokens + elapsedSec * policy.refillPerSec)
  if (refilled >= 1) {
    return { allowed: true, tokensAfter: refilled - 1, retryAfterMs: 0 }
  }
  const deficit = 1 - refilled
  const retryAfterMs = Math.max(1, Math.ceil((deficit / policy.refillPerSec) * 1000))
  return { allowed: false, tokensAfter: refilled, retryAfterMs }
}
