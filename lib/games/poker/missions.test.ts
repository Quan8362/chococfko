import test from 'node:test'
import assert from 'node:assert/strict'
import {
  POKER_MISSIONS,
  MISSION_KEYS,
  isMissionKey,
  missionDef,
  emptyProgress,
  applyMissionProgress,
  handMissionIncrements,
  beginnerBigBlindCeiling,
  isBeginnerBigBlind,
  MISSION_PERIOD_ONCE,
  type HandMissionFact,
} from './missions.ts'

test('MIS-CAT-001 keys unique, all period-once shaped, targets >= 1', () => {
  assert.equal(new Set(MISSION_KEYS).size, MISSION_KEYS.length)
  for (const m of POKER_MISSIONS) {
    assert.equal(isMissionKey(m.key), true)
    assert.equal(m.target >= 1, true)
    assert.equal(['hand', 'action'].includes(m.source), true)
  }
  assert.equal(isMissionKey('nope'), false)
  assert.equal(MISSION_PERIOD_ONCE, 'once')
})

test('MIS-CAT-002 responsible-engagement guardrail — no prohibited mission pattern', () => {
  // FAILS if anyone introduces a mission that rewards a behaviour the brief forbids:
  // daily-streak pressure, time-played, repeated all-ins, losing/winning a large amount,
  // coordinated play / collusion, chip dumping, or spending/acquiring coins.
  const banned = /daily|streak|login|time|hour|minute|session|marathon|allin|all_in|shove|jam|bluff_all|lose|loss|dump|win_\d|bigwin|jackpot|coin|xu|reward|bet_\d|deposit|spend|gift|transfer|collu|coordinat|team|friend_fold/i
  for (const m of POKER_MISSIONS) {
    assert.equal(banned.test(m.key), false, `mission key "${m.key}" matches a prohibited pattern`)
    // The 6 shipped missions are onboarding-only; source must be a hand or an explicit action.
    assert.equal(['hand', 'action'].includes(m.source), true, m.key)
  }
  // Sanity: the shipped set is exactly the safe onboarding checklist (guards against silent growth).
  assert.deepEqual(
    MISSION_KEYS.slice().sort(),
    ['complete_3_hands', 'complete_training', 'play_beginner_blind', 'reach_showdown', 'review_rules', 'use_check'].sort(),
  )
})

test('MIS-PROG-001 empty progress is zero and incomplete', () => {
  const p = emptyProgress('complete_3_hands')
  assert.deepEqual(p, { key: 'complete_3_hands', progress: 0, target: 3, completed: false })
})

test('MIS-PROG-002 increment advances and clamps at target', () => {
  let p = emptyProgress('complete_3_hands')
  p = applyMissionProgress(p, 1)
  assert.equal(p.progress, 1)
  assert.equal(p.completed, false)
  p = applyMissionProgress(p, 5) // overshoot
  assert.equal(p.progress, 3, 'clamped to target')
  assert.equal(p.completed, true)
})

test('MIS-PROG-003 further increments after completion are a no-op (idempotent latch)', () => {
  let p = emptyProgress('use_check')
  p = applyMissionProgress(p, 1)
  assert.equal(p.completed, true)
  const again = applyMissionProgress(p, 1)
  assert.deepEqual(again, p)
})

test('MIS-PROG-004 non-positive increment is ignored', () => {
  const p = emptyProgress('reach_showdown')
  assert.deepEqual(applyMissionProgress(p, 0), p)
  assert.deepEqual(applyMissionProgress(p, -3), p)
})

test('MIS-HAND-001 hand facts map to exactly the advanced missions', () => {
  const all: HandMissionFact = { playedHand: true, usedCheckLegally: true, reachedShowdown: true, atBeginnerBlind: true }
  const keys = handMissionIncrements(all).map((i) => i.key).sort()
  assert.deepEqual(keys, ['complete_3_hands', 'play_beginner_blind', 'reach_showdown', 'use_check'])
})

test('MIS-HAND-002 a fold-early hand at high stakes only advances complete_3_hands', () => {
  const fact: HandMissionFact = { playedHand: true, usedCheckLegally: false, reachedShowdown: false, atBeginnerBlind: false }
  assert.deepEqual(handMissionIncrements(fact), [{ key: 'complete_3_hands', inc: 1 }])
})

test('MIS-HAND-003 not dealt in → nothing', () => {
  const fact: HandMissionFact = { playedHand: false, usedCheckLegally: false, reachedShowdown: false, atBeginnerBlind: false }
  assert.deepEqual(handMissionIncrements(fact), [])
})

// ── beginner blind ceiling (config-driven, pure) ───────────────────────────────────────────
const V1_TIER_BB = [100, 500, 2000, 10000, 50000, 200000] // POKER_ECONOMY_V1 big blinds

test('MIS-BLIND-001 ceiling is the second-lowest tier big blind', () => {
  assert.equal(beginnerBigBlindCeiling(V1_TIER_BB), 500)
})

test('MIS-BLIND-002 micro and low qualify; medium and up do not', () => {
  assert.equal(isBeginnerBigBlind(100, V1_TIER_BB), true)
  assert.equal(isBeginnerBigBlind(500, V1_TIER_BB), true)
  assert.equal(isBeginnerBigBlind(2000, V1_TIER_BB), false)
  assert.equal(isBeginnerBigBlind(0, V1_TIER_BB), false)
})

test('MIS-BLIND-003 degenerate configs are safe', () => {
  assert.equal(beginnerBigBlindCeiling([]), 0)
  assert.equal(isBeginnerBigBlind(100, []), false)
  assert.equal(beginnerBigBlindCeiling([300]), 300) // single tier → itself is the ceiling
})

test('MIS-DEF-001 unknown key throws', () => {
  // @ts-expect-error intentional bad key
  assert.throws(() => missionDef('nope'))
})
