// Framework-free tests for the pure TLMN interaction anti-spam / dedup / validation
// helpers (the parts of the realtime reaction layer that must be deterministically
// correct). Run with:  node --test lib/games/tlmn/interactions.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PHRASES, CATEGORY_ORDER, THROWABLES, getPhrase, getThrowable, makeInteractionId,
  newRateLimiter, rateLimitAllow, validateIncoming, makeSeenCache,
  resolveConfig, decideSpend, RATE_LIMITS, INTERACTION_SCHEMA_VERSION,
  type CatalogConfig,
} from './interactions.ts'

// ── Catalog integrity ────────────────────────────────────────────────────────────────
test('every phrase has a known category and a unique key', () => {
  const keys = new Set<string>()
  for (const p of PHRASES) {
    assert.ok(CATEGORY_ORDER.includes(p.category), `bad category: ${p.category}`)
    assert.ok(!keys.has(p.key), `duplicate key: ${p.key}`)
    keys.add(p.key)
    assert.equal(getPhrase(p.key)?.key, p.key)
  }
  assert.ok(PHRASES.length >= 20)
})

test('makeInteractionId returns unique non-empty ids', () => {
  const a = makeInteractionId(); const b = makeInteractionId()
  assert.ok(a.length > 0 && b.length > 0)
  assert.notEqual(a, b)
})

// ── Rate limiter: per-action cooldown (≥1 phrase / 3s) ────────────────────────────────
test('cooldown blocks a second send within 3s and allows after', () => {
  const rl = newRateLimiter()
  assert.equal(rateLimitAllow(rl, 0), true)        // first send ok
  assert.equal(rateLimitAllow(rl, 2999), false)    // 2.999s later → blocked
  assert.equal(rateLimitAllow(rl, 3000), true)     // exactly 3s later → ok
})

test('a double-tap in the same tick sends only once', () => {
  const rl = newRateLimiter()
  assert.equal(rateLimitAllow(rl, 1000), true)
  assert.equal(rateLimitAllow(rl, 1000), false)    // same now → blocked (single send)
})

// ── Rate limiter: rolling window cap (≤5 interactions / 20s) ──────────────────────────
test('window cap blocks the 6th interaction inside 20s, frees as it scrolls out', () => {
  const rl = newRateLimiter()
  // 5 sends spaced 3s apart (each clears the cooldown): t=0,3,6,9,12 → all allowed.
  for (let i = 0; i < 5; i++) assert.equal(rateLimitAllow(rl, i * 3000), true)
  // 6th at t=15s: cooldown ok (3s since last) but window already holds 5 in [0,20) → blocked.
  assert.equal(rateLimitAllow(rl, 15000), false)
  // At t=20s the first send (t=0) has scrolled out of the window → allowed again.
  assert.equal(rateLimitAllow(rl, 20000), true)
})

test('rate-limit constants match the spec', () => {
  assert.equal(RATE_LIMITS.phraseCooldownMs, 3000)
  assert.equal(RATE_LIMITS.windowMs, 20000)
  assert.equal(RATE_LIMITS.windowMax, 5)
})

// ── Dedup cache: event-id idempotency ─────────────────────────────────────────────────
test('seen cache accepts an id once and rejects repeats (dedup retries / self-echo)', () => {
  const cache = makeSeenCache()
  assert.equal(cache.accept('evt-1', 0), true)
  assert.equal(cache.accept('evt-1', 5), false)    // duplicate id → ignored
  assert.equal(cache.accept('evt-2', 5), true)     // a different id → accepted
})

test('seen cache stays bounded (prunes old entries past the cap)', () => {
  const cache = makeSeenCache(50)
  for (let i = 0; i < 60; i++) cache.accept(`old-${i}`, i)      // old ts
  cache.accept('fresh', 1_000_000)                              // triggers prune
  assert.ok(cache.size <= 51, `cache grew unbounded: ${cache.size}`)
})

// ── Incoming validator: schema-version + shape + known-key guard ──────────────────────
test('validateIncoming accepts a well-formed current-version phrase event', () => {
  const ev = validateIncoming({
    v: INTERACTION_SCHEMA_VERSION, id: 'x', kind: 'phrase', key: 'hello',
    senderSeat: 2, targetSeat: null, at: 123,
  })
  assert.ok(ev)
  assert.equal(ev?.key, 'hello')
  assert.equal(ev?.senderSeat, 2)
})

