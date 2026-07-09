// ── Poker PUBLIC TOURNAMENT rollout — PURE deterministic gate ─────────────────────────────────
//
// The controlled public rollout of the Tournament surface (Prompt 27G-N). PURE — no process.env /
// DB / browser imports — so it is unit-testable and importable from anywhere. The server wrapper
// that reads the real env + the viewer lives in `app/games/poker/access.ts`.
//
// It is the SMALLEST safe deterministic gate that opens the public heads-up Tournament surface to a
// controlled fraction of AUTHENTICATED users, in explicit manually-advanced stages (0 → 5 → 10 → 25
// → 50 → 100). It NEVER touches the internal-alpha / Closed-Beta paths (those resolve entirely in flags.ts
// + beta.ts and are unchanged), NEVER opens a cash-seating capability, and NEVER moves coins.
//
// Two independent ops levers, both fail-closed:
//   • POKER_TOURNAMENT_PUBLIC_ENABLED — the MASTER KILL SWITCH (boolean, default OFF). When OFF the
//     public rollout is entirely inert regardless of the percentage — the emergency "return to 0"
//     lever. It ALSO arms the public heads-up launch-shape enforcement (see access.ts), so a public
//     tournament can never be created in any shape but heads-up single-table.
//   • POKER_TOURNAMENT_PUBLIC_ROLLOUT — the rollout PERCENTAGE (integer, default 0). Only the exact
//     values {0,5,10,25,50,100} are allowed; anything missing / malformed / out-of-range resolves to
//     0 (fail closed). The phase ceiling caps the maximum ACTIVATABLE percentage: a configured value
//     ABOVE the ceiling is not activatable and resolves to an EFFECTIVE 0 (fail closed). Raising the
//     ceiling is a deliberate reviewed code change (27G-O lifted it to 100 for full public rollout),
//     never an env-only action — so the top stage cannot be reached by configuration alone.
//
// Bucketing is deterministic and stable: derived ONLY from the server-resolved, stable, opaque auth
// user id (a UUID). It never reads email, display name, IP, cookie, or any client-supplied value, so
// the same user always receives the same decision and no user can move themselves into the rollout.

// Env keys (documentation + the server resolver read these).
export const PUBLIC_ROLLOUT_ENABLED_ENV = 'POKER_TOURNAMENT_PUBLIC_ENABLED'
export const PUBLIC_ROLLOUT_PCT_ENV = 'POKER_TOURNAMENT_PUBLIC_ROLLOUT'

// ── Temporary tester allowlist (27G-N Stage 3A) ──────────────────────────────────────────────────
// A SMALLEST-possible, server-only, fail-closed lever to admit a tiny set of explicitly-approved
// auth ids to the public tournament surface WITHOUT changing the rollout percentage — so a single
// controlled real tournament can be verified before widening the deterministic bucket beyond 25%.
// It admits VISIBILITY only: it never confers operator/admin rights, never relaxes the heads-up
// launch shape, rate limits, privacy, or economy checks (all enforced independently), and the master
// kill switch + authentication + suspension checks all still apply. Dormant ([]) by default.
export const PUBLIC_TESTER_IDS_ENV = 'POKER_TOURNAMENT_PUBLIC_TESTER_IDS'

// During this phase at most this many ids may be listed. More VALID ids than this is treated as a
// misconfiguration and fails closed to an EMPTY allowlist rather than silently admitting a wider set.
export const PUBLIC_TESTER_MAX = 2

// The ONLY percentages that may ever be configured. Anything else fails closed to 0.
export const ALLOWED_ROLLOUT_PCTS = [0, 5, 10, 25, 50, 100] as const
export type RolloutPct = (typeof ALLOWED_ROLLOUT_PCTS)[number]

// Phase ceiling: the maximum ACTIVATABLE percentage. A configured percentage ABOVE this is not
// activatable and resolves to an effective 0 (fail closed). Raising this is a deliberate, reviewed
// change — never an env-only action. 27G-N held it at 50; 27G-O lifts it to 100 (the top allowed
// value) for full public rollout, so a configured 100 is now activatable while still-invalid values
// above 100 remain rejected at parse (parseRolloutPct) — the ceiling never widens the allowed set.
export const ROLLOUT_PHASE_CEILING = 100 as const

// Only an explicit affirmative turns the master switch on. Everything else — unset, empty, '0',
// 'false', 'off', a typo — resolves OFF. Mirrors flags.ts `truthy` for one ops mental model.
function truthy(v: string | undefined): boolean {
  if (!v) return false
  const s = v.trim().toLowerCase()
  return s === '1' || s === 'true' || s === 'on' || s === 'yes'
}

// Parse & VALIDATE the configured percentage. Returns one of ALLOWED_ROLLOUT_PCTS, or 0 for anything
// missing / non-integer / out-of-range (fail closed). 100 is a valid CONFIGURED value here; whether
// it is ACTIVATABLE is decided separately by the phase ceiling (applied by effectiveRolloutPct).
export function parseRolloutPct(raw: string | undefined | null): RolloutPct {
  if (raw == null) return 0
  const s = String(raw).trim()
  if (!/^-?\d+$/.test(s)) return 0
  const n = Number.parseInt(s, 10)
  return (ALLOWED_ROLLOUT_PCTS as readonly number[]).includes(n) ? (n as RolloutPct) : 0
}

