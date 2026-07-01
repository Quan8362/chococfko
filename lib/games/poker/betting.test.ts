// Framework-free tests for the No-Limit betting state machine.
// Run with:  node --test lib/games/poker/betting.test.ts
//
// Maps to ACTION-*, BET-MIN-001, RAISE-MIN/FULL/TO-001, BET-MAX-001, ALLIN-* (SHORT/CUMULATIVE/
// REOPEN/NOREOPEN/CALLSHORT), ROUND-COMPLETE/ADVANCE-001.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  makePlayer,
  createRound,
  amountToCall,
  minOpeningBet,
  minRaiseTo,
  maxRaiseTo,
  fullRaiseIncrement,
  legalActions,
  applyAction,
  isRoundComplete,
  isAllInRunout,
  advanceStreet,
  type BettingRound,
  type BettingPlayer,
  type AppliedAction,
} from './betting.ts'

// Apply an action and assert it was legal, returning the new round.
function ok(round: BettingRound, seat: number, action: AppliedAction): BettingRound {
  const r = applyAction(round, seat, action)
  assert.ok(r.ok, `expected ${action.type} at seat ${seat} to be legal, got ${r.ok ? '' : r.error}`)
  return (r as { ok: true; round: BettingRound }).round
}
function err(round: BettingRound, seat: number, action: AppliedAction): string {
  const r = applyAction(round, seat, action)
  assert.ok(!r.ok, `expected ${action.type} at seat ${seat} to be ILLEGAL`)
  return (r as { ok: false; error: string }).error
}
function player(round: BettingRound, seat: number): BettingPlayer {
  return round.players.find((p) => p.seatIndex === seat)!
}

// A standard 3-handed preflop: button=0, SB=1 (50), BB=2 (100). Stacks 1000 each.
function preflop3(stack = 1000): BettingRound {
  return createRound({
    street: 'PREFLOP',
    bigBlind: 100,
    players: [
      makePlayer({ seatIndex: 0, stack }),
      makePlayer({ seatIndex: 1, stack: stack - 50, committedThisStreet: 50, committedTotal: 50 }),
      makePlayer({ seatIndex: 2, stack: stack - 100, committedThisStreet: 100, committedTotal: 100 }),
    ],
  })
}

// A postflop round: button=0, three active players, no bet yet.
function postflop3(stack = 1000): BettingRound {
  return createRound({
    street: 'FLOP',
    bigBlind: 100,
    players: [
      makePlayer({ seatIndex: 0, stack }),
      makePlayer({ seatIndex: 1, stack }),
      makePlayer({ seatIndex: 2, stack }),
    ],
  })
}

// ── ACTION-CHECK-001: check legal only when nothing to call ──────────────────────────
test('ACTION-CHECK-001 check legal only when amount-to-call is zero', () => {
  const flop = postflop3()
  assert.equal(amountToCall(flop, 0), 0)
  assert.ok(legalActions(flop, 0).some((a) => a.type === 'check'))
  ok(flop, 0, { type: 'check' })

  // Facing the big blind preflop, UTG (seat 0) cannot check.
  const pre = preflop3()
  assert.equal(amountToCall(pre, 0), 100)
  assert.ok(!legalActions(pre, 0).some((a) => a.type === 'check'))
  assert.equal(err(pre, 0, { type: 'check' }), 'CHECK_ILLEGAL')
})

// ── ACTION-CALL-001: call amount = amount to call ────────────────────────────────────
test('ACTION-CALL-001 call amount equals the outstanding bet', () => {
  const pre = preflop3()
  assert.equal(amountToCall(pre, 0), 100)
  const call = legalActions(pre, 0).find((a) => a.type === 'call')
  assert.deepEqual(call, { type: 'call', amount: 100 })
  const after = ok(pre, 0, { type: 'call' })
  assert.equal(player(after, 0).committedThisStreet, 100)
  assert.equal(player(after, 0).stack, 900)
})

