import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  assertSafeNotification,
  safeOrNull,
  isSafeInternalPath,
  scanText,
  PokerNotificationRedactionError,
  type SafePokerNotification,
} from './redaction.ts'

const good: SafePokerNotification = {
  kind: 'friend_table_invite',
  title: 'Minh mời bạn vào bàn',
  body: 'Ngồi vào chơi cùng nhé',
  url: '/games/poker/abc123',
  tag: 'poker-invite-abc123',
}

test('accepts a clean same-origin notification', () => {
  assert.equal(assertSafeNotification(good), good)
  assert.equal(safeOrNull(good), good)
})

test('isSafeInternalPath: accepts a plain relative path', () => {
  assert.equal(isSafeInternalPath('/games/poker/abc'), true)
  assert.equal(isSafeInternalPath('/games/poker'), true)
})

test('isSafeInternalPath: rejects cross-origin and protocol-relative URLs', () => {
  assert.equal(isSafeInternalPath('https://evil.com/x'), false)
  assert.equal(isSafeInternalPath('//evil.com/x'), false)
  assert.equal(isSafeInternalPath('/\\evil.com'), false)
  assert.equal(isSafeInternalPath('http://x'), false)
  assert.equal(isSafeInternalPath('javascript:alert(1)'), false)
  assert.equal(isSafeInternalPath('games/poker'), false) // no leading slash
})

test('isSafeInternalPath: rejects control chars (header/CRLF injection)', () => {
  assert.equal(isSafeInternalPath('/games/poker\nSet-Cookie: x'), false)
  assert.equal(isSafeInternalPath('/games/poker\r\n'), false)
})

test('isSafeInternalPath: rejects secret-carrying query params', () => {
  assert.equal(isSafeInternalPath('/games/poker/t1?password=hunter2'), false)
  assert.equal(isSafeInternalPath('/games/poker/t1?pw=x'), false)
  assert.equal(isSafeInternalPath('/games/poker/t1?token=abc'), false)
  assert.equal(isSafeInternalPath('/games/poker/t1?access_token=abc'), false)
  assert.equal(isSafeInternalPath('/games/poker/t1?seed=999'), false)
  // a benign query is fine
  assert.equal(isSafeInternalPath('/games/poker/t1?from=lobby'), true)
})

test('scanText: flags forbidden words case-insensitively', () => {
  assert.ok(scanText('body', 'Your PASSWORD is 1234').length > 0)
  assert.ok(scanText('body', 'mật khẩu bàn là 9999').length > 0)
  assert.ok(scanText('body', 'session token leaked').length > 0)
  assert.equal(scanText('body', 'Bạn được mời vào bàn').length, 0)
})

test('scanText: flags token-shaped blobs (JWT, long hex, long base64)', () => {
  assert.ok(scanText('body', 'eyJhbGciOi.eyJzdWIiOiIx').length > 0)
  assert.ok(scanText('body', 'deadbeefdeadbeefdeadbeefdeadbeef00').length > 0)
  assert.ok(scanText('body', 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVowMTIzNDU2Nzg5').length > 0)
})

test('assertSafeNotification: throws on a leaked hole-card / password body', () => {
  assert.throws(
    () => assertSafeNotification({ ...good, body: 'Your hole cards: As Kd' }),
    PokerNotificationRedactionError,
  )
  assert.throws(
    () => assertSafeNotification({ ...good, body: 'table password is hunter2' }),
    PokerNotificationRedactionError,
  )
})

test('assertSafeNotification: throws on a cross-origin url', () => {
  assert.throws(
    () => assertSafeNotification({ ...good, url: 'https://evil.com' }),
    PokerNotificationRedactionError,
  )
})

test('assertSafeNotification: throws on empty title / missing tag', () => {
  assert.throws(() => assertSafeNotification({ ...good, title: '  ' }), PokerNotificationRedactionError)
  assert.throws(() => assertSafeNotification({ ...good, tag: '' }), PokerNotificationRedactionError)
})

test('assertSafeNotification: throws on over-long body (state smuggling)', () => {
  assert.throws(
    () => assertSafeNotification({ ...good, body: 'x'.repeat(200) }),
    PokerNotificationRedactionError,
  )
})

test('safeOrNull: returns null instead of throwing', () => {
  assert.equal(safeOrNull({ ...good, url: 'https://evil.com' }), null)
})
