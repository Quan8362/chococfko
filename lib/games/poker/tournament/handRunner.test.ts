import test from 'node:test'
import assert from 'node:assert/strict'
import {
  liveView, applyAction, settle, isComplete, holeCardsForSeat,
  type TournamentHandConfig, type LoggedAction,
} from './handRunner.ts'
import type { AppliedAction } from '../betting.ts'

function cfg(seatCount: number, seed = 42): TournamentHandConfig {
  return {
    seed, handNo: 1, bigBlind: 50, smallBlind: 25, buttonSeat: 0,
    seats: Array.from({ length: seatCount }, (_, i) => ({ seatIndex: i, stack: 5000 })),
  }
}

// Drive a full hand by always taking the passive line: check if legal, else call, else fold.
function playPassive(config: TournamentHandConfig): LoggedAction[] {
  let log: LoggedAction[] = []
  for (let guard = 0; guard < 200; guard++) {
    const view = liveView(config, log)
    if (view.complete || view.turnSeat === null || !view.legal) break
    const allowed = view.legal.allowed
    const action: AppliedAction = allowed.includes('check') ? { type: 'check' }
      : allowed.includes('call') ? { type: 'call' }
      : { type: 'fold' }
    const res = applyAction(config, log, view.turnSeat, action)
    assert.ok(res.ok, `passive action rejected: ${!res.ok && res.error}`)
    log = res.log
    if (res.complete) break
  }
  return log
}

function conserves(config: TournamentHandConfig, deltas: { seatIndex: number; delta: number }[]) {
  const sum = deltas.reduce((a, d) => a + d.delta, 0)
  assert.equal(sum, 0, 'chip deltas must sum to 0')
  for (const d of deltas) {
    const start = config.seats.find((s) => s.seatIndex === d.seatIndex)!.stack
    assert.ok(start + d.delta >= 0, `seat ${d.seatIndex} would go negative`)
  }
}

test('HR-001 heads-up fold: completes as one_left, deltas conserve, folder loses', () => {
  const config = cfg(2)
  const view0 = liveView(config, [])
  assert.equal(view0.complete, false)
  assert.notEqual(view0.turnSeat, null)          // preflop actor exists
  assert.ok(view0.legal && view0.legal.allowed.includes('fold'))
  const res = applyAction(config, [], view0.turnSeat!, { type: 'fold' })
  assert.ok(res.ok && res.complete, 'HU fold should complete the hand')
  const deltas = settle(config, (res as { log: LoggedAction[] }).log)
  conserves(config, deltas)
  const folder = deltas.find((d) => d.seatIndex === view0.turnSeat)!
  assert.ok(folder.delta <= 0, 'the folder cannot profit')
})

test('HR-002 full checked-down showdown (2..6 seats) conserves chips and completes', () => {
  for (const n of [2, 3, 4, 6]) {
    const config = cfg(n, 100 + n)
    const log = playPassive(config)
    assert.ok(isComplete(config, log), `n=${n}: passive line should complete the hand`)
    const deltas = settle(config, log)
    conserves(config, deltas)
    assert.equal(deltas.length, n)
  }
})

test('HR-003 applyAction enforces turn + legality + completion', () => {
  const config = cfg(3)
  const view = liveView(config, [])
  const wrongSeat = config.seats.map((s) => s.seatIndex).find((s) => s !== view.turnSeat)!
  const outOfTurn = applyAction(config, [], wrongSeat, { type: 'call' })
  assert.ok(!outOfTurn.ok && outOfTurn.error === 'not_your_turn', 'out-of-turn must be rejected')

  const log = playPassive(config)
  const afterComplete = applyAction(config, log, 0, { type: 'check' })
  assert.ok(!afterComplete.ok && afterComplete.error === 'hand_complete', 'action after completion rejected')
})

test('HR-004 settle() refuses an unfinished hand', () => {
  const config = cfg(2)
  assert.throws(() => settle(config, []), /unfinished/)
})

test('HR-005 hole cards are per-seat, two cards, distinct across seats', () => {
  const config = cfg(3)
  const h0 = holeCardsForSeat(config, 0)
  const h1 = holeCardsForSeat(config, 1)
  assert.equal(h0.length, 2)
  const all = [...h0, ...h1, ...holeCardsForSeat(config, 2)]
  assert.equal(new Set(all).size, 6, 'all six hole cards must be distinct')
})

test('HR-006 an all-in preflop runs out to showdown and conserves', () => {
  const config = cfg(2, 7)
  // seat to act shoves; other calls → runout to showdown.
  const v = liveView(config, [])
  const r1 = applyAction(config, [], v.turnSeat!, { type: 'all_in' })
  assert.ok(r1.ok)
  let log = (r1 as { log: LoggedAction[] }).log
  const v2 = liveView(config, log)
  if (!v2.complete && v2.turnSeat !== null) {
    const r2 = applyAction(config, log, v2.turnSeat, { type: 'call' })
    assert.ok(r2.ok)
    log = (r2 as { log: LoggedAction[] }).log
  }
  assert.ok(isComplete(config, log), 'all-in + call should complete via runout')
  conserves(config, settle(config, log))
})
