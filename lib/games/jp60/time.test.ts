import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tokyoDateString, dayDiff, tokyoWeeklyPeriod, weekdayOf } from './time.ts'

test('tokyoDateString rolls over at Japan midnight, not UTC', () => {
  // 2026-06-21T15:30:00Z = 2026-06-22 00:30 JST → next day in Tokyo
  assert.equal(tokyoDateString(new Date('2026-06-21T15:30:00Z')), '2026-06-22')
  // 2026-06-21T14:30:00Z = 2026-06-21 23:30 JST → still same day
  assert.equal(tokyoDateString(new Date('2026-06-21T14:30:00Z')), '2026-06-21')
})

test('dayDiff counts whole calendar days', () => {
  assert.equal(dayDiff('2026-06-22', '2026-06-21'), 1)
  assert.equal(dayDiff('2026-06-21', '2026-06-22'), -1)
  assert.equal(dayDiff('2026-07-01', '2026-06-29'), 2)
  assert.equal(dayDiff('2026-06-22', '2026-06-22'), 0)
})

test('weekdayOf is correct (2026-06-22 is a Monday)', () => {
  assert.equal(weekdayOf('2026-06-22'), 1)
  assert.equal(weekdayOf('2026-06-21'), 0) // Sunday
})

test('tokyoWeeklyPeriod returns Monday..Sunday in Tokyo', () => {
  const p = tokyoWeeklyPeriod(new Date('2026-06-24T03:00:00Z')) // Wed 12:00 JST
  assert.equal(p.start, '2026-06-22') // Monday
  assert.equal(p.end, '2026-06-28') // Sunday
  assert.equal(p.key, '2026-06-22')
})

test('weekly period is stable across the same week', () => {
  const a = tokyoWeeklyPeriod(new Date('2026-06-22T00:00:00+09:00'))
  const b = tokyoWeeklyPeriod(new Date('2026-06-28T23:00:00+09:00'))
  assert.equal(a.key, b.key)
})