test('validateIncoming rejects wrong version, bad shape, unknown key/kind', () => {
  const base = { id: 'x', kind: 'phrase', key: 'hello', senderSeat: 0 }
  assert.equal(validateIncoming(null), null)
  assert.equal(validateIncoming({ ...base, v: 999 }), null)          // old/forged version
  assert.equal(validateIncoming({ ...base, v: INTERACTION_SCHEMA_VERSION, id: '' }), null) // empty id
  assert.equal(validateIncoming({ ...base, v: INTERACTION_SCHEMA_VERSION, kind: 'throwable' }), null) // not phase 1
  assert.equal(validateIncoming({ ...base, v: INTERACTION_SCHEMA_VERSION, key: 'nope' }), null) // unknown phrase
  assert.equal(validateIncoming({ ...base, v: INTERACTION_SCHEMA_VERSION, senderSeat: 'a' }), null) // bad seat
})

test('validateIncoming normalizes a missing targetSeat to null', () => {
  const ev = validateIncoming({ v: INTERACTION_SCHEMA_VERSION, id: 'x', kind: 'phrase', key: 'win', senderSeat: 1 })
  assert.equal(ev?.targetSeat, null)
})

// ── Throwables (Phase 2) ──────────────────────────────────────────────────────────────
test('throwable catalog: unique keys, known impact, four core items present', () => {
  const keys = new Set<string>()
  for (const it of THROWABLES) {
    assert.ok(!keys.has(it.key), `dup throwable key: ${it.key}`)
    keys.add(it.key)
    assert.equal(getThrowable(it.key)?.key, it.key)
    assert.equal(typeof it.cost, 'number')
  }
  for (const core of ['flower', 'heart', 'bomb', 'tomato']) assert.ok(keys.has(core), `missing core item: ${core}`)
})

test('validateIncoming accepts a well-formed throwable with a target', () => {
  const ev = validateIncoming({
    v: INTERACTION_SCHEMA_VERSION, id: 't1', kind: 'throwable', key: 'bomb', senderSeat: 0, targetSeat: 2,
  })
  assert.ok(ev)
  assert.equal(ev?.kind, 'throwable')
  assert.equal(ev?.targetSeat, 2)
})

test('validateIncoming rejects throwables with no/invalid/self target or unknown item', () => {
  const base = { v: INTERACTION_SCHEMA_VERSION, id: 't', kind: 'throwable', senderSeat: 1 }
  assert.equal(validateIncoming({ ...base, key: 'bomb' }), null)                       // no target
  assert.equal(validateIncoming({ ...base, key: 'bomb', targetSeat: 'x' }), null)      // bad target
  assert.equal(validateIncoming({ ...base, key: 'bomb', targetSeat: 1 }), null)        // self target
  assert.equal(validateIncoming({ ...base, key: 'nope', targetSeat: 2 }), null)        // unknown item
})

test('throwable cooldown is 4s (distinct from the 3s phrase cooldown)', () => {
  assert.equal(RATE_LIMITS.throwableCooldownMs, 4000)
  const rl = newRateLimiter()
  assert.equal(rateLimitAllow(rl, 0, RATE_LIMITS.throwableCooldownMs), true)
  assert.equal(rateLimitAllow(rl, 3999, RATE_LIMITS.throwableCooldownMs), false) // <4s blocked
  assert.equal(rateLimitAllow(rl, 4000, RATE_LIMITS.throwableCooldownMs), true)  // 4s ok
})

// ── Coin economy config + spend decision (Phase 3) ────────────────────────────────────
test('resolveConfig: absent key ⇒ enabled + free; priced key reflects DB', () => {
  const m = new Map<string, CatalogConfig>([
    ['bomb', { key: 'bomb', coin_cost: 500, free_daily_limit: 1, is_enabled: true }],
    ['old', { key: 'old', coin_cost: 0, free_daily_limit: 0, is_enabled: false }],
  ])
  assert.deepEqual(resolveConfig('flower', m), { cost: 0, freeLimit: 0, enabled: true, alwaysFree: true })
  const bomb = resolveConfig('bomb', m)
  assert.equal(bomb.cost, 500); assert.equal(bomb.freeLimit, 1); assert.equal(bomb.alwaysFree, false)
  assert.equal(resolveConfig('old', m).enabled, false) // explicitly disabled
})

test('decideSpend mirrors the RPC: free when cost 0, free under daily limit, else paid/insufficient', () => {
  assert.equal(decideSpend({ cost: 0, freeLimit: 0, usedFreeToday: 0, balance: 0 }), 'free')      // always free
  assert.equal(decideSpend({ cost: 500, freeLimit: 1, usedFreeToday: 0, balance: 0 }), 'free')    // 1st of the day, free even at 0 balance
  assert.equal(decideSpend({ cost: 500, freeLimit: 1, usedFreeToday: 1, balance: 999 }), 'paid')  // free used → must pay
  assert.equal(decideSpend({ cost: 500, freeLimit: 1, usedFreeToday: 1, balance: 499 }), 'insufficient')
  assert.equal(decideSpend({ cost: 500, freeLimit: 0, usedFreeToday: 0, balance: 500 }), 'paid')  // exact balance ok
})
