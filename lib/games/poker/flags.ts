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
}

// The seven ops-facing flag names (env keys + documentation), in canonical order.
export const POKER_FLAG_ENV: Record<keyof PokerFlags, string> = {
  enabled: 'POKER_ENABLED',
  createTable: 'POKER_CREATE_TABLE_ENABLED',
  publicLobby: 'POKER_PUBLIC_LOBBY_ENABLED',
  privateTable: 'POKER_PRIVATE_TABLE_ENABLED',
  spectator: 'POKER_SPECTATOR_ENABLED',
  bot: 'POKER_BOT_ENABLED',
  tournament: 'POKER_TOURNAMENT_ENABLED',
}

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
  }
}

// ── Capability layer (flags + viewer) ─────────────────────────────────────────
export type PokerCapability = 'enter' | 'create' | 'public_lobby' | 'private_table' | 'spectate'

export interface PokerViewer {
  isAdmin: boolean
}

// May the viewer reach the poker feature at all? Admins get in even when the
// public master flag is off (admin-only visibility rollout stage).
export function pokerVisibleTo(flags: PokerFlags, viewer: PokerViewer): boolean {
  return flags.enabled || viewer.isAdmin
}

// Resolve a single capability. A viewer must first be able to enter; then the
// per-capability flag (or admin override) decides. bot/tournament are not
// capabilities here because they never ship on in this release.
export function pokerCan(flags: PokerFlags, viewer: PokerViewer, cap: PokerCapability): boolean {
  if (!pokerVisibleTo(flags, viewer)) return false
  switch (cap) {
    case 'enter':
      return true
    case 'create':
      return flags.createTable || viewer.isAdmin
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
