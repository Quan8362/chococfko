// ── Synthetic integrity scenarios ───────────────────────────────────────────────────────
// End-to-end: reduced HandFacts (+ hashed identity tokens) → signals → per-subject risk scores.
// The guiding assertion is asymmetric: LEGITIMATE behaviour must never reach an actionable band,
// while genuine abuse must surface with high confidence. Nothing here ever acts — scores only route
// a case to a human (see review.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  handDerivedSignals,
  sharedIdentifierSignals,
  impossibleFrequencySignals,
  type HandFacts,
  type SeatFacts,
  type RiskSignal,
} from './signals.ts'
import { scoreSubjects, isActionableAdvisory, type RiskScore } from './scoring.ts'

function seat(userId: string, over: Partial<SeatFacts> = {}): SeatFacts {
  return {
    userId, seatIndex: 0, contributed: 0, net: 0, wentAllIn: false, voluntaryPutIn: false,
    aggressiveActions: 0, passiveActions: 0, folded: false, reachedShowdown: false, actionTimingsMs: [],
    ...over,
  }
}
function hand(no: number, seats: SeatFacts[], over: Partial<HandFacts> = {}): HandFacts {
  return {
    handId: `h${no}`, tableId: 't1', handNo: no, isPrivateTable: false,
    completedAtMs: 1_000_000 + no * 60_000, seats, postflopContestants: [], ...over,
  }
}
// Deterministic pseudo-random human-ish timings (fast but jittery).
function humanTimings(seed: number, n = 4): number[] {
  const out: number[] = []
  let x = seed
  for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; out.push(400 + (x % 3200)) }
  return out
}

function pipeline(hands: HandFacts[], extra: RiskSignal[] = []): readonly RiskScore[] {
  return scoreSubjects([...handDerivedSignals(hands), ...extra])
}

// ── 1. Legitimate friends who play together a lot (balanced results, human timing) ───────
test('legitimate friends are NOT auto-punished', () => {
  const hands: HandFacts[] = []
  for (let i = 0; i < 30; i++) {
    // Alternate who wins so value flows both ways; both aggressive vs each other and the field.
    const aWins = i % 2 === 0
    hands.push(hand(i + 1, [
      seat('friendA', { net: aWins ? 90 : -60, contributed: 60, aggressiveActions: 2, passiveActions: 1, actionTimingsMs: humanTimings(i + 1) }),
      seat('friendB', { net: aWins ? -60 : 90, contributed: 60, aggressiveActions: 2, passiveActions: 1, actionTimingsMs: humanTimings(i + 7) }),
      seat('friendC', { net: -30, contributed: 30, folded: true, actionTimingsMs: humanTimings(i + 13) }),
    ], { postflopContestants: aWins ? ['friendA', 'friendB'] : ['friendB', 'friendA'] }))
  }
  const scores = pipeline(hands)
  for (const s of scores) {
    assert.notEqual(s.band, 'high', `unexpected high band for ${s.subjectUserIds}`)
    assert.equal(isActionableAdvisory(s), false)
  }
})

// ── 2. Shared household network + otherwise normal play ──────────────────────────────────
test('shared household network alone is not actionable', () => {
  const idSignals = sharedIdentifierSignals([
    { userId: 'roommate1', tokens: new Set(['ip:household', 'device:tv-box']) },
    { userId: 'roommate2', tokens: new Set(['ip:household']) },
  ])
  const scores = scoreSubjects(idSignals)
  for (const s of scores) {
    assert.ok(s.band === 'none' || s.band === 'low', `identifier-only should stay low, got ${s.band}`)
    assert.equal(isActionableAdvisory(s), false)
  }
})

// ── 3. Actual chip-dumping ring (D funnels to C, on a private table, sharing a device) ───
test('a real chip-dumping pattern surfaces as high + actionable', () => {
  const hands: HandFacts[] = Array.from({ length: 24 }, (_, i) =>
    hand(i + 1, [
      seat('collector', { net: 120, contributed: 40 }),
      seat('dumper', { net: -120, contributed: 120, wentAllIn: true, voluntaryPutIn: true }),
      seat('bystander', { net: 0, folded: true }),
    ], { isPrivateTable: true }),
  )
  const idSignals = sharedIdentifierSignals([
    { userId: 'collector', tokens: new Set(['device:shared-pc']) },
    { userId: 'dumper', tokens: new Set(['device:shared-pc']) },
  ])
  const scores = pipeline(hands, idSignals)
  const pair = scores.find((s) => s.subjectUserIds.includes('collector') && s.subjectUserIds.includes('dumper'))
  assert.ok(pair, 'expected a collector+dumper subject')
  assert.equal(pair!.band, 'high')
  assert.ok(isActionableAdvisory(pair!), 'clear chip dumping should be an actionable advisory')
  assert.ok(pair!.categories.length >= 2, 'corroborated across categories')
})

