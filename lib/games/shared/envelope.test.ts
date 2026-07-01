// Framework-free tests for the typed event envelope + duplicate-event dedupe.
// Run with:  node --test lib/games/shared/envelope.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createEnvelope,
  isValidEnvelope,
  isNewerEnvelope,
  EnvelopeDedupe,
  type GameEventEnvelope,
} from './envelope.ts'

function baseInput() {
  return {
    eventId: 'evt-1',
    type: 'hand_updated' as const,
    roomId: 'table-1',
    handId: 'hand-1',
    stateVersion: 5,
    actionSeq: 3,
    serverTs: 1_000_000,
    public: { street: 'FLOP', pot: 300 },
  }
}

test('createEnvelope builds a valid envelope and defaults handId/serverTs', () => {
  const e = createEnvelope({ ...baseInput(), handId: undefined, serverTs: undefined })
  assert.equal(e.handId, null)
  assert.equal(typeof e.serverTs, 'number')
  assert.ok(isValidEnvelope(e))
})

test('isValidEnvelope rejects malformed metadata', () => {
  assert.ok(isValidEnvelope(createEnvelope(baseInput())))
  assert.ok(isValidEnvelope({ ...baseInput() })) // a plain object with all valid fields passes
  assert.ok(!isValidEnvelope(null))
  assert.ok(!isValidEnvelope({ ...baseInput(), stateVersion: -1 }))
  assert.ok(!isValidEnvelope({ ...baseInput(), stateVersion: 1.5 }))
  assert.ok(!isValidEnvelope({ ...baseInput(), roomId: '' }))
  assert.ok(!isValidEnvelope({ ...baseInput(), type: '' }))
})

test('privateRecipients holds only user ids — never a payload', () => {
  const e = createEnvelope({ ...baseInput(), privateRecipients: ['user-a', 'user-b'] })
  assert.deepEqual(e.privateRecipients, ['user-a', 'user-b'])
  assert.ok(isValidEnvelope(e))
  // non-string recipients are rejected
  assert.ok(!isValidEnvelope({ ...baseInput(), privateRecipients: [{ cards: ['As'] }] }))
})

test('isNewerEnvelope compares by state version', () => {
  const a = createEnvelope({ ...baseInput(), eventId: 'a', stateVersion: 6 })
  const b = createEnvelope({ ...baseInput(), eventId: 'b', stateVersion: 5 })
  assert.ok(isNewerEnvelope(a, b))
  assert.ok(!isNewerEnvelope(b, a))
})

test('EnvelopeDedupe accepts an event once, rejects repeats', () => {
  const d = new EnvelopeDedupe()
  assert.ok(d.accept('evt-1')) // first time → process
  assert.ok(!d.accept('evt-1')) // duplicate delivery → ignore
  assert.ok(d.accept('evt-2'))
  assert.equal(d.size, 2)
  assert.ok(d.has('evt-1'))
})

test('EnvelopeDedupe is bounded (evicts oldest beyond capacity)', () => {
  const d = new EnvelopeDedupe(3)
  d.accept('a')
  d.accept('b')
  d.accept('c')
  d.accept('d') // evicts 'a'
  assert.ok(!d.has('a'))
  assert.ok(d.has('d'))
  assert.equal(d.size, 3)
  // 'a' re-appearing is treated as new again (it was evicted) — acceptable for a bounded cache
  assert.ok(d.accept('a'))
})

// A public payload type that, by construction, has no card-bearing field.
type PublicHandPayload = { street: string; pot: number }
const _typecheck: GameEventEnvelope<'hand_updated', PublicHandPayload> = createEnvelope({
  ...baseInput(),
})
void _typecheck
