import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validatePracticeConfig,
  assertPracticeKind,
  assertBotSeatAllowed,
  assertClassificationImmutable,
  assertNoBotOnCashTable,
  PRACTICE_ALLOWED_DIFFICULTIES,
} from './classification.ts'
import { practiceConfig, botSeat, humanSeat } from './fixtures.ts'
import type { PracticeTableConfig } from './types.ts'

test('a valid practice table (1 human + bots) passes validation', () => {
  const cfg = practiceConfig({ seats: [humanSeat(0, 'u', 10000), botSeat(1, 'normal', 10000)] })
  assert.equal(validatePracticeConfig(cfg).ok, true)
})

test('the TEST-ONLY simulation difficulty is rejected for a user-facing practice table', () => {
  const cfg = practiceConfig({ seats: [humanSeat(0, 'u', 10000), botSeat(1, 'simulation', 10000)] })
  const v = validatePracticeConfig(cfg)
  assert.equal(v.ok, false)
  assert.ok(!PRACTICE_ALLOWED_DIFFICULTIES.includes('simulation' as never))
})

test('a practice table must have at least one human AND one bot', () => {
  const allBots = practiceConfig({ seats: [botSeat(0, 'easy', 10000), botSeat(1, 'easy', 10000)] })
  assert.ok(validatePracticeConfig(allBots).errors.some((e) => e.includes('at least one human')))
  const allHumans = practiceConfig({ seats: [humanSeat(0, 'a', 10000), humanSeat(1, 'b', 10000)] })
  assert.ok(validatePracticeConfig(allHumans).errors.some((e) => e.includes('at least one bot')))
})

test('assertPracticeKind rejects any non-practice (cash) kind — bots can never sit at cash', () => {
  assert.throws(() => assertPracticeKind('cash'), /only permitted on a practice table/)
  assert.throws(() => assertPracticeKind('ranked'), /only permitted on a practice table/)
  assert.doesNotThrow(() => assertPracticeKind('practice'))
})

test('assertBotSeatAllowed refuses a human seat and any non-practice table', () => {
  const cfg = practiceConfig({ seats: [humanSeat(0, 'u', 10000), botSeat(1, 'normal', 10000)] })
  assert.throws(() => assertBotSeatAllowed(cfg, cfg.seats[0]), /not a bot seat/)
  assert.doesNotThrow(() => assertBotSeatAllowed(cfg, cfg.seats[1]))
  const cashish = { ...cfg, kind: 'cash' } as unknown as PracticeTableConfig
  assert.throws(() => assertBotSeatAllowed(cashish, cfg.seats[1]), /only permitted on a practice table/)
})

test('classification is immutable after the first hand starts', () => {
  const before = practiceConfig({ seats: [humanSeat(0, 'u', 10000), botSeat(1, 'normal', 10000)] })
  // Before any hand (startedHandNo=0), edits are allowed.
  const relabeled = { ...before, kind: 'cash' } as unknown as PracticeTableConfig
  assert.doesNotThrow(() => assertClassificationImmutable(before, relabeled, 0))
  // After a hand started, kind / seat-kind / difficulty changes are refused.
  assert.throws(() => assertClassificationImmutable(before, relabeled, 1), /kind is immutable/)
  const flipSeat = { ...before, seats: [humanSeat(0, 'u', 10000), humanSeat(1, 'x', 10000)] }
  assert.throws(() => assertClassificationImmutable(before, flipSeat, 1), /kind changed/)
  const flipDiff = { ...before, seats: [humanSeat(0, 'u', 10000), botSeat(1, 'hard', 10000)] }
  assert.throws(() => assertClassificationImmutable(before, flipDiff, 1), /difficulty changed/)
})

test('assertNoBotOnCashTable forbids a bot occupant on a cash seat', () => {
  assert.throws(() => assertNoBotOnCashTable('cash', 'bot'), /never occupy a non-practice/)
  assert.doesNotThrow(() => assertNoBotOnCashTable('practice', 'bot'))
  assert.doesNotThrow(() => assertNoBotOnCashTable('cash', 'human'))
})
