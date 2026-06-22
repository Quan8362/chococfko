// node --test lib/cronReminders.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { jstDate, planWindowKey, eventWindowKey, isAuthorizedCron } from './cronReminders.ts'

test('jstDate formats an instant as a Japan-local YYYY-MM-DD', () => {
  // 2026-06-22T16:00:00Z = 2026-06-23 01:00 JST → date rolls to the 23rd
  assert.equal(jstDate(new Date('2026-06-22T16:00:00Z')), '2026-06-23')
  // 2026-06-22T10:00:00Z = 2026-06-22 19:00 JST → still the 22nd
  assert.equal(jstDate(new Date('2026-06-22T10:00:00Z')), '2026-06-22')
})

test('plan/event window keys are the JST day → stable across same-day ticks', () => {
  const a = new Date('2026-06-22T00:30:00Z') // 09:30 JST
  const b = new Date('2026-06-22T08:30:00Z') // 17:30 JST (same JST day)
  assert.equal(planWindowKey(a), planWindowKey(b)) // dedup: same window
  assert.equal(eventWindowKey(a), eventWindowKey(b))
})

test('window key rolls over to a new JST day', () => {
  const today = new Date('2026-06-22T10:00:00Z') // 22nd JST
  const tomorrow = new Date('2026-06-22T16:00:00Z') // 23rd JST
  assert.notEqual(planWindowKey(today), planWindowKey(tomorrow))
})

test('isAuthorizedCron rejects when secret is unset', () => {
  assert.equal(isAuthorizedCron('Bearer abc', undefined), false)
  assert.equal(isAuthorizedCron('Bearer abc', ''), false)
})

test('isAuthorizedCron rejects missing / wrong header', () => {
  assert.equal(isAuthorizedCron(null, 'secret'), false)
  assert.equal(isAuthorizedCron('', 'secret'), false)
  assert.equal(isAuthorizedCron('Bearer wrong', 'secret'), false)
  assert.equal(isAuthorizedCron('secret', 'secret'), false) // missing "Bearer "
})

test('isAuthorizedCron accepts the correct bearer token', () => {
  assert.equal(isAuthorizedCron('Bearer s3cr3t-value', 's3cr3t-value'), true)
})

test('isAuthorizedCron is length-safe (no throw on mismatched lengths)', () => {
  assert.doesNotThrow(() => isAuthorizedCron('Bearer x', 'a-much-longer-secret'))
  assert.equal(isAuthorizedCron('Bearer x', 'a-much-longer-secret'), false)
})
