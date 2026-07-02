import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  relationshipSignals,
  valueConcentrationSignals,
  chipDumpSignals,
  softPlaySignals,
  botTimingSignals,
  timingSyncSignals,
  multiSeatSignals,
  concurrentSessionSignals,
  sharedIdentifierSignals,
  impossibleFrequencySignals,
  handDerivedSignals,
  type HandFacts,
  type SeatFacts,
} from './signals.ts'

function seat(userId: string, over: Partial<SeatFacts> = {}): SeatFacts {
  return {
    userId, seatIndex: 0, contributed: 0, net: 0, wentAllIn: false, voluntaryPutIn: false,
    aggressiveActions: 0, passiveActions: 0, folded: false, reachedShowdown: false, actionTimingsMs: [],
    ...over,
  }
}
function hand(handNo: number, seats: SeatFacts[], over: Partial<HandFacts> = {}): HandFacts {
  return {
    handId: `h${handNo}`, tableId: 't1', handNo, isPrivateTable: false,
    completedAtMs: 1_000_000 + handNo * 60_000, seats, postflopContestants: [], ...over,
  }
}

// A directed chip dump: D loses all-in to C repeatedly; folders net 0.
function dumpHands(n: number, tableId = 't1', priv = false): HandFacts[] {
  return Array.from({ length: n }, (_, i) =>
    hand(i + 1, [
      seat('C', { seatIndex: 0, net: 100, contributed: 50 }),
      seat('D', { seatIndex: 1, net: -100, contributed: 100, wentAllIn: true, voluntaryPutIn: true }),
      seat('E', { seatIndex: 2, net: 0, folded: true }),
    ], { tableId, isPrivateTable: priv }),
  )
}

test('relationshipSignals surfaces one-way value flow for a dumping pair', () => {
  const sigs = relationshipSignals(dumpHands(8))
  const oneWay = sigs.find((s) => s.code === 'REL_ONE_WAY_VALUE_FLOW')
  assert.ok(oneWay, 'expected one-way flow signal')
  assert.deepEqual([...oneWay!.relatedUserIds].sort(), ['C', 'D'])
  assert.ok(oneWay!.evidence.oneWayRatioPct >= 85)
  assert.ok(oneWay!.confidence > 0 && oneWay!.confidence < 1)
})

test('relationshipSignals flags private-table concentration', () => {
  const sigs = relationshipSignals(dumpHands(8, 't1', true))
  assert.ok(sigs.some((s) => s.code === 'REL_PRIVATE_TABLE_PAIRING'))
})

test('relationshipSignals ignores a pair below the min-hands floor', () => {
  const sigs = relationshipSignals(dumpHands(3)) // < default 5
  assert.equal(sigs.length, 0)
})

test('chipDumpSignals detects repeated large commitments to one collector', () => {
  const sigs = chipDumpSignals(dumpHands(6))
  assert.equal(sigs.length, 1)
  assert.equal(sigs[0].code, 'GP_CHIP_DUMP')
  assert.deepEqual(sigs[0].relatedUserIds, ['D', 'C']) // dumper → collector
  assert.equal(sigs[0].evidence.dumpHands, 6)
  assert.ok(sigs[0].relatedHandIds.length === 6)
})

test('chipDumpSignals requires a single winner (skips split/multi-winner pots)', () => {
  const hands = Array.from({ length: 6 }, (_, i) =>
    hand(i + 1, [
      seat('C', { net: 50, contributed: 50 }),
      seat('F', { net: 50, contributed: 50 }), // two winners → not a clean transfer
      seat('D', { net: -100, contributed: 100, wentAllIn: true, voluntaryPutIn: true }),
    ]),
  )
  assert.equal(chipDumpSignals(hands).length, 0)
})

test('softPlaySignals: passive only versus one opponent', () => {
  const hands: HandFacts[] = []
  // A is aggressive vs the field (3-way contested pots)
  for (let i = 0; i < 5; i++) {
    hands.push(hand(i + 1, [
      seat('A', { aggressiveActions: 3, passiveActions: 0 }),
      seat('X', { passiveActions: 3 }),
      seat('Y', { passiveActions: 3 }),
    ], { postflopContestants: ['A', 'X', 'Y'] }))
  }
  // A is passive heads-up vs B
  for (let i = 0; i < 5; i++) {
    hands.push(hand(i + 100, [
      seat('A', { aggressiveActions: 0, passiveActions: 2 }),
      seat('B', { aggressiveActions: 2, passiveActions: 0 }),
    ], { postflopContestants: ['A', 'B'] }))
  }
  const sigs = softPlaySignals(hands)
  const soft = sigs.find((s) => s.relatedUserIds[0] === 'A' && s.relatedUserIds[1] === 'B')
  assert.ok(soft, 'expected A-soft-vs-B signal')
  assert.equal(soft!.code, 'GP_SOFT_PLAY')
  assert.ok(soft!.evidence.baselineAggressionPct > soft!.evidence.versusAggressionPct)
})

