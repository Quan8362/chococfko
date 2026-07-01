// ── Poker betting logic (pure, No-Limit Hold'em) ───────────────────────────────────
//
// PURE module — no React, no Supabase, no browser API. Tested by betting.test.ts.
//
// Implements the No-Limit betting state machine for a SINGLE betting round: contributions,
// amount-to-call, min/max sizing, full vs short all-in, reopening rights, legal-action
// calculation, action application, and round-completion detection.
//
// Authority model: this engine decides what is LEGAL and what the resulting state is. It does
// NOT own the clock, turn ownership, or persistence (that is the server's job). `applyAction`
// is PURE — it returns a NEW round and never mutates the caller's objects, and an illegal
// action returns an explicit typed error (never a silent repair).
//
// Rule IDs: ACTION-*, BET-MIN-001, RAISE-MIN/FULL/TO-001, BET-MAX-001, ALLIN-*,
// ROUND-COMPLETE/ADVANCE-001. Coins are integer-only (COIN-INT-001) via lib/games/shared/coins.

import type { Street } from './types.ts'
import { assertCoin } from '../shared/coins.ts'

export type SeatBettingStatus = 'active' | 'folded' | 'allin' | 'sitout'

export interface BettingPlayer {
  readonly seatIndex: number
  readonly status: SeatBettingStatus
  readonly stack: number // chips still BEHIND (not yet committed)
  readonly committedThisStreet: number // CONTRIB-STREET-001
  readonly committedTotal: number // CONTRIB-TOTAL-001
  readonly hasActedThisRound: boolean // acted since the last FULL bet/raise (reopen) or street start
}

export interface BettingRound {
  readonly street: Street
  readonly bigBlind: number
  readonly players: readonly BettingPlayer[] // ordered by seatIndex ascending
  readonly currentBet: number // highest committedThisStreet this round (HIGHEST CONTRIBUTION)
  readonly lastFullRaiseSize: number // current min-raise increment (>= bigBlind)
}

// ── Construction helpers ─────────────────────────────────────────────────────────────

export function makePlayer(
  input: { seatIndex: number; stack: number } & Partial<BettingPlayer>,
): BettingPlayer {
  const committedThisStreet = input.committedThisStreet ?? 0
  const player: BettingPlayer = {
    seatIndex: input.seatIndex,
    status: input.status ?? 'active',
    stack: input.stack,
    committedThisStreet,
    committedTotal: input.committedTotal ?? committedThisStreet,
    hasActedThisRound: input.hasActedThisRound ?? false,
  }
  assertCoin(player.stack, 'stack')
  assertCoin(player.committedThisStreet, 'committedThisStreet')
  assertCoin(player.committedTotal, 'committedTotal')
  return player
}

// Build a round; derives currentBet from the committed amounts and seeds the min-raise tracker
// at one big blind (BET-MIN-001 / the opening-bet-equivalent increment).
export function createRound(input: {
  street: Street
  bigBlind: number
  players: readonly BettingPlayer[]
  lastFullRaiseSize?: number
}): BettingRound {
  assertCoin(input.bigBlind, 'bigBlind')
  const currentBet = input.players.reduce((m, p) => Math.max(m, p.committedThisStreet), 0)
  const sorted = [...input.players].sort((a, b) => a.seatIndex - b.seatIndex)
  return {
    street: input.street,
    bigBlind: input.bigBlind,
    players: sorted,
    currentBet,
    lastFullRaiseSize: input.lastFullRaiseSize ?? input.bigBlind,
  }
}

// ── Pure getters ─────────────────────────────────────────────────────────────────────

export function getPlayer(round: BettingRound, seatIndex: number): BettingPlayer {
  const p = round.players.find((x) => x.seatIndex === seatIndex)
  if (!p) throw new Error(`betting: no player at seat ${seatIndex}`)
  return p
}

// ACTION-CALL-001: chips the player still owes to match the highest bet (0 if none).
export function amountToCall(round: BettingRound, seatIndex: number): number {
  const p = getPlayer(round, seatIndex)
  return Math.max(0, round.currentBet - p.committedThisStreet)
}

// BET-MIN-001: minimum opening bet = one big blind (only relevant when currentBet === 0).
export function minOpeningBet(round: BettingRound): number {
  return round.bigBlind
}

