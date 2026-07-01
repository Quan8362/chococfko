import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateTableConfig,
  isBuyInAmountValid,
  isTopUpAllowed,
  canSeatTransition,
  isReservationExpired,
  isTableJoinable,
  projectLobbyTable,
  isTableReapable,
  SEAT_TRANSITIONS,
  POKER_ACTION_TIME_SECONDS,
  POKER_TIME_BANK_SECONDS,
  POKER_RAKE_BPS,
  POKER_ANTE,
  POKER_STRADDLE_ENABLED,
  POKER_RESERVATION_TTL_SECONDS,
  type LobbyTableRaw,
} from './lifecycle.ts'

// ── Table-config validation (TABLE creation) ───────────────────────────────────────────
test('TABLE config: a valid public table normalizes with the fixed clock + no rake/ante/straddle', () => {
  const r = validateTableConfig({ name: '  Friday Game  ', smallBlind: 500, bigBlind: 1000 })
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.config.name, 'Friday Game') // trimmed
  assert.equal(r.config.capacity, 6) // default
  assert.equal(r.config.isPrivate, false)
  assert.equal(r.config.password, null)
  assert.equal(r.config.minBuyInBb, 40)
  assert.equal(r.config.maxBuyInBb, 100)
  assert.equal(r.config.allowSpectators, true)
  assert.equal(r.config.actionTimeSeconds, POKER_ACTION_TIME_SECONDS)
  assert.equal(r.config.timeBankSeconds, POKER_TIME_BANK_SECONDS)
  assert.equal(r.config.rakeBps, POKER_RAKE_BPS)
  assert.equal(r.config.ante, POKER_ANTE)
  assert.equal(r.config.straddleEnabled, POKER_STRADDLE_ENABLED)
})

test('TABLE config: fixed clock/no-rake constants are 20s / 15s / 0 / 0 / false', () => {
  assert.equal(POKER_ACTION_TIME_SECONDS, 20)
  assert.equal(POKER_TIME_BANK_SECONDS, 15)
  assert.equal(POKER_RAKE_BPS, 0)
  assert.equal(POKER_ANTE, 0)
  assert.equal(POKER_STRADDLE_ENABLED, false)
})

test('TABLE config: private table requires a password; spectator flag honored', () => {
  assert.deepEqual(validateTableConfig({ name: 'P', smallBlind: 1, bigBlind: 2, isPrivate: true }), {
    ok: false,
    error: 'password_required',
  })
  const r = validateTableConfig({
    name: 'P',
    smallBlind: 1,
    bigBlind: 2,
    isPrivate: true,
    password: '  hunter2 ',
    allowSpectators: false,
  })
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.config.isPrivate, true)
  assert.equal(r.config.password, 'hunter2') // trimmed, retained for hashing
  assert.equal(r.config.allowSpectators, false)
})

test('TABLE config: rejects blank name, over-long name, bad blinds, bad capacity, bad buy-in bb', () => {
  assert.equal(validateTableConfig({ name: '   ', smallBlind: 1, bigBlind: 2 }).ok, false)
  assert.equal(validateTableConfig({ name: 'x'.repeat(61), smallBlind: 1, bigBlind: 2 }).ok, false)
  assert.deepEqual(validateTableConfig({ name: 'n', smallBlind: 0, bigBlind: 2 }), { ok: false, error: 'invalid_blinds' })
  assert.deepEqual(validateTableConfig({ name: 'n', smallBlind: 3, bigBlind: 2 }), { ok: false, error: 'invalid_blinds' }) // bb<sb
  assert.deepEqual(validateTableConfig({ name: 'n', smallBlind: 1, bigBlind: 1.5 }), { ok: false, error: 'invalid_blinds' })
  assert.deepEqual(validateTableConfig({ name: 'n', smallBlind: 1, bigBlind: 2, capacity: 1 }), { ok: false, error: 'invalid_capacity' })
  assert.deepEqual(validateTableConfig({ name: 'n', smallBlind: 1, bigBlind: 2, capacity: 7 }), { ok: false, error: 'invalid_capacity' })
  assert.deepEqual(validateTableConfig({ name: 'n', smallBlind: 1, bigBlind: 2, minBuyInBb: 50, maxBuyInBb: 40 }), { ok: false, error: 'invalid_buyin_bb' })
})

test('TABLE config: capacity 2..6 inclusive all accepted', () => {
  for (let c = 2; c <= 6; c++) {
    assert.equal(validateTableConfig({ name: 'n', smallBlind: 1, bigBlind: 2, capacity: c }).ok, true, `capacity ${c}`)
  }
})

// ── Buy-in bounds (BUY-IN) ─────────────────────────────────────────────────────────────
test('BUY-IN: only [40×BB, 100×BB] integer amounts accepted', () => {
  const BB = 1000
  assert.equal(isBuyInAmountValid(40 * BB, BB), true) // min
  assert.equal(isBuyInAmountValid(100 * BB, BB), true) // max
  assert.equal(isBuyInAmountValid(40 * BB - 1, BB), false) // below min
  assert.equal(isBuyInAmountValid(100 * BB + 1, BB), false) // above max
  assert.equal(isBuyInAmountValid(50_000.5, BB), false) // non-integer
  assert.equal(isBuyInAmountValid(0, BB), false)
})

