// Framework-free tests for server-authoritative deadline math + timer display.
// Run with:  node --test lib/games/shared/deadline.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeDeadline,
  remainingMs,
  secondsRemaining,
  isExpired,
  elapsedFraction,
  formatTurnClock,
} from './deadline.ts'

const T0 = 1_000_000 // arbitrary epoch ms base

test('computeDeadline adds duration to start', () => {
  assert.equal(computeDeadline(T0, 20_000), T0 + 20_000)
  assert.throws(() => computeDeadline(T0, -1))
})

test('remainingMs floors at zero (never negative for display)', () => {
  const dl = computeDeadline(T0, 20_000)
  assert.equal(remainingMs(dl, T0), 20_000)
  assert.equal(remainingMs(dl, T0 + 5_000), 15_000)
  assert.equal(remainingMs(dl, T0 + 25_000), 0) // past deadline
})

test('secondsRemaining rounds up so the last second is shown', () => {
  const dl = computeDeadline(T0, 20_000)
  assert.equal(secondsRemaining(dl, T0), 20)
  assert.equal(secondsRemaining(dl, T0 + 19_001), 1) // 999ms left → still "1"
  assert.equal(secondsRemaining(dl, T0 + 20_000), 0)
})

test('isExpired respects grace and is absolute wall-clock', () => {
  const dl = computeDeadline(T0, 20_000)
  assert.ok(!isExpired(dl, T0 + 20_000)) // exactly at deadline, not yet past
  assert.ok(isExpired(dl, T0 + 20_001)) // 1ms past
  // grace window absorbs jitter
  assert.ok(!isExpired(dl, T0 + 20_500, 1_000))
  assert.ok(isExpired(dl, T0 + 21_500, 1_000))
  assert.throws(() => isExpired(dl, T0, -1))
})

test('elapsedFraction clamps to [0,1]', () => {
  const dl = computeDeadline(T0, 20_000)
  assert.equal(elapsedFraction(T0, dl, T0), 0)
  assert.equal(elapsedFraction(T0, dl, T0 + 10_000), 0.5)
  assert.equal(elapsedFraction(T0, dl, T0 + 30_000), 1)
  assert.equal(elapsedFraction(T0, T0, T0), 1) // zero-length window
})

test('formatTurnClock renders M:SS', () => {
  assert.equal(formatTurnClock(20_000), '0:20')
  assert.equal(formatTurnClock(5_000), '0:05')
  assert.equal(formatTurnClock(65_000), '1:05')
  assert.equal(formatTurnClock(-100), '0:00') // never negative
})
