// Unit tests for the pure poker admin/operations logic.
// Run with:  node --test lib/games/poker/admin.test.ts
//
// Covers the four gated guarantees from the operations spec — incident state machine, audit
// redaction (no card/secret leak), hand-replay reconstruction (pot construction + settlement
// reconciliation), and anti-abuse signal evidence — none of which touch the DB.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  INCIDENT_STATES,
  canTransitionIncident,
  isTerminalIncident,
  transitionRequiresResolution,
  scrubDetail,
  assertDetailClean,
  reconstructReplay,
  computeCollusionSignals,
  defaultOpsSeverity,
  OPS_EVENT_KINDS,
  type ReplayActionInput,
} from './admin.ts'

// ── 1. Incident state machine ──────────────────────────────────────────────────────────
test('incident: legal forward transitions', () => {
  assert.equal(canTransitionIncident('OPEN', 'INVESTIGATING'), true)
  assert.equal(canTransitionIncident('OPEN', 'RESOLVED'), true)
  assert.equal(canTransitionIncident('OPEN', 'DISMISSED'), true)
  assert.equal(canTransitionIncident('INVESTIGATING', 'RESOLVED'), true)
  assert.equal(canTransitionIncident('INVESTIGATING', 'OPEN'), true)
})

test('incident: REFUNDED is never a generic transition target', () => {
  for (const s of INCIDENT_STATES) {
    assert.equal(canTransitionIncident(s, 'REFUNDED'), false)
  }
})

test('incident: terminal states cannot transition further', () => {
  for (const s of ['RESOLVED', 'REFUNDED', 'DISMISSED'] as const) {
    assert.equal(isTerminalIncident(s), true)
    for (const to of INCIDENT_STATES) {
      assert.equal(canTransitionIncident(s, to), false)
    }
  }
})

test('incident: resolution required only for terminal RESOLVED/DISMISSED', () => {
  assert.equal(transitionRequiresResolution('RESOLVED'), true)
  assert.equal(transitionRequiresResolution('DISMISSED'), true)
  assert.equal(transitionRequiresResolution('INVESTIGATING'), false)
  assert.equal(transitionRequiresResolution('OPEN'), false)
})

// ── 2. Redaction ───────────────────────────────────────────────────────────────────────
test('scrubDetail removes secret-bearing keys', () => {
  const cleaned = scrubDetail({
    reason: 'review',
    cards: ['As', 'Kd'],
    deck: { seed: 12345, stub: ['2c', '3d'] },
    password_hash: 'scrypt$abc',
    token: 'eyJ...',
    nested: { holeCards: ['Qh', 'Qs'], note: 'ok' },
    safe: 42,
  })
  assert.equal(cleaned.cards, '[redacted]')
  assert.equal(cleaned.password_hash, '[redacted]')
  assert.equal(cleaned.token, '[redacted]')
  assert.equal((cleaned.deck as Record<string, unknown>), '[redacted]')
  assert.equal((cleaned.nested as Record<string, unknown>).holeCards, '[redacted]')
  assert.equal((cleaned.nested as Record<string, unknown>).note, 'ok')
  assert.equal(cleaned.safe, 42)
  assert.equal(cleaned.reason, 'review')
})

test('scrubDetail redacts bare card arrays even under innocuous keys', () => {
  const cleaned = scrubDetail({ payload: ['Ah', 'Kc'] })
  assert.equal(cleaned.payload, '[redacted]')
})

test('assertDetailClean throws on card / secret leaks but passes clean payloads', () => {
  assert.throws(() => assertDetailClean({ x: ['As', 'Kd'] }))
  assert.throws(() => assertDetailClean({ holeCards: 'whatever' }))
  assert.throws(() => assertDetailClean({ seed: 7 }))
  assert.doesNotThrow(() => assertDetailClean({ reason: 'pause', total_refunded: 1500, phase: 'PAUSED_FOR_REVIEW' }))
})

// ── 3. Hand replay reconstruction ────────────────────────────────────────────────────────
function a(over: Partial<ReplayActionInput> & { actionSeq: number; seatIndex: number; type: ReplayActionInput['type'] }): ReplayActionInput {
  return { street: 'PREFLOP', amount: null, ...over }
}

test('replay: heads-up preflop blinds + call builds the expected pot', () => {
  // SB=50 (seat0), BB=100 (seat1). seat0 calls to 100, seat1 checks.
  const res = reconstructReplay({
    seatIndexes: [0, 1],
    actions: [
      a({ actionSeq: 1, seatIndex: 0, type: 'post_sb', amount: 50 }),
      a({ actionSeq: 2, seatIndex: 1, type: 'post_bb', amount: 100 }),
      a({ actionSeq: 3, seatIndex: 0, type: 'call' }),
      a({ actionSeq: 4, seatIndex: 1, type: 'check' }),
    ],
    authoritativeTotalContributed: 200,
  })
  const last = res.steps[res.steps.length - 1]
  assert.equal(last.potTotal, 200)
  assert.equal(last.committedThisStreet[0], 100)
  assert.equal(last.committedThisStreet[1], 100)
  assert.equal(res.finalPot, 200)
  assert.equal(res.reconciledWithSettlement, true)
  assert.equal(res.discrepancy, 0)
})