// ── BET-MIN-001: minimum opening bet = one big blind ─────────────────────────────────
test('BET-MIN-001 opening bet must be at least the big blind', () => {
  const flop = postflop3()
  assert.equal(minOpeningBet(flop), 100)
  assert.equal(err(flop, 0, { type: 'bet', to: 50 }), 'AMOUNT_BELOW_MIN')
  const after = ok(flop, 0, { type: 'bet', to: 100 })
  assert.equal(after.currentBet, 100)
  assert.equal(player(after, 0).committedThisStreet, 100)
})

// ── RAISE-MIN-001 / RAISE-TO-001: first preflop raise ≥ 2×BB ─────────────────────────
test('RAISE-MIN-001 minimum raise-to is currentBet + last full raise', () => {
  const pre = preflop3()
  assert.equal(minRaiseTo(pre), 200) // 100 + 100
  assert.equal(fullRaiseIncrement(pre), 100)
  assert.equal(err(pre, 0, { type: 'raise', to: 150 }), 'AMOUNT_BELOW_MIN')
  const after = ok(pre, 0, { type: 'raise', to: 200 })
  assert.equal(after.currentBet, 200)
  assert.equal(after.lastFullRaiseSize, 100) // increment was exactly one BB
  assert.equal(minRaiseTo(after), 300)
})

// ── Multiple raise sequences (RAISE-MIN-001 advancing) ───────────────────────────────
test('multiple raise sequence advances the min-raise tracker', () => {
  let r = preflop3()
  r = ok(r, 0, { type: 'raise', to: 300 }) // +200 full raise
  assert.equal(r.currentBet, 300)
  assert.equal(r.lastFullRaiseSize, 200)
  assert.equal(minRaiseTo(r), 500)
  r = ok(r, 1, { type: 'raise', to: 500 }) // +200 full raise (min legal)
  assert.equal(r.currentBet, 500)
  assert.equal(r.lastFullRaiseSize, 200)
  assert.equal(err(r, 2, { type: 'raise', to: 600 }), 'AMOUNT_BELOW_MIN') // needs ≥ 700
  r = ok(r, 2, { type: 'raise', to: 700 })
  assert.equal(r.currentBet, 700)
})

// ── RAISE-FULL-001 / ALLIN-REOPEN-001: a full raise reopens betting ──────────────────
test('RAISE-FULL-001 a full raise reopens action for players who already acted', () => {
  let r = postflop3()
  r = ok(r, 0, { type: 'bet', to: 100 }) // opener
  r = ok(r, 1, { type: 'call' }) // seat 1 has now acted
  assert.equal(player(r, 1).hasActedThisRound, true)
  r = ok(r, 2, { type: 'raise', to: 300 }) // full raise
  // Everyone else with chips is re-armed to act (ALLIN-REOPEN-001).
  assert.equal(player(r, 0).hasActedThisRound, false)
  assert.equal(player(r, 1).hasActedThisRound, false)
  assert.equal(player(r, 2).hasActedThisRound, true) // the raiser has acted
})

// ── ALLIN-SHORT-001 + ALLIN-NOREOPEN-001 ─────────────────────────────────────────────
test('ALLIN-SHORT-001 short all-in raises the level but does NOT reopen', () => {
  // Seats: 0 (1000), 1 (1000), 2 short stack 150.
  let r = createRound({
    street: 'FLOP',
    bigBlind: 100,
    players: [
      makePlayer({ seatIndex: 0, stack: 1000 }),
      makePlayer({ seatIndex: 1, stack: 1000 }),
      makePlayer({ seatIndex: 2, stack: 150 }),
    ],
  })
  r = ok(r, 0, { type: 'bet', to: 100 }) // full bet, last full raise = 100
  r = ok(r, 1, { type: 'call' }) // seat 1 acted, matched 100
  // seat 2 all-in for 150 → increment 50 < 100 = short all-in.
  r = ok(r, 2, { type: 'all_in' })
  assert.equal(r.currentBet, 150)
  assert.equal(r.lastFullRaiseSize, 100) // tracker UNCHANGED (no aggregation)
  assert.equal(player(r, 2).status, 'allin')
  // seat 1 already acted and faces only a short raise → cannot re-raise (ALLIN-NOREOPEN-001).
  assert.equal(player(r, 1).hasActedThisRound, true)
  assert.equal(err(r, 1, { type: 'raise', to: 400 }), 'RAISE_NOT_REOPENED')
  const acts = legalActions(r, 1)
  assert.ok(acts.some((a) => a.type === 'call'))
  assert.ok(!acts.some((a) => a.type === 'raise')) // only call/fold
  assert.ok(acts.some((a) => a.type === 'fold'))
})

