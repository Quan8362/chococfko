import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyStreak, nextMilestone, type StreakState } from './streak.ts'

const fresh: StreakState = { current: 0, longest: 0, lastActiveDate: null }

test('first ever completion starts a streak of 1', () => {
  const r = applyStreak(fresh, '2026-06-22')
  assert.equal(r.current, 1)
  assert.equal(r.longest, 1)
  assert.equal(r.incrementedToday, true)
})

test('second completion same day does not double-increment', () => {
  const day1 = applyStreak(fresh, '2026-06-22')
  const again = applyStreak(day1, '2026-06-22')
  assert.equal(again.current, 1)
  assert.equal(again.incrementedToday, false)
})

test('consecutive day advances; gap resets to 1', () => {
  let s: StreakState = applyStreak(fresh, '2026-06-22')
  s = applyStreak(s, '2026-06-23')
  assert.equal(s.current, 2)
  // skip 06-24, play 06-25 → reset
  const reset = applyStreak(s, '2026-06-25')
  assert.equal(reset.current, 1)
  assert.equal(reset.longest, 2) // longest preserved
})

test('out-of-order (past) date does not corrupt the streak', () => {
  const s = applyStreak(fresh, '2026-06-22')
  const past = applyStreak(s, '2026-06-20')
  assert.equal(past.current, 1)
  assert.equal(past.incrementedToday, false)
})

test('milestoneHit fires exactly on milestone days', () => {
  let s: StreakState = { current: 2, longest: 2, lastActiveDate: '2026-06-22' }
  s = applyStreak(s, '2026-06-23') // → 3
  assert.equal(s.current, 3)
  assert.equal(s.milestoneHit, 3)
  s = applyStreak(s, '2026-06-24') // → 4, no milestone
  assert.equal(s.milestoneHit, null)
})

test('nextMilestone returns the next target', () => {
  assert.equal(nextMilestone(0), 3)
  assert.equal(nextMilestone(3), 7)
  assert.equal(nextMilestone(7), 14)
  assert.equal(nextMilestone(1000), null)
})
