import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPokerNotification,
  POKER_NOTIFICATION_I18N,
  type PokerNotificationKind,
} from './catalog.ts'
import { PokerNotificationRedactionError, isSafeInternalPath } from './redaction.ts'

test('friend_table_invite → safe table URL, invite-per-table tag', () => {
  const n = buildPokerNotification({
    kind: 'friend_table_invite',
    tableId: 'tbl_42',
    title: 'Minh mời bạn',
    body: 'Vào bàn chơi cùng nhé',
  })
  assert.ok(n)
  assert.equal(n!.url, '/games/poker/tbl_42')
  assert.equal(n!.tag, 'poker-invite-tbl_42')
  assert.ok(isSafeInternalPath(n!.url))
})

test('private_table_invite → table URL WITHOUT password, same collapse tag', () => {
  const n = buildPokerNotification({
    kind: 'private_table_invite',
    tableId: 'tbl_9',
    title: 'Bạn được mời',
    body: 'Vào bàn riêng',
  })
  assert.ok(n)
  assert.equal(n!.url, '/games/poker/tbl_9')
  // no password/token ever rides along
  assert.ok(!n!.url.includes('?'))
  assert.equal(n!.tag, 'poker-invite-tbl_9')
})

test('table id is percent-encoded (cannot break the path or inject a query)', () => {
  const n = buildPokerNotification({
    kind: 'friend_table_invite',
    tableId: 'a/b?x=1#z',
    title: 't',
    body: 'b',
  })
  assert.ok(n)
  assert.ok(isSafeInternalPath(n!.url))
  assert.ok(!n!.url.includes('?'))
  assert.ok(n!.url.startsWith('/games/poker/'))
})

test('beta_invite and maintenance_complete land on the governed poker home', () => {
  const beta = buildPokerNotification({ kind: 'beta_invite', title: 'Beta', body: 'Mời bạn' })
  assert.equal(beta!.url, '/games/poker')
  assert.equal(beta!.tag, 'poker-beta-invite')

  const maint = buildPokerNotification({ kind: 'maintenance_complete', title: 'Xong', body: 'Bàn đã mở' })
  assert.equal(maint!.url, '/games/poker')
  assert.equal(maint!.tag, 'poker-maintenance')
})

test('tournament_reminder is INERT while tournaments are OFF', () => {
  const off = buildPokerNotification({
    kind: 'tournament_reminder',
    tournamentId: 'trn_1',
    tournamentsEnabled: false,
    title: 'Giải sắp bắt đầu',
    body: 'Còn 5 phút',
  })
  assert.equal(off, null)
})

test('tournament_reminder produces a safe URL ONLY when explicitly enabled', () => {
  const on = buildPokerNotification({
    kind: 'tournament_reminder',
    tournamentId: 'trn_1',
    tournamentsEnabled: true,
    title: 'Giải sắp bắt đầu',
    body: 'Còn 5 phút',
  })
  assert.ok(on)
  assert.equal(on!.url, '/games/poker/tournaments/trn_1')
  assert.ok(isSafeInternalPath(on!.url))
})

test('a leaked secret in localized copy is rejected even for an allowed kind', () => {
  assert.throws(
    () =>
      buildPokerNotification({
        kind: 'private_table_invite',
        tableId: 'tbl_9',
        title: 'Bạn được mời',
        body: 'Mật khẩu bàn: hunter2', // caller mistake — must be blocked
      }),
    PokerNotificationRedactionError,
  )
})

test('every allowed kind has an i18n key mapping', () => {
  const kinds: PokerNotificationKind[] = [
    'friend_table_invite',
    'private_table_invite',
    'beta_invite',
    'maintenance_complete',
    'tournament_reminder',
  ]
  for (const k of kinds) {
    assert.ok(POKER_NOTIFICATION_I18N[k], `missing i18n mapping for ${k}`)
    assert.ok(POKER_NOTIFICATION_I18N[k].title.startsWith('games.poker.notif.'))
    assert.ok(POKER_NOTIFICATION_I18N[k].body.startsWith('games.poker.notif.'))
  }
})
