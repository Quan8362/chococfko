// Framework-free tests for monotonic state-version reasoning.
// Run with:  node --test lib/games/shared/sequence.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  compareVersion,
  isStaleVersion,
  isDuplicateVersion,
  isVersionGap,
  isNextVersion,
  nextVersion,
  reconcileDecision,
  shouldApplySnapshot,
} from './sequence.ts'

test('compareVersion orders versions', () => {
  assert.equal(compareVersion(1, 2), -1)
  assert.equal(compareVersion(2, 2), 0)
  assert.equal(compareVersion(3, 2), 1)
})

test('compareVersion rejects non-integer / negative versions', () => {
  assert.throws(() => compareVersion(1.5, 2))
  assert.throws(() => compareVersion(-1, 0))
})

test('stale detection: at-or-behind last applied is stale', () => {
  assert.ok(isStaleVersion(5, 5)) // duplicate is stale
  assert.ok(isStaleVersion(4, 5)) // older is stale
  assert.ok(!isStaleVersion(6, 5)) // newer is not stale
})

test('duplicate detection is exact-equality only', () => {
  assert.ok(isDuplicateVersion(7, 7))
  assert.ok(!isDuplicateVersion(6, 7))
  assert.ok(!isDuplicateVersion(8, 7))
})

test('gap detection fires only when more than one ahead', () => {
  assert.ok(!isVersionGap(6, 5)) // contiguous
  assert.ok(isVersionGap(7, 5)) // missed one
  assert.ok(!isVersionGap(5, 5)) // duplicate, not a gap
})

test('isNextVersion / nextVersion', () => {
  assert.ok(isNextVersion(6, 5))
  assert.ok(!isNextVersion(7, 5))
  assert.equal(nextVersion(5), 6)
})

test('reconcileDecision encodes the realtime reducer rule', () => {
  // stale / duplicate → drop
  assert.equal(reconcileDecision(5, 5), 'drop')
  assert.equal(reconcileDecision(4, 5), 'drop')
  // contiguous next → apply
  assert.equal(reconcileDecision(6, 5), 'apply')
  // gap → reconcile (fetch authoritative snapshot)
  assert.equal(reconcileDecision(8, 5), 'reconcile')
})

test('shouldApplySnapshot accepts newer-or-equal (trusted refetch)', () => {
  assert.ok(shouldApplySnapshot(10, 9)) // newer
  assert.ok(shouldApplySnapshot(9, 9)) // equal — trusted reconcile replaces local
  assert.ok(!shouldApplySnapshot(8, 9)) // stale snapshot ignored
})
