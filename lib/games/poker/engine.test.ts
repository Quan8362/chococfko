// Framework-free tests for the full-hand orchestrator (determinism + replay).
// Run with:  node --test lib/games/poker/engine.test.ts
//
// Maps to ENGINE-DETERMINISM-001, ENGINE-REPLAY-001, ROUND-ALLIN-RUNOUT-001, POT-ONELEFT-001,
// POT-CONSERVE-001 (end-to-end).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { playHand, replayHand, type HandConfig, type ScriptedAction } from './engine.ts'
import { isSettlementConserved, type SeatContribution } from './pot.ts'

// 3-handed: button=0, SB=1 (50), BB=2 (100), stacks 1000.
const config3: HandConfig = {
  seed: 4242,
  bigBlind: 100,
  buttonSeat: 0,
  seats: [
    { seatIndex: 0, stack: 1000 },
    { seatIndex: 1, stack: 1000 },
    { seatIndex: 2, stack: 1000 },
  ],
}

// A checked-down hand: preflop UTG=button(0) → 1 → 2(BB option), then check/check/check on
// flop/turn/river starting left of the button.
const checkedDown: ScriptedAction[] = [
  { seatIndex: 0, action: { type: 'call' } },
  { seatIndex: 1, action: { type: 'call' } },
  { seatIndex: 2, action: { type: 'check' } },
  // flop (order 1,2,0)
  { seatIndex: 1, action: { type: 'check' } },
  { seatIndex: 2, action: { type: 'check' } },
  { seatIndex: 0, action: { type: 'check' } },
  // turn
  { seatIndex: 1, action: { type: 'check' } },
  { seatIndex: 2, action: { type: 'check' } },
  { seatIndex: 0, action: { type: 'check' } },
  // river
  { seatIndex: 1, action: { type: 'check' } },
  { seatIndex: 2, action: { type: 'check' } },
  { seatIndex: 0, action: { type: 'check' } },
]

// ── ENGINE-DETERMINISM-001 ───────────────────────────────────────────────────────────
test('ENGINE-DETERMINISM-001 same seed + actions → identical cards, board, winners', () => {
  const a = playHand(config3, checkedDown)
  const b = playHand(config3, checkedDown)
  assert.deepEqual(a.board, b.board)
  assert.deepEqual(
    Array.from(a.holeBySeat.entries()),
    Array.from(b.holeBySeat.entries()),
  )
  assert.deepEqual(a.showdown.payouts, b.showdown.payouts)
  assert.deepEqual(a.showdown.winnersByPot, b.showdown.winnersByPot)
})

test('a different seed generally changes the board', () => {
  const a = playHand(config3, checkedDown)
  const b = playHand({ ...config3, seed: 999 }, checkedDown)
  assert.notDeepEqual(a.board, b.board)
})

// ── Pot is fully distributed & conserved end-to-end (POT-CONSERVE-001) ───────────────
test('checked-down hand distributes the whole pot and conserves coins', () => {
  const r = playHand(config3, checkedDown)
  const contribs: SeatContribution[] = [
    { seatIndex: 0, committed: 100, folded: false },
    { seatIndex: 1, committed: 100, folded: false },
    { seatIndex: 2, committed: 100, folded: false },
  ]
  const totalPaid = r.showdown.payouts.reduce((s, p) => s + p.amount, 0)
  assert.equal(totalPaid + (r.showdown.refund?.amount ?? 0), 300)
  assert.ok(isSettlementConserved(contribs, r.showdown.payouts, r.showdown.refund))
  assert.ok(r.showdown.wentToShowdown)
})

// ── ENGINE-REPLAY-001 ────────────────────────────────────────────────────────────────
test('ENGINE-REPLAY-001 replaying the recorded action log reproduces the settlement', () => {
  const first = playHand(config3, checkedDown)
  const replayed = replayHand(config3, first.actionLog)
  assert.deepEqual(replayed.showdown.payouts, first.showdown.payouts)
  assert.deepEqual(replayed.board, first.board)
  assert.deepEqual(replayed.showdown.reveal, first.showdown.reveal)
  // The log consumed equals the log replayed (audit fidelity).
  assert.deepEqual(replayed.actionLog, first.actionLog)
})

// ── POT-ONELEFT-001: everyone folds to the big blind ─────────────────────────────────
test('POT-ONELEFT-001 folds to the BB → BB wins the dead blinds, no reveal', () => {
  const script: ScriptedAction[] = [
    { seatIndex: 0, action: { type: 'fold' } },
    { seatIndex: 1, action: { type: 'fold' } }, // SB folds, only BB (seat 2) remains
  ]
  const r = playHand(config3, script)
  assert.equal(r.showdown.wentToShowdown, false)
  assert.deepEqual(r.showdown.reveal, []) // winner never shows
  const contribs: SeatContribution[] = [
    { seatIndex: 0, committed: 0, folded: true },
    { seatIndex: 1, committed: 50, folded: true },
    { seatIndex: 2, committed: 100, folded: false },
  ]
  // Uncalled 50 refunded to BB; BB wins the SB's 50 dead.
  assert.deepEqual(r.showdown.refund, { seatIndex: 2, amount: 50 })
  assert.equal(r.showdown.payouts.find((p) => p.seatIndex === 2)?.amount, 100)
  assert.ok(isSettlementConserved(contribs, r.showdown.payouts, r.showdown.refund))
})

// ── ROUND-ALLIN-RUNOUT-001: heads-up all-in preflop → board runs out ─────────────────
test('ROUND-ALLIN-RUNOUT-001 heads-up all-in preflop runs the board to showdown', () => {
  const hu: HandConfig = {
    seed: 7,
    bigBlind: 100,
    buttonSeat: 0,
    seats: [
      { seatIndex: 0, stack: 1000 },
      { seatIndex: 1, stack: 1000 },
    ],
  }
  // Heads-up: button(0)=SB acts first preflop.
  const script: ScriptedAction[] = [
    { seatIndex: 0, action: { type: 'all_in' } }, // to 1000
    { seatIndex: 1, action: { type: 'all_in' } }, // call all-in to 1000
  ]
  const r = playHand(hu, script)
  assert.equal(r.board.length, 5) // full board dealt for the runout
  assert.ok(r.showdown.wentToShowdown)
  const totalPaid = r.showdown.payouts.reduce((s, p) => s + p.amount, 0)
  assert.equal(totalPaid + (r.showdown.refund?.amount ?? 0), 2000) // whole pot awarded
  const contribs: SeatContribution[] = [
    { seatIndex: 0, committed: 1000, folded: false },
    { seatIndex: 1, committed: 1000, folded: false },
  ]
  assert.ok(isSettlementConserved(contribs, r.showdown.payouts, r.showdown.refund))
})

test('playHand rejects out-of-turn scripted actions', () => {
  const bad: ScriptedAction[] = [{ seatIndex: 2, action: { type: 'call' } }] // seat 0 is UTG
  assert.throws(() => playHand(config3, bad), /out-of-turn/)
})