// RAISE-FULL-001 increment: the size a raise must add to count as a FULL (reopening) raise.
export function fullRaiseIncrement(round: BettingRound): number {
  return round.lastFullRaiseSize
}

// RAISE-MIN-001 expressed as "raise to" (RAISE-TO-001): the smallest legal full raise total.
export function minRaiseTo(round: BettingRound): number {
  return round.currentBet + round.lastFullRaiseSize
}

// BET-MAX-001: the largest "to" a seat can make = everything they have (No-Limit).
export function maxRaiseTo(round: BettingRound, seatIndex: number): number {
  const p = getPlayer(round, seatIndex)
  return p.committedThisStreet + p.stack
}

// A seat may RAISE only if betting is open to them: they have not acted since the last full
// bet/raise. This is the structural enforcement of ALLIN-NOREOPEN-001 ("no raising yourself"
// after a short all-in that did not reopen the action).
function mayRaise(player: BettingPlayer): boolean {
  return !player.hasActedThisRound
}

// ── Legal actions (ACTION-* / legal-action calculation) ──────────────────────────────

export type LegalAction =
  | { readonly type: 'fold' }
  | { readonly type: 'check' }
  | { readonly type: 'call'; readonly amount: number } // chips ADDED (= min(toCall, stack))
  | { readonly type: 'bet'; readonly min: number; readonly max: number } // "to" total this street
  | { readonly type: 'raise'; readonly min: number; readonly max: number } // "to" total this street
  | { readonly type: 'all_in'; readonly amount: number } // "to" total this street (committed + stack)

export function legalActions(round: BettingRound, seatIndex: number): LegalAction[] {
  const p = getPlayer(round, seatIndex)
  if (p.status !== 'active' || p.stack <= 0) return []

  const toCall = amountToCall(round, seatIndex)
  const allInTo = p.committedThisStreet + p.stack
  const actions: LegalAction[] = []

  if (toCall > 0) {
    // Facing a bet.
    actions.push({ type: 'fold' }) // ACTION-FOLD-001
    actions.push({ type: 'call', amount: Math.min(toCall, p.stack) }) // ALLIN-CALLSHORT-001 if stack<=toCall
    if (mayRaise(p) && p.stack > toCall) {
      const min = minRaiseTo(round)
      const max = allInTo
      if (max >= min) actions.push({ type: 'raise', min, max }) // RAISE-MIN-001 / BET-MAX-001
    }
  } else {
    // No outstanding bet to this player.
    actions.push({ type: 'check' }) // ACTION-CHECK-001
    if (round.currentBet === 0) {
      // Opening the betting (ACTION-BET-001).
      const min = minOpeningBet(round)
      if (p.stack >= min) actions.push({ type: 'bet', min, max: allInTo })
    } else if (mayRaise(p)) {
      // BB option to raise with no chips owed (ACTION-BB-OPTION-001 / ACTION-RAISE-001).
      const min = minRaiseTo(round)
      if (allInTo >= min) actions.push({ type: 'raise', min, max: allInTo })
    }
  }

  // ALLIN-001: a player may ALWAYS go all-in, even if short of a legal bet/raise — provided it
  // actually puts more chips in than simply checking/declining would (i.e. there is stack to
  // commit). Skip the duplicate when an exact full call already consumes the whole stack.
  const callIsAllIn = toCall > 0 && p.stack <= toCall
  if (!callIsAllIn) actions.push({ type: 'all_in', amount: allInTo })

  return actions
}

// ── Action application ─────────────────────────────────────────────────────────────────

export type BettingErrorCode =
  | 'NOT_ACTIVE'
  | 'CHECK_ILLEGAL'
  | 'NOTHING_TO_CALL'
  | 'BET_NOT_ALLOWED'
  | 'RAISE_NOT_REOPENED'
  | 'NOT_A_RAISE'
  | 'AMOUNT_NOT_INTEGER'
  | 'AMOUNT_BELOW_MIN'
  | 'AMOUNT_ABOVE_MAX'
  | 'UNKNOWN_ACTION'

