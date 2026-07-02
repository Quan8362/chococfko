// Poker feature flags — PURE resolution from an env-like record, with SAFE
// (production-OFF) defaults. No process.env / server imports here so it stays
// unit-testable and importable from anywhere. The server wrapper that reads the
// real env + viewer access lives in `app/games/poker/access.ts`.
//
// Rollout model (see reports/poker-final-review-2026-07-01.md):
//   • Every flag defaults OFF. A fresh production deploy exposes poker to NOBODY
//     but admins — the "admin-only production visibility" stage — for free.
//   • Admins bypass every gate EXCEPT the two hard-off features below, so they can
//     validate on prod before any public flag is flipped.
//   • `bot` and `tournament` are HARD OFF regardless of env for this release.

export interface PokerFlags {
  enabled: boolean        // master switch — reach the poker feature at all
  createTable: boolean    // host a new cash table
  publicLobby: boolean    // browse/join the public table list
  privateTable: boolean   // create/join password-protected tables
  spectator: boolean      // watch a table without sitting
  bot: boolean            // out of scope — HARD OFF this release
  tournament: boolean     // out of scope — HARD OFF this release
  // ── Alpha operations ──────────────────────────────────────────────────────
  // alpha: controlled-Alpha mode. When ON the feature is reachable ONLY by the
  //   approved tester allowlist (+ admins), even if `enabled` is also ON — this
  //   keeps a production Alpha strictly private without opening it to the public.
  // blockNewJoins: freeze switch. Preserves every running table & stack but
  //   refuses new table creation / joins / sit-downs so an Alpha can be wound
  //   down gracefully without stranding coins mid-hand.
  alpha: boolean
  blockNewJoins: boolean
  // ── Closed Beta ───────────────────────────────────────────────────────────
  // closedBeta: the STAGE AFTER Alpha. When ON the feature is reachable ONLY by
  //   members of the beta cohorts (+ admins), even if `enabled` is also ON — a
  //   larger-but-still-private rollout with cohort assignment, terms acknowledg
  //   -ement and per-tester suspend. Cohort membership + suspension are resolved
  //   in lib/games/poker/beta.ts (env allowlists), NOT here, to keep this module
  //   a pure flag resolver. Typically run with alpha=0 and enabled=0.
  closedBeta: boolean
}

// The ops-facing flag names (env keys + documentation), in canonical order.
export const POKER_FLAG_ENV: Record<keyof PokerFlags, string> = {
  enabled: 'POKER_ENABLED',
  createTable: 'POKER_CREATE_TABLE_ENABLED',
  publicLobby: 'POKER_PUBLIC_LOBBY_ENABLED',
  privateTable: 'POKER_PRIVATE_TABLE_ENABLED',
  spectator: 'POKER_SPECTATOR_ENABLED',
  bot: 'POKER_BOT_ENABLED',
  tournament: 'POKER_TOURNAMENT_ENABLED',
  alpha: 'POKER_ALPHA_MODE',
  blockNewJoins: 'POKER_BLOCK_NEW_JOINS',
  closedBeta: 'POKER_CLOSED_BETA_ENABLED',
}

// Env key holding the comma-separated tester allowlist (emails), mirroring the
// ADMIN_EMAILS convention. Not a boolean flag, so it lives outside POKER_FLAG_ENV.
export const POKER_ALPHA_TESTERS_ENV = 'POKER_ALPHA_TESTERS'

// Only an explicit affirmative turns a flag on. Everything else — unset, empty,
// '0', 'false', 'off', a typo — resolves OFF. For a real-coin-adjacent game the
// safe default is always "closed".
function truthy(v: string | undefined): boolean {
  if (!v) return false
  const s = v.trim().toLowerCase()
  return s === '1' || s === 'true' || s === 'on' || s === 'yes'
}

