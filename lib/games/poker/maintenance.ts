// ── Poker maintenance mode — PURE, graduated service-status resolver ─────────────────────────
//
// Live-ops needs more than the single-boolean beta wind-down (POKER_BETA_MAINTENANCE): during a
// planned maintenance, an outage, a settlement-integrity investigation, or an emergency it must be
// possible to wind the feature down in GRADUATED steps — from "browse-only lobby" all the way to
// "emergency shutdown" — always server-side, never abruptly losing an active stack, and always with
// a clear user-facing message + optional estimated return time.
//
// This module is a PURE resolver over an env-like record (no process.env, no DB, no React, no
// secrets) so it is unit-testable and importable anywhere. The server wrapper that reads the real
// env and composes it with the feature flags + viewer access lives in `app/games/poker/access.ts`.
//
// DESIGN PRINCIPLES (mirrors the poker core principles):
//   • Server-authoritative. The mode gates NEW commands; it NEVER settles, cancels, or freezes a
//     live hand and NEVER moves coins — running hands drain naturally through the authoritative
//     engine so no player loses an active stack. Winding a table down is a separate, audited admin
//     action (poker_admin_close_table / _freeze_hand / _refund_hand), not a side effect of a mode.
//   • Read-before-write. Read-only capabilities (enter the feature, browse the lobby, spectate) stay
//     available for as long as safely possible so a player can SEE the maintenance status and let
//     their current hand finish — they are only cut off at the two most severe tiers.
//   • Fail closed. Any unknown / mistyped mode resolves to the SAFEST interpretation for the value
//     given; an unset env resolves to `normal` (the feature behaves exactly as the flags dictate).
//   • Most-restrictive-wins. The composed gate is the intersection of (flags, beta wind-down,
//     maintenance mode): if ANY layer blocks a capability, it is blocked.

import type { PokerCapability } from './flags.ts'

// ── The graduated modes, ordered from least to most restrictive ───────────────────────────────
export type MaintenanceMode =
  | 'normal'              // 0 — feature behaves exactly as the flags dictate (no wind-down)
  | 'read_only_lobby'     // 1 — browse/spectate only; no new tables, no new joins
  | 'no_new_tables'       // 2 — everything except hosting a NEW table
  | 'no_new_joins'        // 3 — no new tables AND no new seats; running hands keep going
  | 'finish_active_hands' // 4 — same gate as no_new_joins, but the declared intent is DRAINING:
                          //     operators wait for live hands to complete before escalating
  | 'full_maintenance'    // 5 — feature reachable only to render the maintenance screen; no play
  | 'emergency_shutdown'  // 6 — feature fully unreachable (hard kill)

// Canonical order (index === severity). Exposed for admin dropdowns / docs.
export const MAINTENANCE_MODES: readonly MaintenanceMode[] = [
  'normal',
  'read_only_lobby',
  'no_new_tables',
  'no_new_joins',
  'finish_active_hands',
  'full_maintenance',
  'emergency_shutdown',
] as const

export function maintenanceSeverity(mode: MaintenanceMode): number {
  const i = MAINTENANCE_MODES.indexOf(mode)
  return i < 0 ? MAINTENANCE_MODES.length - 1 : i // unknown ⇒ treat as most severe (fail closed)
}

// ── Env keys (ops-facing) ─────────────────────────────────────────────────────────────────────
export const POKER_MAINTENANCE_MODE_ENV = 'POKER_MAINTENANCE_MODE'
// Admin-authored, display-only free text shown on the maintenance strip/screen (like
// POKER_BETA_STATUS_MESSAGE). NOT localized — ops writes one clear sentence per incident.
export const POKER_MAINTENANCE_MESSAGE_ENV = 'POKER_MAINTENANCE_MESSAGE'
// Optional ISO-8601 estimated return timestamp, display-only. Empty ⇒ "no estimate".
export const POKER_MAINTENANCE_ETA_ENV = 'POKER_MAINTENANCE_ETA'

// Accept a small set of spellings so ops can't fat-finger a mode into "off". Anything unrecognised
// but non-empty fails CLOSED to full_maintenance rather than silently behaving as normal.
const MODE_ALIASES: Record<string, MaintenanceMode> = {
  '': 'normal',
  '0': 'normal',
  normal: 'normal',
  off: 'normal',
  none: 'normal',
  read_only_lobby: 'read_only_lobby',
  'read-only-lobby': 'read_only_lobby',
  readonly: 'read_only_lobby',
  lobby: 'read_only_lobby',
  no_new_tables: 'no_new_tables',
  'no-new-tables': 'no_new_tables',
  no_new_joins: 'no_new_joins',
  'no-new-joins': 'no_new_joins',
  freeze: 'no_new_joins',
  finish_active_hands: 'finish_active_hands',
  'finish-active-hands': 'finish_active_hands',
  drain: 'finish_active_hands',
  full_maintenance: 'full_maintenance',
  'full-maintenance': 'full_maintenance',
  maintenance: 'full_maintenance',
  full: 'full_maintenance',
  emergency_shutdown: 'emergency_shutdown',
  'emergency-shutdown': 'emergency_shutdown',
  emergency: 'emergency_shutdown',
  shutdown: 'emergency_shutdown',
  kill: 'emergency_shutdown',
}