export type AppliedAction =
  | { readonly type: 'fold' }
  | { readonly type: 'check' }
  | { readonly type: 'call' }
  | { readonly type: 'bet'; readonly to: number }
  | { readonly type: 'raise'; readonly to: number }
  | { readonly type: 'all_in' }

export type ActionResult =
  | { readonly ok: true; readonly round: BettingRound }
  | { readonly ok: false; readonly error: BettingErrorCode }

function fail(error: BettingErrorCode): ActionResult {
  return { ok: false, error }
}

// Rebuild the player list with one seat replaced, optionally reopening action for the others
// (ALLIN-REOPEN-001: a full bet/raise resets every other in-hand player's "acted" flag).
function rebuild(
  round: BettingRound,
  actorSeat: number,
  actor: BettingPlayer,
  opts: { reopen: boolean; currentBet: number; lastFullRaiseSize: number },
): BettingRound {
  const players = round.players.map((p) => {
    if (p.seatIndex === actorSeat) return actor
    if (opts.reopen && p.status === 'active' && p.stack > 0) {
      return { ...p, hasActedThisRound: false }
    }
    return p
  })
  return {
    ...round,
    players,
    currentBet: opts.currentBet,
    lastFullRaiseSize: opts.lastFullRaiseSize,
  }
}

// Apply a chip commitment of `addition` to the actor, returning the updated actor.
function commit(p: BettingPlayer, addition: number): BettingPlayer {
  const stack = p.stack - addition
  return {
    ...p,
    stack,
    committedThisStreet: p.committedThisStreet + addition,
    committedTotal: p.committedTotal + addition,
    status: stack === 0 ? 'allin' : p.status,
    hasActedThisRound: true,
  }
}

// Apply a "to"-style aggressive commitment (bet/raise/all-in) and compute reopening.
function applyAggressive(round: BettingRound, p: BettingPlayer, to: number): BettingRound {
  const addition = to - p.committedThisStreet
  const actor = commit(p, addition)
  const increment = to - round.currentBet
  const isFullRaise = increment >= round.lastFullRaiseSize
  if (isFullRaise) {
    // RAISE-FULL-001 / ALLIN-REOPEN-001: reopen, advance the min-raise tracker.
    return rebuild(round, p.seatIndex, actor, {
      reopen: true,
      currentBet: to,
      lastFullRaiseSize: increment,
    })
  }
  // ALLIN-SHORT-001 / ALLIN-CUMULATIVE-001: a short all-in raises the bet level but does NOT
  // reopen and does NOT change the last-full-raise size (no aggregation).
  return rebuild(round, p.seatIndex, actor, {
    reopen: false,
    currentBet: to,
    lastFullRaiseSize: round.lastFullRaiseSize,
  })
}

function validToAmount(amount: unknown): amount is number {
  return typeof amount === 'number' && Number.isInteger(amount) && amount >= 0
}

