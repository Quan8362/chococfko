// Framework-free tests for the subscription lifecycle (leak-free cleanup) + channel naming.
// Run with:  node --test lib/games/shared/transport.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SubscriptionRegistry, channelName, type Unsubscribable } from './transport.ts'

function fakeSub() {
  let count = 0
  const sub: Unsubscribable & { calls: () => number } = {
    unsubscribe() {
      count++
    },
    calls: () => count,
  }
  return sub
}

test('channelName composes namespace:roomId', () => {
  assert.equal(channelName('poker', 'table-1'), 'poker:table-1')
  assert.throws(() => channelName('', 'x'))
  assert.throws(() => channelName('poker', ''))
})

test('cleanupAll unsubscribes every tracked subscription exactly once', () => {
  const reg = new SubscriptionRegistry()
  const a = fakeSub()
  const b = fakeSub()
  reg.add(a)
  reg.add(b)
  assert.equal(reg.size, 2)

  reg.cleanupAll()
  assert.equal(a.calls(), 1)
  assert.equal(b.calls(), 1)
  assert.equal(reg.size, 0)

  // Idempotent: a second cleanup does nothing (no double-unsubscribe).
  reg.cleanupAll()
  assert.equal(a.calls(), 1)
  assert.equal(b.calls(), 1)
})

test('remove unsubscribes and forgets a single subscription', () => {
  const reg = new SubscriptionRegistry()
  const a = fakeSub()
  reg.add(a)
  reg.remove(a)
  assert.equal(a.calls(), 1)
  assert.ok(!reg.has(a))
  // removing an unknown / already-removed sub is a no-op
  reg.remove(a)
  assert.equal(a.calls(), 1)
})

test('a throwing unsubscribe never strands other cleanups', () => {
  const reg = new SubscriptionRegistry()
  const bad: Unsubscribable = {
    unsubscribe() {
      throw new Error('boom')
    },
  }
  const good = fakeSub()
  reg.add(bad)
  reg.add(good)
  assert.doesNotThrow(() => reg.cleanupAll())
  assert.equal(good.calls(), 1) // good sub still torn down despite bad sub throwing
  assert.equal(reg.size, 0)
})
