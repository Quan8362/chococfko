import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  minimizeIp,
  minimizeDevice,
  hashIdentifier,
  computeIdentityOverlaps,
  redactPii,
  INTEGRITY_RETENTION,
  type AccountIdentityTokens,
} from './privacy.ts'

const SALT = 'test-salt-1234567890'

test('minimizeIp truncates IPv4 to /24', () => {
  assert.equal(minimizeIp('203.0.113.42'), '203.0.113.0/24')
  assert.equal(minimizeIp('203.0.113.199'), '203.0.113.0/24')
  // two hosts on the same /24 collapse to ONE network token
  assert.equal(minimizeIp('203.0.113.42'), minimizeIp('203.0.113.7'))
})

test('minimizeIp truncates IPv6 to /48 and rejects garbage', () => {
  assert.equal(minimizeIp('2001:db8:abcd:0012::1'), '2001:db8:abcd::/48')
  assert.equal(minimizeIp('not-an-ip'), null)
  assert.equal(minimizeIp('999.1.1.1'), null)
})

test('hashIdentifier is deterministic, salted, and irreversible-looking', () => {
  const a = hashIdentifier('ip', '203.0.113.42', SALT)
  const b = hashIdentifier('ip', '203.0.113.7', SALT) // same /24
  assert.equal(a, b, 'same network → same token')
  assert.ok(a && a.startsWith('ip:'))
  assert.notEqual(a, '203.0.113.0/24', 'token is hashed, not the raw minimized value')
  // different salt → different token (not portable across environments)
  assert.notEqual(hashIdentifier('ip', '203.0.113.42', 'another-salt-x'), a)
  // device tokens are namespaced separately from ip tokens
  assert.ok(hashIdentifier('device', 'fp-abc', SALT)!.startsWith('device:'))
})

test('hashIdentifier refuses a weak/missing salt', () => {
  assert.throws(() => hashIdentifier('ip', '203.0.113.42', ''), /salt/)
  assert.throws(() => hashIdentifier('ip', '203.0.113.42', 'short'), /salt/)
})

test('minimizeDevice trims and null-guards', () => {
  assert.equal(minimizeDevice('  fp-1 '), 'fp-1')
  assert.equal(minimizeDevice('   '), null)
})

test('computeIdentityOverlaps flags device vs network correctly', () => {
  const accounts: AccountIdentityTokens[] = [
    { userId: 'u1', tokens: new Set(['ip:aaa', 'device:xxx']) },
    { userId: 'u2', tokens: new Set(['ip:aaa']) }, // shares network only
    { userId: 'u3', tokens: new Set(['device:xxx']) }, // shares device only
    { userId: 'u4', tokens: new Set(['ip:zzz']) }, // shares nothing
  ]
  const overlaps = computeIdentityOverlaps(accounts)
  const u1u2 = overlaps.find((o) => o.userA === 'u1' && o.userB === 'u2')!
  assert.ok(u1u2.sharedNetwork && !u1u2.sharedDevice)
  const u1u3 = overlaps.find((o) => o.userA === 'u1' && o.userB === 'u3')!
  assert.ok(u1u3.sharedDevice && !u1u3.sharedNetwork)
  assert.ok(!overlaps.some((o) => o.userA === 'u4' || o.userB === 'u4'))
})

test('redactPii drops raw identifiers and PII keys', () => {
  const cleaned = redactPii({
    ip: '203.0.113.42',
    user_agent: 'Mozilla',
    handsTogether: 12,
    note: 'ok',
    someIp: '10.0.0.1', // value looks like an IP → dropped even though key passes
    nested: { email: 'a@b.c', count: 3 },
  })
  assert.equal(cleaned.ip, undefined)
  assert.equal(cleaned.user_agent, undefined)
  assert.equal(cleaned.someIp, undefined)
  assert.equal(cleaned.handsTogether, 12)
  assert.equal(cleaned.note, 'ok')
  assert.deepEqual(cleaned.nested, { count: 3 })
})

test('retention constants are sane and ordered', () => {
  assert.ok(INTEGRITY_RETENTION.identityTokenDays < INTEGRITY_RETENTION.riskCaseDays)
  assert.ok(INTEGRITY_RETENTION.riskCaseDays <= INTEGRITY_RETENTION.auditDays)
})