// ── ALLIN-CUMULATIVE-001: multiple short all-ins do not aggregate into a reopen ──────
test('ALLIN-CUMULATIVE-001 cumulative short all-ins still do not reopen', () => {
  let r = createRound({
    street: 'FLOP',
    bigBlind: 100,
    players: [
      makePlayer({ seatIndex: 0, stack: 1000 }),
      makePlayer({ seatIndex: 1, stack: 170 }),
      makePlayer({ seatIndex: 2, stack: 230 }),
    ],
  })
  r = ok(r, 0, { type: 'bet', to: 100 })
  r = ok(r, 1, { type: 'all_in' }) // to 170, +70 short
  assert.equal(r.currentBet, 170)
  assert.equal(r.lastFullRaiseSize, 100)
  r = ok(r, 2, { type: 'all_in' }) // to 230, +60 over 170 short again
  assert.equal(r.currentBet, 230)
  assert.equal(r.lastFullRaiseSize, 100) // two shorts together (130) never reopen
  // Original bettor faces 230 but the action was never fully reopened → call or fold only.
  assert.equal(err(r, 0, { type: 'raise', to: 500 }), 'RAISE_NOT_REOPENED')
})

// A FULL raise after shorts DOES reopen (RAISE-FULL-001).
test('a full raise after short all-ins reopens betting again', () => {
  let r = createRound({
    street: 'FLOP',
    bigBlind: 100,
    players: [
      makePlayer({ seatIndex: 0, stack: 1000 }),
      makePlayer({ seatIndex: 1, stack: 150 }),
      makePlayer({ seatIndex: 2, stack: 1000 }),
    ],
  })
  r = ok(r, 0, { type: 'bet', to: 100 })
  r = ok(r, 1, { type: 'all_in' }) // short to 150
  r = ok(r, 2, { type: 'raise', to: 400 }) // +250 over 150 ≥ 100 → FULL raise, reopens
  assert.equal(r.lastFullRaiseSize, 250)
  assert.equal(player(r, 0).hasActedThisRound, false) // reopened
  assert.ok(legalActions(r, 0).some((a) => a.type === 'raise'))
})

// ── BET-MAX-001 / maximum raise ──────────────────────────────────────────────────────
test('BET-MAX-001 maximum raise-to is the whole stack; over-max is rejected', () => {
  const pre = preflop3()
  assert.equal(maxRaiseTo(pre, 0), 1000)
  assert.equal(err(pre, 0, { type: 'raise', to: 1001 }), 'AMOUNT_ABOVE_MAX')
  const allIn = ok(pre, 0, { type: 'raise', to: 1000 })
  assert.equal(player(allIn, 0).status, 'allin')
  assert.equal(player(allIn, 0).stack, 0)
})

// ── ALLIN-CALLSHORT-001: all-in call for less than a call ────────────────────────────
test('ALLIN-CALLSHORT-001 all-in for less than a call contests only what it covers', () => {
  // seat 1 must call 100 but has only 60.
  let r = createRound({
    street: 'PREFLOP',
    bigBlind: 100,
    players: [
      makePlayer({ seatIndex: 0, stack: 1000, committedThisStreet: 100, committedTotal: 100, hasActedThisRound: true }),
      makePlayer({ seatIndex: 1, stack: 60 }),
    ],
  })
  assert.equal(amountToCall(r, 1), 100)
  const acts = legalActions(r, 1)
  // The call IS the all-in (stack ≤ toCall): one call option for 60, no separate all-in.
  assert.deepEqual(acts.find((a) => a.type === 'call'), { type: 'call', amount: 60 })
  assert.ok(!acts.some((a) => a.type === 'all_in'))
  r = ok(r, 1, { type: 'all_in' })
  assert.equal(player(r, 1).committedThisStreet, 60)
  assert.equal(player(r, 1).status, 'allin')
  assert.equal(r.currentBet, 100) // a short call never raises the bet level
})

