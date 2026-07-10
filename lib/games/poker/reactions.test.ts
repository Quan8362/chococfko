import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  REACTIONS,
  REACTION_SCHEMA_VERSION,
  REACTION_LIMITS,
  CATEGORY_ORDER,
  MAX_SEAT_INDEX,
  getReaction,
  isValidReactionKey,
  validateIncoming,
  newRateLimiter,
  rateLimitAllow,
  makeSeenCache,
  serverReactionRateLimit,
  reactionChannelName,
  type ReactionEvent,
} from './reactions.ts'

// ── Catalog integrity ─────────────────────────────────────────────────────────────────────────
test('REACT-CAT-001 catalog keys are unique + every reaction has a known category', () => {
  const keys = new Set<string>()
  for (const r of REACTIONS) {
    assert.equal(keys.has(r.key), false, `duplicate key ${r.key}`)
    keys.add(r.key)
    assert.ok(CATEGORY_ORDER.includes(r.category), `unknown category ${r.category}`)
    assert.ok(r.emoji.length > 0)
  }
  assert.equal(REACTIONS.length, 24)
})

test('REACT-CAT-002 each category has exactly six curated reactions', () => {
  for (const c of CATEGORY_ORDER) {
    assert.equal(REACTIONS.filter((r) => r.category === c).length, 6, `category ${c}`)
  }
})

test('REACT-CAT-003 allowlist accepts known keys and rejects unknown / arbitrary text', () => {
  assert.equal(isValidReactionKey('hello'), true)
  assert.equal(isValidReactionKey('gg'), true)
  assert.equal(isValidReactionKey('definitely-not-a-key'), false)
  assert.equal(isValidReactionKey('<script>alert(1)</script>'), false)
  assert.equal(isValidReactionKey(''), false)
  assert.equal(isValidReactionKey(42 as unknown), false)
  assert.equal(isValidReactionKey(null as unknown), false)
  assert.ok(getReaction('respect'))
  assert.equal(getReaction('nope'), undefined)
})

// ── Incoming validation (schema + allowlist + seat guard) ───────────────────────────────────────
const goodEvent = (over: Partial<ReactionEvent> = {}): ReactionEvent => ({
  v: REACTION_SCHEMA_VERSION,
  id: 'evt-1',
  key: 'hello',
  senderSeat: 2,
  at: 123,
  ...over,
})

test('REACT-VAL-001 a well-formed event validates + normalizes', () => {
  const ev = validateIncoming(goodEvent())
  assert.ok(ev)
  assert.equal(ev!.key, 'hello')
  assert.equal(ev!.senderSeat, 2)
})

test('REACT-VAL-002 wrong schema version is rejected', () => {
  assert.equal(validateIncoming(goodEvent({ v: 999 })), null)
})

test('REACT-VAL-003 unknown / arbitrary-text key is rejected (no free text ever renders)', () => {
  assert.equal(validateIncoming(goodEvent({ key: 'not-a-key' })), null)
  assert.equal(validateIncoming(goodEvent({ key: 'hey there this is free text' as string })), null)
  assert.equal(validateIncoming({ ...goodEvent(), key: 123 as unknown }), null)
})

test('REACT-VAL-004 malformed / missing id is rejected', () => {
  assert.equal(validateIncoming(goodEvent({ id: '' })), null)
  assert.equal(validateIncoming({ ...goodEvent(), id: undefined as unknown as string }), null)
  assert.equal(validateIncoming(goodEvent({ id: 'x'.repeat(65) })), null)
})

test('REACT-VAL-005 non-finite / out-of-range / non-integer seat is rejected', () => {
  assert.equal(validateIncoming(goodEvent({ senderSeat: NaN })), null)
  assert.equal(validateIncoming(goodEvent({ senderSeat: -1 })), null)
  assert.equal(validateIncoming(goodEvent({ senderSeat: MAX_SEAT_INDEX + 1 })), null)
  assert.equal(validateIncoming(goodEvent({ senderSeat: 1.5 })), null)
})

test('REACT-VAL-006 non-object payloads are rejected', () => {
  assert.equal(validateIncoming(null), null)
  assert.equal(validateIncoming(undefined), null)
  assert.equal(validateIncoming('hello'), null)
  assert.equal(validateIncoming(7), null)
})

