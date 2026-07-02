// Framework-free tests for private-table password + access rules.
// Run with:  node --test lib/games/poker/tableAccess.test.ts
//
// 🔴 Covers the Prompt 24E Issue 1 requirements: a private table's password is enforced on
// EVERY seat path, a direct URL cannot bypass it, a denied caller is never authorized (so no seat
// or coins move), and an already-seated player reconnecting is never locked out.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  hashTablePassword,
  verifyTablePassword,
  privateTableAccessAllowed,
} from './tableAccess.ts'

test('stored password record is a salted scrypt hash, never the plaintext', () => {
  const stored = hashTablePassword('hunter2')
  assert.match(stored, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/)
  assert.equal(stored.includes('hunter2'), false)
  // Two hashes of the same password differ (unique salt) — no rainbow-table shortcut.
  assert.notEqual(hashTablePassword('hunter2'), hashTablePassword('hunter2'))
})

test('correct password verifies; wrong / empty / null do not', () => {
  const stored = hashTablePassword('let-me-in')
  assert.equal(verifyTablePassword('let-me-in', stored), true)
  assert.equal(verifyTablePassword('wrong', stored), false)
  assert.equal(verifyTablePassword('', stored), false)
  assert.equal(verifyTablePassword('let-me-in', null), false)
  assert.equal(verifyTablePassword('let-me-in', undefined), false)
  assert.equal(verifyTablePassword('let-me-in', 'garbage'), false)
})

test('public table requires no password (always accessible)', () => {
  assert.equal(privateTableAccessAllowed({ isPrivate: false, isCreator: false, isSeated: false, isMember: false }), true)
})

test('direct URL to a private table cannot bypass validation', () => {
  // A visitor who never passed the password (no membership), is not the host, and holds no seat.
  assert.equal(privateTableAccessAllowed({ isPrivate: true, isCreator: false, isSeated: false, isMember: false }), false)
})

test('membership (earned by passing the password) grants access; repeatable', () => {
  const input = { isPrivate: true, isCreator: false, isSeated: false, isMember: true } as const
  assert.equal(privateTableAccessAllowed(input), true)
  // Idempotent: a duplicate join keeps membership → still allowed, no state change implied.
  assert.equal(privateTableAccessAllowed(input), true)
})

test('the host of a private table is always authorized', () => {
  assert.equal(privateTableAccessAllowed({ isPrivate: true, isCreator: true, isSeated: false, isMember: false }), true)
})

test('an already-seated player reconnecting is never locked out', () => {
  assert.equal(privateTableAccessAllowed({ isPrivate: true, isCreator: false, isSeated: true, isMember: false }), true)
})