// ── ROUND-COMPLETE-001 ───────────────────────────────────────────────────────────────
test('ROUND-COMPLETE-001 preflop completes after limps + BB option check', () => {
  let r = preflop3()
  assert.ok(!isRoundComplete(r))
  r = ok(r, 0, { type: 'call' }) // UTG/button limps
  assert.ok(!isRoundComplete(r))
  r = ok(r, 1, { type: 'call' }) // SB completes
  assert.ok(!isRoundComplete(r)) // BB still has the option (ACTION-BB-OPTION-001)
  assert.equal(amountToCall(r, 2), 0)
  r = ok(r, 2, { type: 'check' }) // BB checks option
  assert.ok(isRoundComplete(r))
})

test('ROUND-COMPLETE-001 a bet is not complete until callers respond', () => {
  let r = postflop3()
  r = ok(r, 0, { type: 'bet', to: 200 })
  assert.ok(!isRoundComplete(r))
  r = ok(r, 1, { type: 'call' })
  assert.ok(!isRoundComplete(r))
  r = ok(r, 2, { type: 'fold' })
  assert.ok(isRoundComplete(r)) // seat0 (acted+matched) and seat1 (matched) → done
})

test('ROUND-COMPLETE-001 one player left after folds completes immediately', () => {
  let r = postflop3()
  r = ok(r, 0, { type: 'bet', to: 200 })
  r = ok(r, 1, { type: 'fold' })
  r = ok(r, 2, { type: 'fold' })
  assert.ok(isRoundComplete(r)) // only seat 0 remains unfolded
})

// ── ROUND-ALLIN-RUNOUT-001 ───────────────────────────────────────────────────────────
test('ROUND-ALLIN-RUNOUT-001 all-but-one all-in → runout, no further betting', () => {
  let r = createRound({
    street: 'PREFLOP',
    bigBlind: 100,
    players: [
      makePlayer({ seatIndex: 0, stack: 300 }),
      makePlayer({ seatIndex: 1, stack: 250, committedThisStreet: 50, committedTotal: 50 }),
      makePlayer({ seatIndex: 2, stack: 200, committedThisStreet: 100, committedTotal: 100 }),
    ],
  })
  r = ok(r, 0, { type: 'all_in' }) // to 300
  r = ok(r, 1, { type: 'all_in' }) // to 300 (call all-in)
  r = ok(r, 2, { type: 'all_in' }) // to 300 (call all-in)
  assert.ok(isAllInRunout(r))
  assert.ok(isRoundComplete(r))
})

// ── ROUND-ADVANCE-001 ────────────────────────────────────────────────────────────────
test('ROUND-ADVANCE-001 advancing street resets contributions and the raise tracker', () => {
  let r = preflop3()
  r = ok(r, 0, { type: 'raise', to: 300 })
  r = ok(r, 1, { type: 'call' })
  r = ok(r, 2, { type: 'call' })
  const flop = advanceStreet(r, 'FLOP')
  assert.equal(flop.street, 'FLOP')
  assert.equal(flop.currentBet, 0)
  assert.equal(flop.lastFullRaiseSize, 100) // back to one BB
  for (const p of flop.players) {
    assert.equal(p.committedThisStreet, 0)
    assert.equal(p.hasActedThisRound, false)
  }
  // committedTotal is preserved for pot construction.
  assert.equal(player(flop, 0).committedTotal, 300)
})

test('a folded/all-in seat has no legal actions', () => {
  let r = postflop3()
  r = ok(r, 0, { type: 'bet', to: 100 })
  r = ok(r, 1, { type: 'fold' })
  assert.deepEqual(legalActions(r, 1), [])
  assert.equal(err(r, 1, { type: 'call' }), 'NOT_ACTIVE')
})

test('applyAction is pure — it does not mutate the input round', () => {
  const r = postflop3()
  const snapshotBet = r.currentBet
  const snapshotStack = player(r, 0).stack
  applyAction(r, 0, { type: 'bet', to: 300 })
  assert.equal(r.currentBet, snapshotBet)
  assert.equal(player(r, 0).stack, snapshotStack)
})