export function parseMaintenanceMode(raw: string | undefined | null): MaintenanceMode {
  if (raw == null) return 'normal'
  const key = raw.trim().toLowerCase()
  if (key in MODE_ALIASES) return MODE_ALIASES[key]
  // Non-empty but unrecognised: a typo in a wind-down variable must never read as "open".
  return 'full_maintenance'
}

// ── Resolved status ───────────────────────────────────────────────────────────────────────────
export interface MaintenanceStatus {
  readonly mode: MaintenanceMode
  readonly active: boolean          // mode !== 'normal'
  readonly message: string | null   // admin free text, display-only
  readonly etaIso: string | null    // ISO-8601 estimated return, or null
}

export function resolveMaintenance(env: Record<string, string | undefined>): MaintenanceStatus {
  const mode = parseMaintenanceMode(env[POKER_MAINTENANCE_MODE_ENV])
  const rawMsg = env[POKER_MAINTENANCE_MESSAGE_ENV]
  const rawEta = env[POKER_MAINTENANCE_ETA_ENV]
  const message = rawMsg && rawMsg.trim() ? rawMsg.trim() : null
  const etaIso = rawEta && rawEta.trim() ? rawEta.trim() : null
  return { mode, active: mode !== 'normal', message, etaIso }
}

// ── Capability gate ───────────────────────────────────────────────────────────────────────────
// How a blocked capability should be explained to the user. Maps to EXISTING, already-translated
// action codes in access.ts so this phase adds no new i18n keys:
//   • 'joins_frozen'  → reuse 'poker_joins_frozen'  ("new tables/joins are paused")
//   • 'feature_off'   → reuse 'poker_feature_off'   ("poker is unavailable right now")
export type MaintenanceBlockReason = 'joins_frozen' | 'feature_off'

export interface MaintenanceDecision {
  readonly allowed: boolean
  // Only meaningful when !allowed.
  readonly reason: MaintenanceBlockReason | null
}

const ALLOW: MaintenanceDecision = { allowed: true, reason: null }
const BLOCK_JOINS: MaintenanceDecision = { allowed: false, reason: 'joins_frozen' }
const BLOCK_ALL: MaintenanceDecision = { allowed: false, reason: 'feature_off' }

// Is a capability read-only (never moves coins, never seats a player)?
function isReadOnly(cap: PokerCapability): boolean {
  return cap === 'enter' || cap === 'public_lobby' || cap === 'spectate'
}

// Does a capability commit a player to the table (moves coins / takes a seat / hosts a table)?
function isCommitting(cap: PokerCapability): boolean {
  return cap === 'create' || cap === 'join'
}

// Decide a single capability under a maintenance mode, IGNORING the feature flags (the caller
// intersects this with the flag/viewer gate). Never grants a capability the flags would deny — a
// mode can only ever be MORE restrictive than normal, never less.
export function maintenanceGate(mode: MaintenanceMode, cap: PokerCapability): MaintenanceDecision {
  switch (mode) {
    case 'normal':
      return ALLOW

    case 'read_only_lobby':
      // Browse + spectate stay open; anything that commits coins or seats a player is blocked.
      // private_table is a "committing-adjacent" capability (creating/entering a private table)
      // and is blocked here so the lobby is genuinely read-only.
      if (isReadOnly(cap)) return ALLOW
      return BLOCK_JOINS

    case 'no_new_tables':
      // Only hosting a NEW table is blocked; existing tables remain fully joinable/playable.
      if (cap === 'create') return BLOCK_JOINS
      return ALLOW

    case 'no_new_joins':
    case 'finish_active_hands':
      // No new tables and no new seats. Running hands drain through the engine; read-only and
      // private_table (to REACH an existing table you're already part of) stay available.
      if (isCommitting(cap)) return BLOCK_JOINS
      return ALLOW

    case 'full_maintenance':
      // Only entering the feature is allowed — so the maintenance screen renders and a player can
      // watch their current hand finish. Everything else (lobby, spectate, private, create, join)
      // is off.
      if (cap === 'enter') return ALLOW
      return BLOCK_ALL

    case 'emergency_shutdown':
      // Hard kill: even entering the feature is refused.
      return BLOCK_ALL

    default: {
      // Exhaustiveness guard — an unhandled mode fails closed.
      const _never: never = mode
      void _never
      return BLOCK_ALL
    }
  }
}

// Convenience: the worst (most restrictive) of two decisions, for composing maintenance with the
// legacy beta wind-down boolean. A block always beats an allow; 'feature_off' beats 'joins_frozen'.
export function worseDecision(a: MaintenanceDecision, b: MaintenanceDecision): MaintenanceDecision {
  if (a.allowed && b.allowed) return ALLOW
  const blocked = [a, b].filter((d) => !d.allowed)
  if (blocked.some((d) => d.reason === 'feature_off')) return BLOCK_ALL
  return BLOCK_JOINS
}