// Apply an action for `seatIndex`. PURE — returns a new round or a typed error.
export function applyAction(round: BettingRound, seatIndex: number, action: AppliedAction): ActionResult {
  const p = getPlayer(round, seatIndex)
  if (p.status !== 'active' || p.stack <= 0) return fail('NOT_ACTIVE')

  const toCall = amountToCall(round, seatIndex)

  switch (action.type) {
    case 'fold': {
      const actor: BettingPlayer = { ...p, status: 'folded', hasActedThisRound: true }
      return { ok: true, round: rebuild(round, seatIndex, actor, { reopen: false, currentBet: round.currentBet, lastFullRaiseSize: round.lastFullRaiseSize }) }
    }

    case 'check': {
      if (toCall !== 0) return fail('CHECK_ILLEGAL') // ACTION-CHECK-001
      const actor: BettingPlayer = { ...p, hasActedThisRound: true }
      return { ok: true, round: rebuild(round, seatIndex, actor, { reopen: false, currentBet: round.currentBet, lastFullRaiseSize: round.lastFullRaiseSize }) }
    }

    case 'call': {
      if (toCall <= 0) return fail('NOTHING_TO_CALL')
      const pay = Math.min(toCall, p.stack) // ALLIN-CALLSHORT-001 (all-in for less)
      const actor = commit(p, pay)
      // A call never raises the bet level and never reopens.
      return { ok: true, round: rebuild(round, seatIndex, actor, { reopen: false, currentBet: round.currentBet, lastFullRaiseSize: round.lastFullRaiseSize }) }
    }

    case 'bet': {
      if (round.currentBet !== 0 || toCall !== 0) return fail('BET_NOT_ALLOWED')
      if (!validToAmount(action.to)) return fail('AMOUNT_NOT_INTEGER')
      const max = maxRaiseTo(round, seatIndex)
      if (action.to > max) return fail('AMOUNT_ABOVE_MAX') // BET-MAX-001
      const isAllIn = action.to === max
      if (action.to < minOpeningBet(round) && !isAllIn) return fail('AMOUNT_BELOW_MIN') // BET-MIN-001
      if (action.to <= 0) return fail('AMOUNT_BELOW_MIN')
      return { ok: true, round: applyAggressive(round, p, action.to) }
    }

    case 'raise': {
      if (round.currentBet <= 0) return fail('BET_NOT_ALLOWED') // there is nothing to raise → must bet
      if (!mayRaise(p)) return fail('RAISE_NOT_REOPENED') // ALLIN-NOREOPEN-001
      if (!validToAmount(action.to)) return fail('AMOUNT_NOT_INTEGER')
      if (action.to <= round.currentBet) return fail('NOT_A_RAISE')
      const max = maxRaiseTo(round, seatIndex)
      if (action.to > max) return fail('AMOUNT_ABOVE_MAX') // BET-MAX-001
      const isAllIn = action.to === max
      if (action.to < minRaiseTo(round) && !isAllIn) return fail('AMOUNT_BELOW_MIN') // RAISE-MIN-001
      return { ok: true, round: applyAggressive(round, p, action.to) }
    }

    case 'all_in': {
      const to = p.committedThisStreet + p.stack // ALLIN-001
      if (to <= round.currentBet) {
        // All-in is a call for less (or exact) — no raise, no reopen (ALLIN-CALLSHORT-001).
        const actor = commit(p, p.stack)
        return { ok: true, round: rebuild(round, seatIndex, actor, { reopen: false, currentBet: round.currentBet, lastFullRaiseSize: round.lastFullRaiseSize }) }
      }
      // All-in raises the bet level: full or short is decided inside applyAggressive.
      return { ok: true, round: applyAggressive(round, p, to) }
    }

    default:
      return fail('UNKNOWN_ACTION')
  }
}

// ── Round completion (ROUND-COMPLETE-001) ────────────────────────────────────────────

function inHand(p: BettingPlayer): boolean {
  return p.status === 'active' || p.status === 'allin'
}

export function isRoundComplete(round: BettingRound): boolean {
  const contenders = round.players.filter(inHand)
  if (contenders.length <= 1) return true // POT-ONELEFT-001 / only one unfolded

  const actionable = round.players.filter((p) => p.status === 'active' && p.stack > 0)
  if (actionable.length === 0) return true // everyone all-in (ROUND-ALLIN-RUNOUT-001)

  // Every actionable player has acted since the last full raise AND has matched the bet.
  return actionable.every((p) => p.hasActedThisRound && p.committedThisStreet === round.currentBet)
}

// True when no further betting is possible and the board should simply run out to showdown
// (ROUND-ALLIN-RUNOUT-001): at most one player still has chips behind.
export function isAllInRunout(round: BettingRound): boolean {
  const contenders = round.players.filter(inHand)
  if (contenders.length <= 1) return false // that's "one left", settled without a runout
  const withChips = contenders.filter((p) => p.status === 'active' && p.stack > 0)
  return withChips.length <= 1
}

// ── Street advance (ROUND-ADVANCE-001) ────────────────────────────────────────────────
// Reset per-street contributions and the min-raise tracker for the next street. Folded and
// all-in seats keep their status; active seats are re-armed to act.
export function advanceStreet(round: BettingRound, nextStreet: Street): BettingRound {
  const players = round.players.map((p) => ({
    ...p,
    committedThisStreet: 0,
    hasActedThisRound: false,
  }))
  return {
    street: nextStreet,
    bigBlind: round.bigBlind,
    players,
    currentBet: 0,
    lastFullRaiseSize: round.bigBlind,
  }
}