// The EFFECTIVE percentage after the phase ceiling: a configured value above the ceiling is not
// activatable and resolves to 0 (fail closed) rather than silently running at the ceiling.
export function effectiveRolloutPct(raw: string | undefined | null): RolloutPct {
  const pct = parseRolloutPct(raw)
  return pct > ROLLOUT_PHASE_CEILING ? 0 : pct
}

// Deterministic 0..99 bucket for a user. FNV-1a over a feature-scoped, stable, opaque user id — the
// SAME hash family used for tournament hand seeds. Feature-scoped so this rollout does not correlate
// with any other percentage rollout. Stable: a given user id always maps to the same bucket, so the
// rollout decision is idempotent across requests, sessions, and stage changes.
export function rolloutBucket(userId: string): number {
  const key = `poker_tournament_public:${userId}`
  let h = 2166136261 >>> 0
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % 100
}

// Strict canonical-UUID shape. The allowlist honours ONLY this exact form (case-insensitive); any
// other token fails the whole list closed. Kept local so no other value can accidentally match.
const TESTER_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// Parse the temporary tester allowlist (comma-separated auth UUIDs). Fail-closed at every step:
//   • unset / empty / whitespace-only       → [] (dormant)
//   • ANY malformed (non-UUID) token         → [] (the WHOLE list fails closed; never partially honour)
//   • more than PUBLIC_TESTER_MAX valid ids  → [] (misconfiguration; never widen beyond the two testers)
//   • duplicates                             → de-duped
// Lower-cased so the compare against the (also lower-cased) server-resolved auth id is exact and
// case-insensitive. Never read from any client-supplied value.
export function parsePublicTesterIds(raw: string | undefined | null): string[] {
  if (!raw) return []
  const parts = String(raw)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0)
  if (parts.length === 0) return []
  const seen = new Set<string>()
  for (const p of parts) {
    if (!TESTER_UUID_RE.test(p)) return [] // malformed → fail closed entirely
    seen.add(p)
  }
  if (seen.size > PUBLIC_TESTER_MAX) return [] // too many → fail closed entirely
  return Array.from(seen)
}

// Resolved public-rollout configuration (server reads env → this shape).
export interface PublicRolloutConfig {
  masterEnabled: boolean // POKER_TOURNAMENT_PUBLIC_ENABLED — master kill switch (fail-closed OFF)
  configuredPct: RolloutPct // the validated configured percentage (100 possible, pre-ceiling)
  pct: RolloutPct // the EFFECTIVE percentage actually applied (post phase-ceiling; the number that gates)
  testerIds: string[] // temporary server-only tester allowlist (27G-N Stage 3A); [] when dormant
}

export function resolvePublicRollout(env: Record<string, string | undefined>): PublicRolloutConfig {
  return {
    masterEnabled: truthy(env[PUBLIC_ROLLOUT_ENABLED_ENV]),
    configuredPct: parseRolloutPct(env[PUBLIC_ROLLOUT_PCT_ENV]),
    pct: effectiveRolloutPct(env[PUBLIC_ROLLOUT_PCT_ENV]),
    testerIds: parsePublicTesterIds(env[PUBLIC_TESTER_IDS_ENV]),
  }
}

// Is public tournament ENABLED at all (master kill switch on)? Independent of the percentage — used
// to ARM the public heads-up launch-shape enforcement so an operator can never create a public
// tournament in a non-heads-up shape, even while the effective rollout is still 0%.
export function publicRolloutEnabled(cfg: PublicRolloutConfig): boolean {
  return cfg.masterEnabled
}

// The one authoritative decision: is THIS viewer inside the public rollout for the Tournament
// surface? Fail-closed at every step:
//   • master kill switch OFF        → denied (overrides everything, including the tester allowlist)
//   • anonymous (no user id)        → denied (never bucket/allow a non-authenticated viewer)
//   • suspended tester              → denied (locked out on the public path, allowlist included)
//   • on the temporary allowlist    → ADMITTED regardless of bucket (visibility only; % unchanged)
//   • effective percentage ≤ 0      → denied (default 0%, or a 100 blocked by the phase ceiling)
//   • otherwise                     → in iff the stable bucket falls under the effective percentage
// Admins / alpha testers / beta members reach tournaments through their OWN gate (flags.ts); this
// function is ONLY the additional public path and never widens those. The tester allowlist admits
// participant VISIBILITY only — it confers no operator/admin capability and cannot relax the
// heads-up launch shape, rate limits, privacy, or economy checks (all enforced independently).
export function inPublicRollout(
  cfg: PublicRolloutConfig,
  ctx: { userId: string | null | undefined; suspended?: boolean },
): boolean {
  if (!cfg.masterEnabled) return false
  if (!ctx.userId) return false
  if (ctx.suspended) return false
  const testers = cfg.testerIds ?? []
  if (testers.length > 0 && testers.includes(ctx.userId.toLowerCase())) return true
  if (cfg.pct <= 0) return false
  return rolloutBucket(ctx.userId) < cfg.pct
}
