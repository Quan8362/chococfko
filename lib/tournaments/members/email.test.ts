// Run with: node --test lib/tournaments/members/email.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeEmail, isValidNormalizedEmail, normalizeAndValidateEmail } from './email.ts'

test('normalizeEmail lowercases and trims', () => {
  assert.equal(normalizeEmail('  Foo.Bar@Example.COM  '), 'foo.bar@example.com')
  assert.equal(normalizeEmail('a@b.co'), 'a@b.co')
})

test('isValidNormalizedEmail accepts plausible addresses', () => {
  assert.equal(isValidNormalizedEmail('inv@test.local'), true)
  assert.equal(isValidNormalizedEmail('chococfko@gmail.com'), true)
  assert.equal(isValidNormalizedEmail('a.b+tag@sub.domain.io'), true)
})

test('isValidNormalizedEmail rejects malformed / empty', () => {
  assert.equal(isValidNormalizedEmail(''), false)
  assert.equal(isValidNormalizedEmail('not-an-email'), false)
  assert.equal(isValidNormalizedEmail('missing@tld'), false)
  assert.equal(isValidNormalizedEmail('two@@at.com'), false)
  assert.equal(isValidNormalizedEmail('space in@mail.com'), false)
  assert.equal(isValidNormalizedEmail(`${'x'.repeat(255)}@a.com`), false)
})

test('normalizeAndValidateEmail returns normalized value or null', () => {
  assert.equal(normalizeAndValidateEmail('  INV@Test.Local '), 'inv@test.local')
  assert.equal(normalizeAndValidateEmail('nope'), null)
})
