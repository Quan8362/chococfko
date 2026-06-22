// node --test lib/notifications/prefs.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultEnabled, effectiveEnabled, DEFAULT_OFF, CONFIGURABLE_TYPES, NOTIFICATION_TYPES } from './prefs.ts'

test('return-user broadcast types default OFF; direct types default ON', () => {
  assert.equal(defaultEnabled('weekend_collection'), false)
  assert.equal(defaultEnabled('event_soon'), false)
  assert.equal(defaultEnabled('place_answer'), true)
  assert.equal(defaultEnabled('place_closed'), true)
  assert.equal(defaultEnabled('plan_reminder'), true)
})

test('effectiveEnabled: explicit override wins over default', () => {
  assert.equal(effectiveEnabled('weekend_collection', true), true)   // opted in
  assert.equal(effectiveEnabled('place_answer', false), false)       // opted out
  assert.equal(effectiveEnabled('event_soon', undefined), false)     // default off
  assert.equal(effectiveEnabled('place_closed', undefined), true)    // default on
})

test('catalog integrity: DEFAULT_OFF and CONFIGURABLE_TYPES are known types', () => {
  for (const t of DEFAULT_OFF) assert.ok((NOTIFICATION_TYPES as readonly string[]).includes(t))
  for (const t of CONFIGURABLE_TYPES) assert.ok((NOTIFICATION_TYPES as readonly string[]).includes(t))
})
