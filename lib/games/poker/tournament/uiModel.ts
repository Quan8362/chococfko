// PURE presentation model for the internal-alpha tournament UI. Keeps the "what can the operator do
// now / what state is this participant in" logic out of JSX so it is unit-testable and consistent
// across list, detail, and table views. Mirrors the audited FSM (canTransition) — never a second
// source of truth; the server + DB remain authoritative.

import { canTransition } from './stateMachine.ts'
import type { TournamentState, EntryState } from './types.ts'

// Operator controls that map to a legal FSM transition, in display order. `to` is the target state
// passed to transitionTournament; `key` is the i18n label key under games.poker.tournaments.operator.
// Non-cancel FSM transitions (Cancel is handled specially: it becomes a refund-recovery control
// whenever escrow is still held, so a plain cancel can never silently strand entry fees — 27G-F1).
const OPERATOR_TRANSITION_CONTROLS: readonly { key: string; to: TournamentState; destructive?: boolean }[] = [
  { key: 'schedule', to: 'SCHEDULED' },
  { key: 'open_registration', to: 'REGISTRATION_OPEN' },
  { key: 'start', to: 'STARTING' },
  { key: 'begin_play', to: 'RUNNING' },
  { key: 'final_table', to: 'FINAL_TABLE' },
]

export interface OperatorControl {
  key: string
  to?: TournamentState        // present for FSM-transition controls
  // present for non-transition orchestration controls
  op?: 'draw_seats' | 'advance_level' | 'settle' | 'deal_next' | 'recover_refund'
  destructive?: boolean
}

// The legal operator controls for the CURRENT state (transition controls filtered by canTransition,
// plus the state-appropriate orchestration controls). The server re-checks every one of these.
// `escrowHeld` = the tournament still holds entry fees (any entry not WITHDRAWN/PAID); when true, a
// plain Cancel is replaced by the refund-recovery control (recover_refund) so escrow is never
// stranded. Defaults to true (fail-safe: prefer the refunding path when the caller doesn't know).
export function operatorControlsFor(state: TournamentState, escrowHeld = true): OperatorControl[] {
  const controls: OperatorControl[] = OPERATOR_TRANSITION_CONTROLS
    .filter((c) => canTransition(state, c.to))
    .map((c) => ({ key: c.key, to: c.to, destructive: c.destructive }))
  if (state === 'STARTING') controls.push({ key: 'draw_seats', op: 'draw_seats' })
  if (state === 'RUNNING' || state === 'BREAK') controls.push({ key: 'advance_level', op: 'advance_level' })
  // Manual next-hand recovery for a wedged table (same idempotent server path as auto-advance).
  if (state === 'RUNNING' || state === 'BREAK' || state === 'FINAL_TABLE') controls.push({ key: 'deal_next', op: 'deal_next' })
  if (state === 'RUNNING' || state === 'BREAK' || state === 'FINAL_TABLE') controls.push({ key: 'settle', op: 'settle' })
  // Cancel / recovery: only where the FSM permits cancelling. With escrow held → the refund-recovery
  // path (refunds every entry, then CANCELLED). Without escrow → a plain cancel.
  if (canTransition(state, 'CANCELLED')) {
    controls.push(escrowHeld
      ? { key: 'recover_refund', op: 'recover_refund', destructive: true }
      : { key: 'cancel', to: 'CANCELLED', destructive: true })
  }
  return controls
}

// Whether registration is open AND there is room (drives the participant Register button).
export function registrationOpen(state: TournamentState, registeredCount: number, maxEntries: number): boolean {
  return state === 'REGISTRATION_OPEN' && registeredCount < maxEntries
}

// May a registered participant still unregister (pre-start refund window)?
export function canUnregister(tournamentState: TournamentState, entryState: EntryState | null): boolean {
  if (!entryState) return false
  if (!(entryState === 'REGISTERED' || entryState === 'SEATED')) return false
  return tournamentState === 'SCHEDULED' || tournamentState === 'REGISTRATION_OPEN' || tournamentState === 'STARTING'
}

export type ParticipantDisplayState =
  | 'not_registered'
  | 'registered'   // signed up, tournament not yet playing
  | 'waiting'      // tournament starting, seats not yet drawn / assigned
  | 'seated'       // has an assigned table/seat, in play
  | 'eliminated'   // busted out (finishing place assigned, not the winner)
  | 'champion'     // won (finishing place 1 or the lone survivor at completion)
  | 'withdrawn'    // unregistered + refunded

export interface EntryLike {
  state: EntryState
  finishing_place: number | null
  table_no: number | null
  seat_index: number | null
}

// The participant's display state, derived from their entry + the tournament lifecycle.
export function participantDisplayState(
  tournamentState: TournamentState,
  entry: EntryLike | null,
): ParticipantDisplayState {
  if (!entry) return 'not_registered'
  if (entry.state === 'WITHDRAWN') return 'withdrawn'
  if (entry.state === 'PAID') return entry.finishing_place === 1 ? 'champion' : 'eliminated'
  if (entry.state === 'ELIMINATED') return 'eliminated'
  if (entry.finishing_place === 1) return 'champion'
  if (tournamentState === 'COMPLETED') return entry.finishing_place === 1 ? 'champion' : 'eliminated'
  if (entry.state === 'ACTIVE' || (entry.state === 'SEATED' && entry.table_no != null)) {
    return entry.table_no != null ? 'seated' : 'waiting'
  }
  if (tournamentState === 'STARTING') return 'waiting'
  return 'registered'
}

// Does this participant have a live table assignment they may navigate to?
export function hasTableAssignment(entry: EntryLike | null): boolean {
  return !!entry && entry.table_no != null && entry.seat_index != null &&
    (entry.state === 'SEATED' || entry.state === 'ACTIVE' || entry.state === 'DISCONNECTED')
}
