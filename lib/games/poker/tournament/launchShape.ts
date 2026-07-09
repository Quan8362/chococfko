// ── Public launch-shape policy — PURE ──────────────────────────────────────────────────────────
//
// Closes blocker B2: the public Tournament capability must be technically restricted to the ONLY
// format validated for public play — ONE table, TWO players, heads-up. This policy is enforced
// server-side (config validation + the operator creation action) so that flipping the public flag
// on can never open a multi-table / >2-player / re-entry / late-registration / bot-seat shape that
// has not been validated.
//
// It is PURE and additive: it does NOT weaken internal-alpha / closed-beta behaviour (those keep the
// existing 6-max templates). It only constrains a config when the caller is operating under the
// PUBLIC tournament capability.

import type { TournamentConfig } from './types.ts'
import type { ValidationResult } from './config.ts'

// The immutable public launch shape. One table, two seats, exactly two entrants.
export const PUBLIC_LAUNCH_MAX_ENTRIES = 2 as const
export const PUBLIC_LAUNCH_SEATS_PER_TABLE = 2 as const
export const PUBLIC_LAUNCH_MIN_ENTRIES = 2 as const

/**
 * Validate that a config conforms to the public launch shape. Enforces heads-up single-table with
 * no re-entry, no late registration, and (structurally) no table balancing / multi-table transition
 * (a 2-seat, 2-entry field can never split into more than one table). Bot seats are separately gated
 * OFF by the tournament-bot flag; this shape simply never opens more than the two human seats.
 */
export function validatePublicLaunchShape(c: TournamentConfig): ValidationResult {
  if (c.maxEntries !== PUBLIC_LAUNCH_MAX_ENTRIES) {
    return { ok: false, reason: `public launch requires maxEntries=${PUBLIC_LAUNCH_MAX_ENTRIES} (got ${c.maxEntries})` }
  }
  if (c.seatsPerTable !== PUBLIC_LAUNCH_SEATS_PER_TABLE) {
    return { ok: false, reason: `public launch requires seatsPerTable=${PUBLIC_LAUNCH_SEATS_PER_TABLE} (got ${c.seatsPerTable})` }
  }
  if (c.minEntries !== PUBLIC_LAUNCH_MIN_ENTRIES) {
    return { ok: false, reason: `public launch requires minEntries=${PUBLIC_LAUNCH_MIN_ENTRIES} (got ${c.minEntries})` }
  }
  if (c.maxReEntriesPerUser !== 0 || c.reEntryUntilLevelIndex !== null) {
    return { ok: false, reason: 'public launch forbids re-entry' }
  }
  if (c.lateRegUntilLevelIndex !== null) {
    return { ok: false, reason: 'public launch forbids late registration' }
  }
  return { ok: true }
}

/** True when the config is exactly the validated public heads-up single-table shape. */
export function isPublicLaunchShape(c: TournamentConfig): boolean {
  return validatePublicLaunchShape(c).ok
}
