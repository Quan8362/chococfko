import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  shouldHoldWakeLock,
  HAPTIC_PATTERN,
  hapticDurationMs,
  type WakeLockConditions,
  type PokerHapticEvent,
} from './mobileSession.ts'

const ALL_TRUE: WakeLockConditions = { enabled: true, supported: true, seated: true, visible: true }

test('shouldHoldWakeLock: holds only when every condition is true', () => {
  assert.equal(shouldHoldWakeLock(ALL_TRUE), true)
})

test('shouldHoldWakeLock: any single false condition releases the lock', () => {
  for (const key of ['enabled', 'supported', 'seated', 'visible'] as (keyof WakeLockConditions)[]) {
    const c = { ...ALL_TRUE, [key]: false }
    assert.equal(shouldHoldWakeLock(c), false, `expected release when ${key}=false`)
  }
})

test('shouldHoldWakeLock: never holds while spectating (not seated) even if opted in', () => {
  assert.equal(shouldHoldWakeLock({ enabled: true, supported: true, seated: false, visible: true }), false)
})

test('shouldHoldWakeLock: never holds on an unsupported browser', () => {
  assert.equal(shouldHoldWakeLock({ enabled: true, supported: false, seated: true, visible: true }), false)
})

test('haptic patterns are all short and bounded (never continuous)', () => {
  const events: PokerHapticEvent[] = ['yourTurn', 'timerWarning', 'actionAccepted', 'allIn', 'potWon']
  for (const e of events) {
    const total = hapticDurationMs(HAPTIC_PATTERN[e])
    assert.ok(total > 0, `${e} pattern has a positive duration`)
    assert.ok(total <= 300, `${e} pattern total ${total}ms is bounded (≤300ms, never continuous)`)
  }
})

test('actionAccepted is a single fixed buzz — cannot encode hand strength', () => {
  // A private-info leak would require the pattern to vary with the action/cards. It is a constant.
  assert.equal(typeof HAPTIC_PATTERN.actionAccepted, 'number')
})
