import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolvePokerFlags,
  pokerVisibleTo,
  pokerCan,
  POKER_FLAG_ENV,
  type PokerFlags,
} from './flags.ts'

const OFF: PokerFlags = {
  enabled: false, createTable: false, publicLobby: false,
  privateTable: false, spectator: false, bot: false, tournament: false,
}
const admin = { isAdmin: true }
const player = { isAdmin: false }

test('FLAG-DEFAULT-001 empty env resolves every flag OFF', () => {
  assert.deepEqual(resolvePokerFlags({}), OFF)
})

test('FLAG-DEFAULT-002 unset/garbage values resolve OFF', () => {
  const f = resolvePokerFlags({
    POKER_ENABLED: '', POKER_CREATE_TABLE_ENABLED: '0',
    POKER_PUBLIC_LOBBY_ENABLED: 'false', POKER_PRIVATE_TABLE_ENABLED: 'off',
    POKER_SPECTATOR_ENABLED: 'nope',
  })
  assert.deepEqual(f, OFF)
})

test('FLAG-TRUTHY-001 accepts 1/true/on/yes (case-insensitive, trimmed)', () => {
  for (const v of ['1', 'true', 'TRUE', ' on ', 'Yes']) {
    assert.equal(resolvePokerFlags({ POKER_ENABLED: v }).enabled, true, `value=${v}`)
  }
})

test('FLAG-HARDOFF-001 bot/tournament stay OFF even when env sets them on', () => {
  const f = resolvePokerFlags({ POKER_BOT_ENABLED: 'true', POKER_TOURNAMENT_ENABLED: '1' })
  assert.equal(f.bot, false)
  assert.equal(f.tournament, false)
})

test('FLAG-ENVMAP-001 exposes exactly the seven canonical env names', () => {
  assert.deepEqual(Object.values(POKER_FLAG_ENV).sort(), [
    'POKER_BOT_ENABLED', 'POKER_CREATE_TABLE_ENABLED', 'POKER_ENABLED',
    'POKER_PRIVATE_TABLE_ENABLED', 'POKER_PUBLIC_LOBBY_ENABLED',
    'POKER_SPECTATOR_ENABLED', 'POKER_TOURNAMENT_ENABLED',
  ])
})

test('VIS-001 nobody but admin sees poker when master flag is off', () => {
  assert.equal(pokerVisibleTo(OFF, player), false)
  assert.equal(pokerVisibleTo(OFF, admin), true)
})

test('VIS-002 master flag on makes it visible to everyone', () => {
  const f = { ...OFF, enabled: true }
  assert.equal(pokerVisibleTo(f, player), true)
})

test('CAP-001 a disabled feature is closed to players but open to admins', () => {
  const f = { ...OFF, enabled: true } // visible, but no capability flags on
  assert.equal(pokerCan(f, player, 'create'), false)
  assert.equal(pokerCan(f, player, 'public_lobby'), false)
  assert.equal(pokerCan(f, player, 'private_table'), false)
  assert.equal(pokerCan(f, player, 'spectate'), false)
  assert.equal(pokerCan(f, player, 'enter'), true)
  // admin overrides every capability
  for (const cap of ['create', 'public_lobby', 'private_table', 'spectate', 'enter'] as const) {
    assert.equal(pokerCan(f, admin, cap), true, `admin cap=${cap}`)
  }
})

test('CAP-002 capability requires visibility first', () => {
  const f = { ...OFF, createTable: true } // create on but master off
  assert.equal(pokerCan(f, player, 'create'), false)
})

test('CAP-003 a specific capability flag opens exactly that capability', () => {
  const f = { ...OFF, enabled: true, publicLobby: true }
  assert.equal(pokerCan(f, player, 'public_lobby'), true)
  assert.equal(pokerCan(f, player, 'create'), false)
})