// ── Top-up cap (TOP-UP) ────────────────────────────────────────────────────────────────
test('TOP-UP: cannot push stack + pending + amount above 100×BB', () => {
  const BB = 1000 // cap = 100_000
  assert.equal(isTopUpAllowed(20_000, 50_000, 0, BB), true) // → 70_000 ok
  assert.equal(isTopUpAllowed(50_000, 50_000, 0, BB), true) // → exactly cap
  assert.equal(isTopUpAllowed(50_001, 50_000, 0, BB), false) // → over cap
  assert.equal(isTopUpAllowed(10_000, 50_000, 45_000, BB), false) // pending counts toward cap
  assert.equal(isTopUpAllowed(0, 50_000, 0, BB), false) // non-positive
})

// ── Seat FSM (SEAT lifecycle) ──────────────────────────────────────────────────────────
test('SEAT FSM: only documented transitions are legal', () => {
  assert.equal(canSeatTransition('empty', 'reserved'), true)
  assert.equal(canSeatTransition('empty', 'sitting_in'), true)
  assert.equal(canSeatTransition('reserved', 'sitting_in'), true)
  assert.equal(canSeatTransition('reserved', 'empty'), true)
  assert.equal(canSeatTransition('sitting_in', 'sitting_out'), true)
  assert.equal(canSeatTransition('sitting_out', 'sitting_in'), true)
  assert.equal(canSeatTransition('sitting_in', 'leaving'), true)
  assert.equal(canSeatTransition('leaving', 'empty'), true)
  assert.equal(canSeatTransition('sitting_in', 'busted'), true)
  assert.equal(canSeatTransition('busted', 'sitting_in'), true) // rebuy
  // Illegal jumps:
  assert.equal(canSeatTransition('empty', 'busted'), false)
  assert.equal(canSeatTransition('busted', 'sitting_out'), false)
  assert.equal(canSeatTransition('leaving', 'sitting_in'), false)
  assert.equal(canSeatTransition('reserved', 'busted'), false)
})

test('SEAT FSM: every status has an exit path (no dead seat) and never self-loops', () => {
  for (const [from, tos] of Object.entries(SEAT_TRANSITIONS)) {
    assert.ok(tos.length > 0 || from === 'empty', `${from} has no exit`)
    assert.equal(tos.includes(from as never), false, `${from} self-loops`)
  }
})

// ── Reservation expiry ─────────────────────────────────────────────────────────────────
test('RESERVATION: expired once the hold elapses; null hold is treated as expired', () => {
  const now = 1_000_000
  assert.equal(isReservationExpired(now + 1, now), false)
  assert.equal(isReservationExpired(now, now), true)
  assert.equal(isReservationExpired(now - 1, now), true)
  assert.equal(isReservationExpired(null, now), true)
  assert.equal(POKER_RESERVATION_TTL_SECONDS, 30)
})

// ── Lobby projection (LOBBY) ───────────────────────────────────────────────────────────
const baseRaw: LobbyTableRaw = {
  id: 't1',
  name: 'Public Table',
  isPrivate: false,
  smallBlind: 500,
  bigBlind: 1000,
  minBuyInBb: 40,
  maxBuyInBb: 100,
  capacity: 6,
  occupiedSeats: 2,
  status: 'open',
  allowSpectators: true,
  createdAt: 111,
  lastActivityAt: 222,
}

test('LOBBY: projection exposes authoritative fields, computes coin bounds + joinability, no secret field', () => {
  const t = projectLobbyTable(baseRaw)
  assert.equal(t.tableId, 't1')
  assert.equal(t.minBuyIn, 40_000)
  assert.equal(t.maxBuyIn, 100_000)
  assert.equal(t.occupiedSeats, 2)
  assert.equal(t.capacity, 6)
  assert.equal(t.joinable, true)
  assert.equal(t.spectatable, true)
  // No password / secret key ever present on the projection.
  assert.equal(Object.keys(t).some((k) => /pass|secret|hash/i.test(k)), false)
})

test('LOBBY: joinability is open AND has a free seat', () => {
  assert.equal(isTableJoinable('open', 5, 6), true)
  assert.equal(isTableJoinable('open', 6, 6), false) // full
  assert.equal(isTableJoinable('closing', 0, 6), false)
  assert.equal(isTableJoinable('closed', 0, 6), false)
  assert.equal(projectLobbyTable({ ...baseRaw, occupiedSeats: 6 }).joinable, false)
  assert.equal(projectLobbyTable({ ...baseRaw, status: 'closing' }).joinable, false)
})

test('LOBBY: spectatable is false when spectators disabled or table closed', () => {
  assert.equal(projectLobbyTable({ ...baseRaw, allowSpectators: false }).spectatable, false)
  assert.equal(projectLobbyTable({ ...baseRaw, status: 'closed' }).spectatable, false)
})

// ── Table reap / safe closure ──────────────────────────────────────────────────────────
test('TABLE closure: only empty, hand-free, idle tables are reapable', () => {
  const now = 10_000_000
  const ttl = 600
  assert.equal(isTableReapable(0, false, now - 601_000, now, ttl), true) // idle past TTL
  assert.equal(isTableReapable(0, false, now - 599_000, now, ttl), false) // not idle long enough
  assert.equal(isTableReapable(1, false, now - 10_000_000, now, ttl), false) // still occupied
  assert.equal(isTableReapable(0, true, now - 10_000_000, now, ttl), false) // live hand → never abrupt close
})
