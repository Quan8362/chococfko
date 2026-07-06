// ── Poker TOURNAMENT — state machines (TNMT-STATE / TNMT-PSTATE) ────────────────────────
//
// PURE module. Legal-transition tables for the tournament lifecycle and the per-entry
// lifecycle, plus registration-eligibility by state. Mirrors docs/poker/tournaments/state-
// machine.md exactly. The DEFINER RPCs re-enforce these; the client cannot force a transition.

import type { TournamentState, LiveTournamentState, EntryState } from './types.ts'

// ── Tournament transitions (TNMT-STATE-001) ────────────────────────────────────────────
const TOURNAMENT_TRANSITIONS: Readonly<Record<TournamentState, readonly TournamentState[]>> = {
  DRAFT: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['REGISTRATION_OPEN', 'CANCELLED'],
  REGISTRATION_OPEN: ['STARTING', 'CANCELLED'],
  STARTING: ['RUNNING', 'PAUSED_FOR_REVIEW', 'CANCELLED'],
  RUNNING: ['BREAK', 'FINAL_TABLE', 'PAUSED_FOR_REVIEW', 'CANCELLED'],
  BREAK: ['RUNNING', 'FINAL_TABLE', 'PAUSED_FOR_REVIEW', 'CANCELLED'],
  FINAL_TABLE: ['COMPLETED', 'PAUSED_FOR_REVIEW', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  // PAUSED_FOR_REVIEW resumes to whichever live state it paused from, or cancels. The concrete
  // resume target is validated separately by canResumeTo (it must be a live state).
  PAUSED_FOR_REVIEW: ['STARTING', 'RUNNING', 'BREAK', 'FINAL_TABLE', 'CANCELLED'],
}

export const TOURNAMENT_STATES = Object.keys(TOURNAMENT_TRANSITIONS) as TournamentState[]

const LIVE_STATES: readonly LiveTournamentState[] = ['STARTING', 'RUNNING', 'BREAK', 'FINAL_TABLE']
const TERMINAL_STATES: readonly TournamentState[] = ['COMPLETED', 'CANCELLED']

export function isLiveTournamentState(s: TournamentState): s is LiveTournamentState {
  return (LIVE_STATES as readonly TournamentState[]).includes(s)
}

export function isTerminalTournamentState(s: TournamentState): boolean {
  return TERMINAL_STATES.includes(s)
}

export function canTransition(from: TournamentState, to: TournamentState): boolean {
  return TOURNAMENT_TRANSITIONS[from]?.includes(to) ?? false
}

// Resume from a review pause is legal only back to a LIVE state (TNMT-STATE-002). Cancelling is
// handled by canTransition; this guards the resume path specifically.
export function canResumeTo(target: TournamentState): target is LiveTournamentState {
  return isLiveTournamentState(target)
}

// Registration is permitted in REGISTRATION_OPEN always, and in a live pre-cutoff state iff late
// registration is still open (TNMT-STATE-005 / TNMT-REG-004). The late-reg deadline itself is a
// blind-clock question answered by registration.ts; this only encodes the STATE gate.
export function stateAllowsRegistration(state: TournamentState, lateRegOpen: boolean): boolean {
  if (state === 'REGISTRATION_OPEN') return true
  if (!lateRegOpen) return false
  return state === 'STARTING' || state === 'RUNNING' || state === 'BREAK'
}

// ── Entry transitions (TNMT-PSTATE) ────────────────────────────────────────────────────
// Settlement drives an entry to terminal PAID. The CHAMPION reaches settlement while still ACTIVE
// (nothing ever eliminates the last player standing); an in-the-money loser is ELIMINATED; a
// finalist may be momentarily DISCONNECTED. All three are legal PAID sources — mirrored exactly by
// poker_tournament_settle's `state IN ('ACTIVE','DISCONNECTED','ELIMINATED')` predicate. WITHDRAWN
// and PAID stay terminal (never pay a refunded/already-paid entry).
const ENTRY_TRANSITIONS: Readonly<Record<EntryState, readonly EntryState[]>> = {
  REGISTERED: ['SEATED', 'WITHDRAWN'],
  SEATED: ['ACTIVE', 'WITHDRAWN'],
  ACTIVE: ['DISCONNECTED', 'ELIMINATED', 'REBUY_ELIGIBLE', 'PAID'],
  DISCONNECTED: ['ACTIVE', 'ELIMINATED', 'PAID'],
  ELIMINATED: ['PAID', 'REBUY_ELIGIBLE'],
  REBUY_ELIGIBLE: ['SEATED', 'ELIMINATED'],
  WITHDRAWN: [],
  PAID: [],
}

export const ENTRY_STATES = Object.keys(ENTRY_TRANSITIONS) as EntryState[]

const ENTRY_TERMINALS: readonly EntryState[] = ['WITHDRAWN', 'PAID']

export function isEntryTerminal(s: EntryState): boolean {
  return ENTRY_TERMINALS.includes(s)
}

export function canEntryTransition(from: EntryState, to: EntryState): boolean {
  return ENTRY_TRANSITIONS[from]?.includes(to) ?? false
}

// WITHDRAWN (registration cancel → refund) is reachable only before the tournament starts, i.e.
// from a pre-seat/pre-start entry state (TNMT-PSTATE-004). After start an entry can only bust/win.
export function canWithdraw(entryState: EntryState, tournamentState: TournamentState): boolean {
  if (entryState !== 'REGISTERED' && entryState !== 'SEATED') return false
  // A whole-tournament cancel is a different path (settlement), not a per-player withdraw.
  return tournamentState === 'SCHEDULED' || tournamentState === 'REGISTRATION_OPEN' || tournamentState === 'STARTING'
}
