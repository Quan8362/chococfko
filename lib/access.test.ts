// Framework-free tests for the pure access helpers.
// Run with:  node --test lib/access.test.ts   (Node 22.18+/23.6+/24, type-stripping)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canAccessScope,
  parseScopeParam,
  validateRequestedScope,
  resolvePostScope,
  isScope,
  type UserAccess,
} from './access.ts'

const anon: UserAccess = { userId: null, isInternal: false, isAdmin: false }
const community: UserAccess = { userId: 'u1', isInternal: false, isAdmin: false }
const internal: UserAccess = { userId: 'u2', isInternal: true, isAdmin: false }
const admin: UserAccess = { userId: 'u3', isInternal: false, isAdmin: true }

test('isScope validates only the two known tokens', () => {
  assert.equal(isScope('community'), true)
  assert.equal(isScope('fko_internal'), true)
  assert.equal(isScope('public'), false)
  assert.equal(isScope(undefined), false)
})

test('parseScopeParam never trusts arbitrary input', () => {
  assert.equal(parseScopeParam('fko_internal'), 'fko_internal')
  assert.equal(parseScopeParam('community'), 'community')
  assert.equal(parseScopeParam('FKO_INTERNAL'), 'community') // case-sensitive, defaults safe
  assert.equal(parseScopeParam('anything'), 'community')
  assert.equal(parseScopeParam(undefined), 'community')
  assert.equal(parseScopeParam(null), 'community')
})

test('canAccessScope: community is open to everyone', () => {
  for (const a of [anon, community, internal, admin]) {
    assert.equal(canAccessScope(a, 'community'), true)
  }
})

test('canAccessScope: internal only for internal members + admins', () => {
  assert.equal(canAccessScope(anon, 'fko_internal'), false)
  assert.equal(canAccessScope(community, 'fko_internal'), false)
  assert.equal(canAccessScope(internal, 'fko_internal'), true)
  assert.equal(canAccessScope(admin, 'fko_internal'), true)
})

test('validateRequestedScope downgrades forged internal requests to community', () => {
  // Community user manually sets ?scope=fko_internal -> denied via downgrade.
  assert.equal(validateRequestedScope('fko_internal', community), 'community')
  assert.equal(validateRequestedScope('fko_internal', anon), 'community')
  // Internal member / admin keep the requested internal scope.
  assert.equal(validateRequestedScope('fko_internal', internal), 'fko_internal')
  assert.equal(validateRequestedScope('fko_internal', admin), 'fko_internal')
  // Default is always community.
  assert.equal(validateRequestedScope(undefined, internal), 'community')
})

test('active internal member access is ADDITIVE (community AND internal)', () => {
  // Acceptance criterion: an internal member is NOT an "internal-only" user.
  assert.equal(canAccessScope(internal, 'community'), true)
  assert.equal(canAccessScope(internal, 'fko_internal'), true)
  // Reading either tab keeps the requested scope for an internal member.
  assert.equal(validateRequestedScope('community', internal), 'community')
  assert.equal(validateRequestedScope('fko_internal', internal), 'fko_internal')
  // Posting to either scope is allowed for an internal member.
  assert.equal(resolvePostScope('community', internal), 'community')
  assert.equal(resolvePostScope('fko_internal', internal), 'fko_internal')
})

test('community user is community-only across read + write', () => {
  assert.equal(canAccessScope(community, 'community'), true)
  assert.equal(canAccessScope(community, 'fko_internal'), false)
  assert.equal(validateRequestedScope('fko_internal', community), 'community')
  assert.equal(resolvePostScope('fko_internal', community), 'community')
})

test('resolvePostScope never lets a non-member post internal content', () => {
  assert.equal(resolvePostScope('fko_internal', community), 'community')
  assert.equal(resolvePostScope('fko_internal', anon), 'community')
  assert.equal(resolvePostScope('fko_internal', internal), 'fko_internal')
  assert.equal(resolvePostScope('fko_internal', admin), 'fko_internal')
  assert.equal(resolvePostScope('community', internal), 'community')
})