test('botTimingSignals flags fast + regular decisions', () => {
  const timings = Array.from({ length: 6 }, () => 500) // constant, fast
  const hands = Array.from({ length: 4 }, (_, i) =>
    hand(i + 1, [seat('BOT', { actionTimingsMs: timings })]),
  )
  const sigs = botTimingSignals(hands)
  assert.equal(sigs.length, 1)
  assert.equal(sigs[0].code, 'GP_BOT_TIMING')
  assert.ok(sigs[0].reasons.includes('fast_and_regular_timing'))
})

test('botTimingSignals does NOT flag a normal fast human (varied timings)', () => {
  // fast but human: high jitter (300..2500ms)
  const varied = [320, 1800, 640, 2400, 900, 1500]
  const hands = Array.from({ length: 4 }, (_, i) =>
    hand(i + 1, [seat('HUMAN', { actionTimingsMs: varied })]),
  )
  assert.equal(botTimingSignals(hands).length, 0)
})

test('timingSyncSignals flags matched cadence across shared hands', () => {
  const hands = Array.from({ length: 6 }, (_, i) =>
    hand(i + 1, [
      seat('P', { actionTimingsMs: [500, 520] }),
      seat('Q', { actionTimingsMs: [510, 505] }),
    ]),
  )
  const sigs = timingSyncSignals(hands)
  assert.ok(sigs.some((s) => s.code === 'GP_TIMING_SYNC'))
})

test('multiSeatSignals flags one account in two seats of a hand', () => {
  const h = hand(1, [
    seat('M', { seatIndex: 0 }),
    seat('M', { seatIndex: 1 }),
    seat('Z', { seatIndex: 2 }),
  ])
  const sigs = multiSeatSignals([h])
  assert.equal(sigs.length, 1)
  assert.equal(sigs[0].code, 'AS_MULTI_SEAT')
  assert.equal(sigs[0].severity, 1)
  assert.equal(sigs[0].evidence.maxSeatsInAHand, 2)
})

test('concurrentSessionSignals only flags same-table overlap', () => {
  // same user overlapping on the SAME table (contradictory)
  const same = concurrentSessionSignals([
    { userId: 'u', tableId: 't1', handId: 'a', startMs: 0, endMs: 100 },
    { userId: 'u', tableId: 't1', handId: 'b', startMs: 50, endMs: 150 },
    { userId: 'u', tableId: 't1', handId: 'c', startMs: 60, endMs: 160 },
  ])
  assert.ok(same.some((s) => s.code === 'AS_CONCURRENT_SESSIONS'))

  // same user overlapping on DIFFERENT tables (legit multi-tabling) → nothing
  const diff = concurrentSessionSignals([
    { userId: 'u', tableId: 't1', handId: 'a', startMs: 0, endMs: 100 },
    { userId: 'u', tableId: 't2', handId: 'b', startMs: 50, endMs: 150 },
    { userId: 'u', tableId: 't3', handId: 'c', startMs: 60, endMs: 160 },
  ])
  assert.equal(diff.length, 0)
})

test('sharedIdentifierSignals stay weak and uncertain', () => {
  const sigs = sharedIdentifierSignals([
    { userId: 'a', tokens: new Set(['ip:net1', 'device:d1']) },
    { userId: 'b', tokens: new Set(['ip:net1', 'device:d1']) },
  ])
  assert.equal(sigs.length, 1)
  assert.equal(sigs[0].code, 'AS_SHARED_IDENTIFIER')
  assert.ok(sigs[0].severity <= 0.35, 'identifier severity capped low')
  assert.ok(sigs[0].confidence <= 0.25, 'never confident on identifiers alone')
})

test('impossibleFrequencySignals catches beyond-human action rates', () => {
  const sigs = impossibleFrequencySignals([
    { userId: 'fast', actions: 400, windowMs: 60_000 }, // ~400/min
    { userId: 'ok', actions: 30, windowMs: 60_000 }, // 30/min → fine
  ])
  assert.equal(sigs.length, 1)
  assert.equal(sigs[0].relatedUserIds[0], 'fast')
  assert.ok(sigs[0].evidence.actionsPerMinute >= 120)
})

test('valueConcentrationSignals wraps the ranking heuristic', () => {
  const sigs = valueConcentrationSignals([
    {
      userId: 'winner', netProfitChips: 5000, handsPlayed: 300, distinctOpponents: 2,
      perOpponentProfitChips: [{ opponentId: 'feeder', chips: 5000 }, { opponentId: 'x', chips: 0 }],
    },
  ])
  assert.ok(sigs.some((s) => s.code === 'REL_VALUE_CONCENTRATION'))
})

test('handDerivedSignals composes hand-level signals', () => {
  const sigs = handDerivedSignals(dumpHands(8))
  const codes = new Set(sigs.map((s) => s.code))
  assert.ok(codes.has('REL_ONE_WAY_VALUE_FLOW'))
  assert.ok(codes.has('GP_CHIP_DUMP'))
})
