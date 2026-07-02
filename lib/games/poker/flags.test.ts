import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolvePokerFlags,
  pokerVisibleTo,
  pokerCan,
  parseAlphaTesters,
  isAlphaTester,
  POKER_FLAG_ENV,
  type PokerFlags,
} from './flags.ts'

const OFF: PokerFlags = {
  enabled: false, createTable: false, publicLobby: false,
  privateTable: false, spectator: false, bot: false, tournament: false,
  alpha: false, blockNewJoins: false, closedBeta: false,
}
const admin = { isAdmin: true }
const player = { isAdmin: false }
const tester = { isAdmin: false, isAlphaTester: true }

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

test('FLAG-ENVMAP-001 exposes exactly the canonical env names', () => {
  assert.deepEqual(Object.values(POKER_FLAG_ENV).sort(), [
    'POKER_ALPHA_MODE', 'POKER_BLOCK_NEW_JOINS', 'POKER_BOT_ENABLED',
    'POKER_CLOSED_BETA_ENABLED', 'POKER_CREATE_TABLE_ENABLED', 'POKER_ENABLED',
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

// ── Alpha mode ────────────────────────────────────────────────────────────────
test('ALPHA-VIS-001 alpha mode locks the public out and admits only testers', () => {
  const f = { ...OFF, alpha: true } // note: enabled stays false
  assert.equal(pokerVisibleTo(f, player), false)
  assert.equal(pokerVisibleTo(f, tester), true)
  assert.equal(pokerVisibleTo(f, admin), true)
})

test('ALPHA-VIS-002 alpha mode overrides an ON master flag (public still locked out)', () => {
  const f = { ...OFF, alpha: true, enabled: true }
  assert.equal(pokerVisibleTo(f, player), false, 'public must not slip in via enabled')
  assert.equal(pokerVisibleTo(f, tester), true)
})

test('ALPHA-VIS-003 with alpha OFF behaviour is unchanged (enabled || admin)', () => {
  assert.equal(pokerVisibleTo({ ...OFF, enabled: true }, player), true)
  assert.equal(pokerVisibleTo({ ...OFF }, tester), false, 'tester flag is inert when alpha off')
})

test('ALPHA-RESOLVE-001 env maps POKER_ALPHA_MODE / POKER_BLOCK_NEW_JOINS', () => {
  const f = resolvePokerFlags({ POKER_ALPHA_MODE: 'on', POKER_BLOCK_NEW_JOINS: '1' })
  assert.equal(f.alpha, true)
  assert.equal(f.blockNewJoins, true)
})

test('FREEZE-001 blockNewJoins closes create + join for everyone (incl. admin)', () => {
  const f = { ...OFF, enabled: true, createTable: true, blockNewJoins: true }
  assert.equal(pokerCan(f, player, 'join'), false)
  assert.equal(pokerCan(f, player, 'create'), false)
  assert.equal(pokerCan(f, admin, 'join'), false)
  assert.equal(pokerCan(f, admin, 'create'), false)
})

test('FREEZE-002 a freeze does NOT block entering / spectating a running table', () => {
  const f = { ...OFF, enabled: true, spectator: true, blockNewJoins: true }
  assert.equal(pokerCan(f, player, 'enter'), true)
  assert.equal(pokerCan(f, player, 'spectate'), true)
})

test('FREEZE-003 without a freeze, join is allowed for any visible viewer', () => {
  const f = { ...OFF, enabled: true }
  assert.equal(pokerCan(f, player, 'join'), true)
})

test('TESTER-PARSE-001 allowlist is trimmed, lower-cased, de-duped', () => {
  assert.deepEqual(parseAlphaTesters(' A@x.com, b@x.com ,A@X.COM,'), ['a@x.com', 'b@x.com'])
  assert.deepEqual(parseAlphaTesters(''), [])
  assert.deepEqual(parseAlphaTesters(null), [])
})

test('TESTER-MATCH-001 membership is case-insensitive; empty email never matches', () => {
  const raw = 'tester@fko.com, quan@fko.com'
  assert.equal(isAlphaTester('QUAN@fko.com', raw), true)
  assert.equal(isAlphaTester('nobody@x.com', raw), false)
  assert.equal(isAlphaTester(null, raw), false)
  assert.equal(isAlphaTester('tester@fko.com', ''), false)
})

// ── Closed Beta stage ─────────────────────────────────────────────────────────
const betaMember = { isAdmin: false, isBetaMember: true }

test('BETA-VIS-001 closed beta locks the public out and admits only cohort members', () => {
  const f = { ...OFF, closedBeta: true }
  assert.equal(pokerVisibleTo(f, player), false)
  assert.equal(pokerVisibleTo(f, betaMember), true)
  assert.equal(pokerVisibleTo(f, admin), true)
})

test('BETA-VIS-002 closed beta overrides an ON master flag (public still locked out)', () => {
  const f = { ...OFF, closedBeta: true, enabled: true }
  assert.equal(pokerVisibleTo(f, player), false, 'public must not slip in via enabled')
  assert.equal(pokerVisibleTo(f, betaMember), true)
})

test('BETA-VIS-003 with closed beta OFF the member flag is inert', () => {
  assert.equal(pokerVisibleTo({ ...OFF }, betaMember), false)
  assert.equal(pokerVisibleTo({ ...OFF, enabled: true }, betaMember), true, 'public flag admits everyone')
})

test('BETA-SUSPEND-001 a suspended non-admin is locked out even if a member', () => {
  const f = { ...OFF, closedBeta: true }
  assert.equal(pokerVisibleTo(f, { isAdmin: false, isBetaMember: true, suspended: true }), false)
  assert.equal(pokerVisibleTo(f, { isAdmin: true, suspended: true }), true, 'admin is never suspended by this flag')
})

test('BETA-RESOLVE-001 env maps POKER_CLOSED_BETA_ENABLED', () => {
  assert.equal(resolvePokerFlags({ POKER_CLOSED_BETA_ENABLED: '1' }).closedBeta, true)
  assert.equal(resolvePokerFlags({}).closedBeta, false)
  assert.equal(POKER_FLAG_ENV.closedBeta, 'POKER_CLOSED_BETA_ENABLED')
})

test('BETA-ALPHA-PRECEDENCE-001 alpha gate is checked before beta (fails closed if both on)', () => {
  const f = { ...OFF, alpha: true, closedBeta: true }
  // a beta member who is NOT an alpha tester is kept out while alpha is left on
  assert.equal(pokerVisibleTo(f, betaMember), false)
  assert.equal(pokerVisibleTo(f, tester), true)
})