export function resolvePokerFlags(env: Record<string, string | undefined>): PokerFlags {
  return {
    enabled: truthy(env[POKER_FLAG_ENV.enabled]),
    createTable: truthy(env[POKER_FLAG_ENV.createTable]),
    publicLobby: truthy(env[POKER_FLAG_ENV.publicLobby]),
    privateTable: truthy(env[POKER_FLAG_ENV.privateTable]),
    spectator: truthy(env[POKER_FLAG_ENV.spectator]),
    // Out of scope for this release — never on, even if the env says otherwise.
    bot: false,
    tournament: false,
    alpha: truthy(env[POKER_FLAG_ENV.alpha]),
    blockNewJoins: truthy(env[POKER_FLAG_ENV.blockNewJoins]),
    closedBeta: truthy(env[POKER_FLAG_ENV.closedBeta]),
  }
}

// Parse the tester allowlist (comma-separated, lower-cased, de-duped emails).
// Mirrors ADMIN_EMAILS parsing so ops uses one mental model for both lists.
export function parseAlphaTesters(raw: string | undefined | null): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  for (const part of raw.split(',')) {
    const e = part.trim().toLowerCase()
    if (e) seen.add(e)
  }
  return Array.from(seen)
}

// Is this email on the tester allowlist? Case-insensitive; empty email is never
// a tester. The list is authoritative on the server only.
export function isAlphaTester(email: string | null | undefined, raw: string | undefined | null): boolean {
  if (!email) return false
  return parseAlphaTesters(raw).includes(email.trim().toLowerCase())
}

// ── Capability layer (flags + viewer) ─────────────────────────────────────────
// 'join' = take/reserve a seat at (or join membership of) a table. Distinct from
// 'create' so a freeze can block new joins while existing tables keep running.
export type PokerCapability = 'enter' | 'create' | 'join' | 'public_lobby' | 'private_table' | 'spectate'

export interface PokerViewer {
  isAdmin: boolean
  // On the Alpha allowlist (server-resolved from POKER_ALPHA_TESTERS). Optional
  // so existing callers that never set it default to "not a tester".
  isAlphaTester?: boolean
  // In a Closed Beta cohort (server-resolved from the cohort allowlists in
  // lib/games/poker/beta.ts). Optional; defaults to "not a beta member".
  isBetaMember?: boolean
  // Suspended from the private test (Alpha/Beta) at the ACCESS layer — locked out
  // of the feature entirely even if otherwise a member. Distinct from a gameplay
  // player_restriction (which lets them view but not sit). Admins are never
  // suspended by this flag. Optional; defaults to "not suspended".
  suspended?: boolean
}

// May the viewer reach the poker feature at all?
//   • Admins always get in (admin-only production-visibility rollout stage).
//   • A suspended tester is locked out regardless of membership.
//   • In Closed Beta mode the feature is reachable ONLY by cohort members — even
//     if the public master flag is also on, the public stays locked out.
//   • In Alpha mode the feature is reachable ONLY by approved testers — likewise.
//   • Otherwise the public master flag decides.
// Closed Beta and Alpha are mutually-exclusive stages in practice (run one at a
// time). If both are left on, the MORE RESTRICTIVE combination applies: a viewer
// must satisfy whichever gate is checked first, so a mis-set flag fails closed.
export function pokerVisibleTo(flags: PokerFlags, viewer: PokerViewer): boolean {
  if (viewer.isAdmin) return true
  if (viewer.suspended) return false
  if (flags.alpha) return !!viewer.isAlphaTester
  if (flags.closedBeta) return !!viewer.isBetaMember
  return flags.enabled
}

// Resolve a single capability. A viewer must first be able to enter; then the
// per-capability flag (or admin override) decides. bot/tournament are not
// capabilities here because they never ship on in this release. The join freeze
// (blockNewJoins) overrides create/join for EVERYONE, including admins, so a
// wind-down is total and predictable — lift the freeze to test seating again.
export function pokerCan(flags: PokerFlags, viewer: PokerViewer, cap: PokerCapability): boolean {
  if (!pokerVisibleTo(flags, viewer)) return false
  switch (cap) {
    case 'enter':
      return true
    case 'create':
      return (flags.createTable || viewer.isAdmin) && !flags.blockNewJoins
    case 'join':
      return !flags.blockNewJoins
    case 'public_lobby':
      return flags.publicLobby || viewer.isAdmin
    case 'private_table':
      return flags.privateTable || viewer.isAdmin
    case 'spectate':
      return flags.spectator || viewer.isAdmin
    default:
      return false
  }
}
