// ── Poker PUBLIC TOURNAMENT rollout — PURE deterministic gate ─────────────────────────────────
//
// The controlled public rollout of the Tournament surface (Prompt 27G-N). PURE — no process.env /
// DB / browser imports — so it is unit-testable and importable from anywhere. The server wrapper
// that reads the real env + the viewer lives in `app/games/poker/access.ts`.
//
// It is the SMALLEST safe deterministic gate that opens the public heads-up Tournament surface to a
// controlled fraction of AUTHENTICATED users, in explicit manually-advanced stages (0 → 5 → 10 → 25
// → 50). It NEVER touches the internal-alpha / Closed-Beta paths (those resolve entirely in flags.ts
// + beta.ts and are unchanged), NEVER opens a cash-seating capability, and NEVER moves coins.
//
// Two independent ops levers, both fail-closed:
//   • POKER_TOURNAMENT_PUBLIC_ENABLED — the MASTER KILL SWITCH (boolean, default OFF). When OFF the
//     public rollout is entirely inert regardless of the percentage — the emergency "return to 0"
//     lever. It ALSO arms the public heads-up launch-shape enforcement (see access.ts), so a public
//     tournament can never be created in any shape but heads-up single-table.
//   • POKER_TOURNAMENT_PUBLIC_ROLLOUT — the rollout PERCENTAGE (integer, default 0). Only the exact
//     values {0,5,10,25,50,100} are allowed; anything missing / malformed / out-of-range resolves to
//     0 (fail closed). During 27G-N a phase ceiling caps activation at 50: a configured 100 is a
//     VALID value but is NOT activatable yet and resolves to an EFFECTIVE 0 (fail closed) until the
//     ceiling is lifted in a later phase.
//
// Bucketing is deterministic and stable: derived ONLY from the server-resolved, stable, opaque auth
// user id (a UUID). It never reads email, display name, IP, cookie, or any client-supplied value, so
// the same user always receives the same decision and no user can move themselves into the rollout.

// Env keys (documentation + the server resolver read these).
export const PUBLIC_ROLLOUT_ENABLED_ENV = 'POKER_TOURNAMENT_PUBLIC_ENABLED'
export const PUBLIC_ROLLOUT_PCT_ENV = 'POKER_TOURNAMENT_PUBLIC_ROLLOUT'

// The ONLY percentages that may ever be configured. Anything else fails closed to 0.
export const ALLOWED_ROLLOUT_PCTS = [0, 5, 10, 25, 50, 100] as const
export type RolloutPct = (typeof ALLOWED_ROLLOUT_PCTS)[number]

// 27G-N phase ceiling: a configured percentage ABOVE this is not activatable yet and resolves to an
// effective 0 (fail closed). Raising this is a deliberate, reviewed change in a later phase — never
// an env-only action — so 100% cannot be reached during 27G-N by configuration alone.
export const ROLLOUT_PHASE_CEILING = 50 as const

// Only an explicit affirmative turns the master switch on. Everything else — unset, empty, '0',
// 'false', 'off', a typo — resolves OFF. Mirrors flags.ts `truthy` for one ops mental model.
function truthy(v: string | undefined): boolean {
  if (!v) return false
  const s = v.trim().toLowerCase()
  return s === '1' || s === 'true' || s === 'on' || s === 'yes'
}

// Parse & VALIDATE the configured percentage. Returns one of ALLOWED_ROLLOUT_PCTS, or 0 for anything
// missing / non-integer / out-of-range (fail closed). 100 is a valid CONFIGURED value here — the
// phase ceiling (applied by effectiveRolloutPct) is what prevents it activating during 27G-N.
export function parseRolloutPct(raw: string | undefined | null): RolloutPct {
  if (raw == null) return 0
  const s = String(raw).trim()
  if (!/^-?\d+$/.test(s)) return 0
  const n = Number.parseInt(s, 10)
  return (ALLOWED_ROLLOUT_PCTS as readonly number[]).includes(n) ? (n as RolloutPct) : 0
}

// The EFFECTIVE percentage after the 27G-N phase ceiling: a configured value above the ceiling is not
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

// Resolved public-rollout configuration (server reads env → this shape).
export interface PublicRolloutConfig {
  masterEnabled: boolean // POKER_TOURNAMENT_PUBLIC_ENABLED — master kill switch (fail-closed OFF)
  configuredPct: RolloutPct // the validated configured percentage (100 possible, pre-ceiling)
  pct: RolloutPct // the EFFECTIVE percentage actually applied (post phase-ceiling; the number that gates)
}

export function resolvePublicRollout(env: Record<string, string | undefined>): PublicRolloutConfig {
  return {
    masterEnabled: truthy(env[PUBLIC_ROLLOUT_ENABLED_ENV]),
    configuredPct: parseRolloutPct(env[PUBLIC_ROLLOUT_PCT_ENV]),
    pct: effectiveRolloutPct(env[PUBLIC_ROLLOUT_PCT_ENV]),
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
//   • master kill switch OFF        → denied (overrides everything, including a non-zero percentage)
//   • effective percentage ≤ 0      → denied (default 0%, or a 100 blocked by the phase ceiling)
//   • anonymous (no user id)        → denied (never bucket a non-authenticated viewer)
//   • suspended tester              → denied (locked out on the public path too)
//   • otherwise                     → in iff the stable bucket falls under the effective percentage
// Admins / alpha testers / beta members reach tournaments through their OWN gate (flags.ts); this
// function is ONLY the additional public path and never widens those.
export function inPublicRollout(
  cfg: PublicRolloutConfig,
  ctx: { userId: string | null | undefined; suspended?: boolean },
): boolean {
  if (!cfg.masterEnabled) return false
  if (cfg.pct <= 0) return false
  if (!ctx.userId) return false
  if (ctx.suspended) return false
  return rolloutBucket(ctx.userId) < cfg.pct
}