test('replay: a raise then fold leaves the folded seat inactive and carries streets', () => {
  const res = reconstructReplay({
    seatIndexes: [0, 1, 2],
    actions: [
      a({ actionSeq: 1, seatIndex: 0, type: 'post_sb', amount: 50 }),
      a({ actionSeq: 2, seatIndex: 1, type: 'post_bb', amount: 100 }),
      a({ actionSeq: 3, seatIndex: 2, type: 'raise', amount: 300 }),
      a({ actionSeq: 4, seatIndex: 0, type: 'fold' }),
      a({ actionSeq: 5, seatIndex: 1, type: 'call' }),
      // FLOP: bb checks, raiser bets 200, bb calls.
      a({ actionSeq: 6, seatIndex: 1, type: 'check', street: 'FLOP' }),
      a({ actionSeq: 7, seatIndex: 2, type: 'bet', amount: 200, street: 'FLOP' }),
      a({ actionSeq: 8, seatIndex: 1, type: 'call', street: 'FLOP' }),
    ],
    authoritativeTotalContributed: 50 + 300 + 300 + 200 + 200, // sb fold(50) + two callers to 300 + 200 each on flop
  })
  const last = res.steps[res.steps.length - 1]
  assert.deepEqual(last.foldedSeats, [0])
  assert.deepEqual(last.activeSeats, [1, 2])
  // seat0 contributed 50 (folded), seats 1&2 each 300 preflop + 200 flop = 500.
  assert.equal(last.committedTotal[0] + last.committedThisStreet[0], 50)
  assert.equal(last.committedTotal[1] + last.committedThisStreet[1], 500)
  assert.equal(last.committedTotal[2] + last.committedThisStreet[2], 500)
  assert.equal(res.finalPot, 1050)
  assert.equal(res.reconciledWithSettlement, true)
})

test('replay: surfaces a discrepancy when reconstruction != authoritative pot', () => {
  const res = reconstructReplay({
    seatIndexes: [0, 1],
    actions: [
      a({ actionSeq: 1, seatIndex: 0, type: 'post_sb', amount: 50 }),
      a({ actionSeq: 2, seatIndex: 1, type: 'post_bb', amount: 100 }),
      a({ actionSeq: 3, seatIndex: 0, type: 'call' }),
    ],
    authoritativeTotalContributed: 999, // deliberately wrong
  })
  assert.equal(res.reconciledWithSettlement, false)
  assert.notEqual(res.discrepancy, 0)
})

test('replay: timeout_fold/timeout_check normalize to fold/check', () => {
  const res = reconstructReplay({
    seatIndexes: [0, 1],
    actions: [
      a({ actionSeq: 1, seatIndex: 0, type: 'post_sb', amount: 50 }),
      a({ actionSeq: 2, seatIndex: 1, type: 'post_bb', amount: 100 }),
      a({ actionSeq: 3, seatIndex: 0, type: 'timeout_fold' }),
    ],
  })
  const last = res.steps[res.steps.length - 1]
  assert.deepEqual(last.foldedSeats, [0])
})

test('replay: empty action log yields a single initial step', () => {
  const res = reconstructReplay({ seatIndexes: [0, 1], actions: [] })
  assert.equal(res.steps.length, 1)
  assert.equal(res.steps[0].potTotal, 0)
  assert.equal(res.reconciledWithSettlement, null)
})

// ── 4. Anti-abuse signals ────────────────────────────────────────────────────────────────
test('collusion: repeated one-way value flow scores high; isolated hands are filtered', () => {
  const hands = []
  // userL consistently dumps to userW over 10 hands at the same table.
  for (let i = 0; i < 10; i++) {
    hands.push({ handId: `h${i}`, tableId: 't1', netByUser: { L: -100, W: 100 } })
  }
  // A one-off unrelated hand (below minHandsTogether threshold for that pair).
  hands.push({ handId: 'x', tableId: 't2', netByUser: { P: -100, Q: 100 } })

  const signals = computeCollusionSignals(hands, { minHandsTogether: 3 })
  assert.equal(signals.length, 1) // P/Q filtered (only 1 hand together)
  const top = signals[0]
  assert.deepEqual([top.userA, top.userB].sort(), ['L', 'W'])
  assert.equal(top.handsTogether, 10)
  assert.equal(top.tablesTogether, 1)
  assert.equal(top.oneWayRatio, 1) // entirely one direction
  assert.ok(top.suspicion > 0)
  assert.equal(Math.abs(top.netFlowAToB), 1000)
})

test('collusion: balanced two-way play scores low directionality', () => {
  const hands = [
    { handId: 'h1', tableId: 't', netByUser: { A: -100, B: 100 } },
    { handId: 'h2', tableId: 't', netByUser: { A: 100, B: -100 } },
    { handId: 'h3', tableId: 't', netByUser: { A: -100, B: 100 } },
    { handId: 'h4', tableId: 't', netByUser: { A: 100, B: -100 } },
  ]
  const [s] = computeCollusionSignals(hands, { minHandsTogether: 3 })
  assert.ok(s.oneWayRatio < 0.2)
})

// ── 5. Ops taxonomy ──────────────────────────────────────────────────────────────────────
test('ops: integrity failures default to critical severity', () => {
  assert.equal(defaultOpsSeverity('coin_conservation_failure'), 'critical')
  assert.equal(defaultOpsSeverity('settlement_failure'), 'critical')
  assert.equal(defaultOpsSeverity('duplicate_action'), 'info')
  assert.equal(defaultOpsSeverity('frozen_hand'), 'error')
  assert.equal(OPS_EVENT_KINDS.length, 13)
})