test('REACT-VAL-007 the validated payload carries NO private fields (only public-safe keys)', () => {
  // A forged payload that smuggles PII must be normalized down to the safe shape only.
  const dirty = { ...goodEvent(), userId: 'uuid-secret', email: 'a@b.com', cards: ['As', 'Kd'] }
  const ev = validateIncoming(dirty)
  assert.ok(ev)
  assert.deepEqual(Object.keys(ev!).sort(), ['at', 'id', 'key', 'senderSeat', 'v'])
  assert.equal('userId' in ev!, false)
  assert.equal('email' in ev!, false)
  assert.equal('cards' in ev!, false)
})

// ── Client rate limiter ─────────────────────────────────────────────────────────────────────────
test('REACT-RATE-001 cooldown blocks a second send inside the window', () => {
  const rl = newRateLimiter()
  assert.equal(rateLimitAllow(rl, 1000), true)
  assert.equal(rateLimitAllow(rl, 1000 + REACTION_LIMITS.cooldownMs - 1), false) // too soon
  assert.equal(rateLimitAllow(rl, 1000 + REACTION_LIMITS.cooldownMs), true) // exactly at cooldown
})

test('REACT-RATE-002 a rapid double-tap in the same tick yields exactly one send', () => {
  const rl = newRateLimiter()
  const now = 5000
  assert.equal(rateLimitAllow(rl, now), true)
  assert.equal(rateLimitAllow(rl, now), false)
  assert.equal(rateLimitAllow(rl, now), false)
})

test('REACT-RATE-003 no rolling window ever exceeds the burst cap', () => {
  const rl = newRateLimiter()
  const accepted: number[] = []
  // Drive a long cooldown-spaced stream (cooldown never blocks) and record accepted sends.
  for (let i = 0; i < 12; i++) {
    const t = i * REACTION_LIMITS.cooldownMs
    if (rateLimitAllow(rl, t)) accepted.push(t)
  }
  // Invariant: for every accepted send, at most windowMax accepted sends fall in the preceding
  // windowMs span (this is the burst guarantee, independent of cooldown spacing).
  for (const t of accepted) {
    const inWindow = accepted.filter((x) => x <= t && t - x < REACTION_LIMITS.windowMs)
    assert.ok(inWindow.length <= REACTION_LIMITS.windowMax, `window at ${t} had ${inWindow.length}`)
  }
})

test('REACT-RATE-004 server limiter is authoritative + per-user independent', () => {
  const now = 100000
  assert.equal(serverReactionRateLimit('user-A', now), true)
  assert.equal(serverReactionRateLimit('user-A', now + 100), false) // A is cooling down
  assert.equal(serverReactionRateLimit('user-B', now + 100), true) // B is unaffected
  assert.equal(serverReactionRateLimit('user-A', now + REACTION_LIMITS.cooldownMs), true)
})

// ── Dedup cache ─────────────────────────────────────────────────────────────────────────────────
test('REACT-DEDUP-001 the same id is accepted once, then rejected (self echo / retries)', () => {
  const cache = makeSeenCache()
  assert.equal(cache.accept('id-1', 1), true)
  assert.equal(cache.accept('id-1', 2), false)
  assert.equal(cache.accept('id-2', 3), true)
})

test('REACT-DEDUP-002 cache is bounded (prunes old entries under load)', () => {
  const cache = makeSeenCache(10)
  for (let i = 0; i < 50; i++) cache.accept(`id-${i}`, i)
  // Add one far in the future to trigger pruning of stale entries.
  cache.accept('late', 1_000_000)
  assert.ok(cache.size <= 20)
})

// ── Channel naming ─────────────────────────────────────────────────────────────────────────────
test('REACT-CHAN-001 FX channel is table-scoped + distinct from the game channel', () => {
  assert.equal(reactionChannelName('abc'), 'poker-fx:abc')
  assert.notEqual(reactionChannelName('abc'), 'poker:abc')
  assert.notEqual(reactionChannelName('abc'), reactionChannelName('xyz'))
})
