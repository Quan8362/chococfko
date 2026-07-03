// ── Poker TOURNAMENT — registration rules (TNMT-REG) ────────────────────────────────────
//
// PURE module. Decides IF a registration/re-entry/cancel is eligible and produces the DEDUP KEY
// the DEFINER RPC uses for idempotency (TNMT-ENG-004). It never moves coins — the RPC escrows the
// entry fee and writes the ledger row under the returned key. The browser may pre-check the same
// rules but the server is authoritative.

import type { TournamentState, TournamentConfig, EntryState } from './types.ts'
import { stateAllowsRegistration } from './stateMachine.ts'
import { levelEndSeconds } from './blinds.ts'

// A user's existing entries in this tournament (minimal projection needed to decide re-entry).
export interface UserEntrySummary {
  readonly seq: number
  readonly state: EntryState
}

export type RegistrationDecision =
  | { readonly ok: true; readonly seq: number; readonly idempotencyKey: string; readonly kind: 'initial' | 'reentry' }
  | { readonly ok: false; readonly code: RegistrationReject }

export type RegistrationReject =
  | 'STATE_CLOSED'         // tournament state does not allow registration
  | 'LATE_REG_CLOSED'      // past the late-reg deadline
  | 'FIELD_FULL'           // maxEntries reached
  | 'ALREADY_REGISTERED'   // an initial entry already exists and is live
  | 'REENTRY_NOT_ALLOWED'  // re-entry disabled by config
  | 'REENTRY_WINDOW_CLOSED'// past the re-entry deadline
  | 'REENTRY_LIMIT'        // maxReEntriesPerUser reached
  | 'NOT_REBUY_ELIGIBLE'   // re-entry requested but the user is not currently busted/eligible

// Dedup keys (TNMT-ENG-004). Stable + unique per logical registration so a retried request maps to
// the SAME row. Initial entry is unique per (tournament, user). A re-entry is unique per
// (tournament, user, seq) so each distinct re-entry is its own idempotent unit.
export function initialRegKey(tournamentId: string, userId: string): string {
  return `reg:${tournamentId}:${userId}`
}
export function reentryKey(tournamentId: string, userId: string, seq: number): string {
  return `reentry:${tournamentId}:${userId}:${seq}`
}
export function unregisterKey(tournamentId: string, userId: string): string {
  return `unreg:${tournamentId}:${userId}`
}

// Is late registration still open? True when the clock has not passed the end of the configured
// late-reg level (TNMT-REG-004). Config null → no late reg. Pre-start (elapsed <= 0) → open.
export function lateRegOpen(config: TournamentConfig, elapsedSeconds: number): boolean {
  if (config.lateRegUntilLevelIndex === null) return false
  if (elapsedSeconds <= 0) return true
  const deadline = levelEndSeconds(config.blindStructure, config.lateRegUntilLevelIndex)
  return Math.floor(elapsedSeconds) < deadline
}

function reEntryWindowOpen(config: TournamentConfig, elapsedSeconds: number): boolean {
  if (config.reEntryUntilLevelIndex === null) return false
  if (elapsedSeconds <= 0) return true
  const deadline = levelEndSeconds(config.blindStructure, config.reEntryUntilLevelIndex)
  return Math.floor(elapsedSeconds) < deadline
}

// Decide an INITIAL registration.
export function decideRegistration(
  tournamentId: string,
  userId: string,
  state: TournamentState,
  config: TournamentConfig,
  elapsedSeconds: number,
  currentFieldSize: number,
  usersEntries: readonly UserEntrySummary[],
): RegistrationDecision {
  const lr = lateRegOpen(config, elapsedSeconds)
  if (!stateAllowsRegistration(state, lr)) return { ok: false, code: 'STATE_CLOSED' }
  // If the state gate passed only because of late reg, re-verify the deadline explicitly.
  if (state !== 'REGISTRATION_OPEN' && !lr) return { ok: false, code: 'LATE_REG_CLOSED' }
  if (currentFieldSize >= config.maxEntries) return { ok: false, code: 'FIELD_FULL' }

  // A user with an existing NON-terminal-out entry may not re-register initially. (WITHDRAWN or a
  // busted ELIMINATED that is not rebuy-eligible would go through the re-entry path instead.)
  const hasLiveOrPaid = usersEntries.some((e) => e.state !== 'WITHDRAWN' && e.state !== 'ELIMINATED')
  if (hasLiveOrPaid) return { ok: false, code: 'ALREADY_REGISTERED' }

  const seq = nextSeq(usersEntries)
  return { ok: true, seq, kind: 'initial', idempotencyKey: initialRegKey(tournamentId, userId) }
}

// Decide a RE-ENTRY (TNMT-REG-006). Requires re-entry enabled, within the window, under the limit,
// and the user currently busted / rebuy-eligible.
export function decideReEntry(
  tournamentId: string,
  userId: string,
  state: TournamentState,
  config: TournamentConfig,
  elapsedSeconds: number,
  currentFieldSize: number,
  usersEntries: readonly UserEntrySummary[],
): RegistrationDecision {
  if (config.maxReEntriesPerUser <= 0) return { ok: false, code: 'REENTRY_NOT_ALLOWED' }
  if (!reEntryWindowOpen(config, elapsedSeconds)) return { ok: false, code: 'REENTRY_WINDOW_CLOSED' }
  if (currentFieldSize >= config.maxEntries) return { ok: false, code: 'FIELD_FULL' }

  // Count prior re-entries (seq >= 1). The initial entry is seq 0.
  const priorReentries = usersEntries.filter((e) => e.seq >= 1).length
  if (priorReentries >= config.maxReEntriesPerUser) return { ok: false, code: 'REENTRY_LIMIT' }

  // Must currently be eligible to re-enter: busted (ELIMINATED) or explicitly REBUY_ELIGIBLE, and
  // not currently alive in the tournament.
  const alive = usersEntries.some((e) => e.state === 'ACTIVE' || e.state === 'SEATED' || e.state === 'DISCONNECTED' || e.state === 'REGISTERED')
  if (alive) return { ok: false, code: 'NOT_REBUY_ELIGIBLE' }
  const eligible = usersEntries.some((e) => e.state === 'ELIMINATED' || e.state === 'REBUY_ELIGIBLE')
  if (!eligible) return { ok: false, code: 'NOT_REBUY_ELIGIBLE' }

  const seq = nextSeq(usersEntries)
  return { ok: true, seq, kind: 'reentry', idempotencyKey: reentryKey(tournamentId, userId, seq) }
}

function nextSeq(usersEntries: readonly UserEntrySummary[]): number {
  return usersEntries.reduce((m, e) => Math.max(m, e.seq + 1), 0)
}

// Does the field meet the minimum to start? Below this at scheduled start → auto-cancel + full
// refund (TNMT-REG-005 / TNMT-CANCEL-011).
export function meetsMinimum(config: TournamentConfig, fieldSize: number): boolean {
  return fieldSize >= config.minEntries
}
