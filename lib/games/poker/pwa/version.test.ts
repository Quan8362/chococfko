import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  compareBuild,
  isProtocolCompatible,
  shouldPromptUpdate,
  mustBlockActions,
  POKER_PROTOCOL_VERSION,
  type UpdateState,
} from './version.ts'

// ── compareBuild ─────────────────────────────────────────────────────────────────────────────
test('compareBuild: equal ids ⇒ same', () => {
  assert.equal(compareBuild('abc123', 'abc123'), 'same')
})
test('compareBuild: differing ids ⇒ update-available', () => {
  assert.equal(compareBuild('abc123', 'def456'), 'update-available')
})
test('compareBuild: a missing side ⇒ unknown (never a false prompt)', () => {
  assert.equal(compareBuild(null, 'def456'), 'unknown')
  assert.equal(compareBuild('abc123', undefined), 'unknown')
  assert.equal(compareBuild('', ''), 'unknown')
})

// ── protocol compatibility ──────────────────────────────────────────────────────────────────
test('isProtocolCompatible: exact-match only', () => {
  assert.equal(isProtocolCompatible(POKER_PROTOCOL_VERSION, POKER_PROTOCOL_VERSION), true)
  assert.equal(isProtocolCompatible(1, 2), false)
})

// ── shouldPromptUpdate — never interrupt a live hand ────────────────────────────────────────
const st = (o: Partial<UpdateState>): UpdateState => ({
  updateAvailable: false,
  protocolMismatch: false,
  inHand: false,
  ...o,
})

test('shouldPromptUpdate: no update ⇒ never prompt', () => {
  assert.equal(shouldPromptUpdate(st({ updateAvailable: false, inHand: false })), false)
})
test('shouldPromptUpdate: update available between hands ⇒ prompt', () => {
  assert.equal(shouldPromptUpdate(st({ updateAvailable: true, inHand: false })), true)
})
test('shouldPromptUpdate: update available mid-hand ⇒ defer (no prompt)', () => {
  assert.equal(shouldPromptUpdate(st({ updateAvailable: true, inHand: true })), false)
})

// ── mustBlockActions — a protocol mismatch stops silent incompatible submits ────────────────
test('mustBlockActions: only a protocol mismatch blocks; build drift alone does not', () => {
  assert.equal(mustBlockActions({ protocolMismatch: true }), true)
  assert.equal(mustBlockActions({ protocolMismatch: false }), false)
})
