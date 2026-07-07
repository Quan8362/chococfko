import test from 'node:test'
import assert from 'node:assert/strict'
import { scanText, isSafeInternalPath } from './redaction.ts'
import { buildPokerNotification } from './catalog.ts'

// These prove the exact checks the generic web-push boundary (lib/push/send.ts) applies to every
// POKER-tagged payload before it can reach web-push, and that the dedicated builder is inert/guarded.

// Mirror of the boundary guard in lib/push/send.ts (kept in sync; pure so it is unit-testable here).
function pokerBoundaryReasons(payload: { title?: string; body?: string; tag?: string; url?: string }): string[] {
  if (typeof payload.tag !== 'string' || !payload.tag.startsWith('poker-')) return []
  return [
    ...scanText('title', payload.title ?? ''),
    ...scanText('body', payload.body ?? ''),
    ...scanText('tag', payload.tag ?? ''),
    ...(payload.url != null && !isSafeInternalPath(payload.url) ? ['url: unsafe'] : []),
  ]
}

test('a clean poker-tagged payload passes the boundary', () => {
  const reasons = pokerBoundaryReasons({
    title: 'Tournament starting soon',
    body: 'Your Poker tournament is about to begin',
    tag: 'poker-tournament-abc',
    url: '/games/poker/tournaments/abc',
  })
  assert.deepEqual(reasons, [])
})

test('the boundary blocks a payload leaking a forbidden word (hole cards / seed)', () => {
  assert.ok(pokerBoundaryReasons({ title: 'x', body: 'your hole cards are As Kd', tag: 'poker-x', url: '/games/poker' }).length > 0)
  assert.ok(pokerBoundaryReasons({ title: 'x', body: 'shuffle seed 12345', tag: 'poker-x', url: '/games/poker' }).length > 0)
})

test('the boundary blocks a token-shaped blob and an off-origin / unsafe url', () => {
  assert.ok(pokerBoundaryReasons({ title: 'x', body: 'eyJhbGciOi.JIUzI1NiIsInR5cCI6', tag: 'poker-x', url: '/games/poker' }).length > 0)
  assert.ok(pokerBoundaryReasons({ title: 'x', body: 'ok', tag: 'poker-x', url: 'https://evil.example.com' }).length > 0)
  assert.ok(pokerBoundaryReasons({ title: 'x', body: 'ok', tag: 'poker-x', url: '//evil.example.com' }).length > 0)
})

test('non-poker payloads are not touched by the poker boundary', () => {
  assert.deepEqual(pokerBoundaryReasons({ title: 'seed', body: 'hole cards', tag: 'tlmn-room-1' }), [])
})

test('tournament reminders are INERT while tournaments are OFF (builder returns null)', () => {
  const inert = buildPokerNotification({
    kind: 'tournament_reminder',
    tournamentId: 'abc',
    tournamentsEnabled: false,
    title: 'Tournament starting soon',
    body: 'Your Poker tournament is about to begin',
  })
  assert.equal(inert, null)
})

test('an enabled reminder with clean copy builds a redaction-checked, same-origin notification', () => {
  const n = buildPokerNotification({
    kind: 'tournament_reminder',
    tournamentId: 'abc',
    tournamentsEnabled: true,
    title: 'Tournament starting soon',
    body: 'Your Poker tournament is about to begin',
  })
  assert.ok(n)
  assert.equal(n?.tag, 'poker-tournament-abc')
  assert.equal(n?.url, '/games/poker/tournaments/abc')
  assert.ok(isSafeInternalPath(n!.url))
})

test('the builder REFUSES to emit a notification whose localized copy smuggled a secret', () => {
  assert.throws(() =>
    buildPokerNotification({
      kind: 'tournament_reminder',
      tournamentId: 'abc',
      tournamentsEnabled: true,
      title: 'Tournament starting soon',
      body: 'your access_token is eyJhbGciOiJIUzI1NiIsInR5cCI6',
    }),
  )
})