// ── 4. Repeated soft-play ────────────────────────────────────────────────────────────────
test('repeated soft play is flagged (but discovered, not auto-acted)', () => {
  const hands: HandFacts[] = []
  for (let i = 0; i < 8; i++) {
    hands.push(hand(i + 1, [
      seat('aggro', { aggressiveActions: 3, actionTimingsMs: humanTimings(i + 2) }),
      seat('field1', { passiveActions: 3 }),
      seat('field2', { passiveActions: 3 }),
    ], { postflopContestants: ['aggro', 'field1', 'field2'] }))
  }
  for (let i = 0; i < 8; i++) {
    hands.push(hand(i + 100, [
      seat('aggro', { aggressiveActions: 0, passiveActions: 2, actionTimingsMs: humanTimings(i + 5) }),
      seat('buddy', { aggressiveActions: 2, actionTimingsMs: humanTimings(i + 9) }),
    ], { postflopContestants: ['aggro', 'buddy'] }))
  }
  const scores = pipeline(hands)
  assert.ok(scores.some((s) => s.contributingSignals.some((c) => c.code === 'GP_SOFT_PLAY')))
})

// ── 5. Random players who repeatedly happen to match (few hands, balanced) ──────────────
test('random repeated matches below thresholds produce nothing', () => {
  const hands: HandFacts[] = Array.from({ length: 3 }, (_, i) =>
    hand(i + 1, [
      seat('rand1', { net: i % 2 ? 40 : -40, contributed: 40, aggressiveActions: 1, actionTimingsMs: humanTimings(i + 3) }),
      seat('rand2', { net: i % 2 ? -40 : 40, contributed: 40, aggressiveActions: 1, actionTimingsMs: humanTimings(i + 4) }),
    ]),
  )
  assert.equal(pipeline(hands).length, 0)
})

// ── 6. Bot-like timing ───────────────────────────────────────────────────────────────────
test('bot-like timing is flagged', () => {
  const constant = [480, 480, 480, 480, 480]
  const hands = Array.from({ length: 6 }, (_, i) => hand(i + 1, [seat('scriptbot', { actionTimingsMs: constant })]))
  const scores = pipeline(hands)
  assert.ok(scores.some((s) => s.contributingSignals.some((c) => c.code === 'GP_BOT_TIMING')))
})

// ── 7. Normal fast (but human) player is NOT bot-flagged ────────────────────────────────
test('a normal fast human is not bot-flagged', () => {
  const hands = Array.from({ length: 6 }, (_, i) => hand(i + 1, [seat('speedy', { actionTimingsMs: humanTimings(i + 11, 5) })]))
  const scores = pipeline(hands)
  assert.equal(scores.some((s) => s.contributingSignals.some((c) => c.code === 'GP_BOT_TIMING')), false)
})

// ── 8. Unstable-network player (folds/timeouts to many, balanced) is not punished ───────
test('an unstable-network player is not punished', () => {
  const hands: HandFacts[] = []
  for (let i = 0; i < 20; i++) {
    // Loses small blinds to a DIFFERENT opponent each hand (no concentration), varied timing.
    hands.push(hand(i + 1, [
      seat('flaky', { net: -20, contributed: 20, folded: true, actionTimingsMs: humanTimings(i + 21, 1) }),
      seat(`opp${i % 9}`, { net: 20, contributed: 20, aggressiveActions: 1, actionTimingsMs: humanTimings(i + 30) }),
    ]))
  }
  const scores = pipeline(hands)
  for (const s of scores) {
    assert.notEqual(s.band, 'high')
    assert.equal(isActionableAdvisory(s), false)
  }
})

// ── 9. Impossible action frequency (auto-play across many tables) ───────────────────────
test('impossible action frequency surfaces', () => {
  const scores = scoreSubjects(impossibleFrequencySignals([{ userId: 'macro', actions: 500, windowMs: 60_000 }]))
  assert.ok(scores.some((s) => s.contributingSignals.some((c) => c.code === 'AS_IMPOSSIBLE_FREQUENCY')))
})
