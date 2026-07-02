import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isSubjectToRathole,
  minReturnBuyIn,
  rejoinsInWindow,
  isRapidRejoinBlocked,
  evaluateRejoin,
  type RejoinContext,
  type SeatDeparture,
} from './ratholing.ts'
import { POKER_ECONOMY_V1 } from './economyConfig.ts'
import type { BuyInBounds } from './economy.ts'

const cfg = POKER_ECONOMY_V1.ratholing
// Medium table: BB 2,000, 40–100 BB → [80,000 , 200,000].
const bounds: BuyInBounds = { min: 80_000, max: 200_000 }
const T0 = 1_000_000_000_000 // fixed base ms

function dep(over: Partial<SeatDeparture> = {}): SeatDeparture {
  return { userId: 'u1', tableId: 'tbl', leftAtMs: T0, stackAtLeaveChips: 150_000, kind: 'stand_up', ...over }
}

function ctx(over: Partial<RejoinContext> = {}): RejoinContext {
  return {
    userId: 'u1',
    tableId: 'tbl',
    nowMs: T0 + 60_000, // 1 min later
    requestedBuyInChips: 80_000,
    walletBalanceChips: 10_000_000,
    buyInBounds: bounds,
    lastDeparture: dep(),
    recentRejoinTimestampsMs: [],
    ...over,
  }
}

test('a deep voluntary stand-up inside the window is subject to rathole', () => {
  assert.equal(isSubjectToRathole(ctx(), cfg), true)
})

test('leaving at/under the table minimum is NOT ratholing', () => {
  assert.equal(isSubjectToRathole(ctx({ lastDeparture: dep({ stackAtLeaveChips: 80_000 }) }), cfg), false)
})

test('a busted departure is NOT ratholing (they legitimately lost the chips)', () => {
  assert.equal(isSubjectToRathole(ctx({ lastDeparture: dep({ kind: 'busted', stackAtLeaveChips: 0 }) }), cfg), false)
})

test('a disconnect is NOT subject to the rathole rule', () => {
  assert.equal(isSubjectToRathole(ctx({ lastDeparture: dep({ kind: 'disconnect' }) }), cfg), false)
})

test('leaving outside the retained-stack window clears the obligation', () => {
  const late = ctx({ nowMs: T0 + (cfg.retainedStackWindowMinutes + 1) * 60_000 })
  assert.equal(isSubjectToRathole(late, cfg), false)
})

test('minReturnBuyIn forces the full retained stack at 100% factor, clamped to table max', () => {
  // Retained 150k, factor 100% → 150k required (within cap).
  assert.equal(minReturnBuyIn(ctx(), cfg), 150_000)
  // Retained huge → clamp to table max 200k.
  assert.equal(minReturnBuyIn(ctx({ lastDeparture: dep({ stackAtLeaveChips: 500_000 }) }), cfg), 200_000)
  // No obligation → table min.
  assert.equal(minReturnBuyIn(ctx({ lastDeparture: undefined }), cfg), 80_000)
})

test('evaluateRejoin denies a rathole attempt with the required minimum', () => {
  const d = evaluateRejoin(ctx({ requestedBuyInChips: 80_000 }), cfg) // deep leaver tries to return short
  assert.equal(d.ok, false)
  assert.equal(d.reason, 'rathole_min_return')
  assert.equal(d.requiredMinBuyInChips, 150_000)
})

test('evaluateRejoin allows returning with the full retained stack', () => {
  const d = evaluateRejoin(ctx({ requestedBuyInChips: 150_000 }), cfg)
  assert.equal(d.ok, true)
  assert.equal(d.reason, 'ok')
})

test('evaluateRejoin rejects above table max', () => {
  const d = evaluateRejoin(ctx({ requestedBuyInChips: 300_000, lastDeparture: undefined }), cfg)
  assert.equal(d.reason, 'above_max_buyin')
})

test('evaluateRejoin rejects below plain minimum when no rathole obligation', () => {
  const d = evaluateRejoin(ctx({ requestedBuyInChips: 50_000, lastDeparture: undefined }), cfg)
  assert.equal(d.reason, 'below_min_buyin')
})

test('evaluateRejoin rejects when wallet cannot fund the request', () => {
  const d = evaluateRejoin(ctx({ requestedBuyInChips: 150_000, walletBalanceChips: 100_000 }), cfg)
  assert.equal(d.reason, 'insufficient_wallet')
})

test('rejoinsInWindow counts only timestamps inside the sliding window', () => {
  const c = ctx({
    recentRejoinTimestampsMs: [
      T0 + 60_000,                                   // inside
      T0 - (cfg.rejoinWindowMinutes - 1) * 60_000,   // inside
      T0 - (cfg.rejoinWindowMinutes + 5) * 60_000,   // outside
    ],
  })
  assert.equal(rejoinsInWindow(c, cfg), 2)
})

test('rapid rejoin is blocked at the cap', () => {
  const stamps = Array.from({ length: cfg.maxRejoinsPerWindow }, (_, i) => T0 + i * 1000)
  assert.equal(isRapidRejoinBlocked(ctx({ recentRejoinTimestampsMs: stamps }), cfg), true)
  const d = evaluateRejoin(ctx({ recentRejoinTimestampsMs: stamps, lastDeparture: undefined }), cfg)
  assert.equal(d.reason, 'rapid_rejoin')
})

test('a technical reconnect within grace is exempt from throttle AND rathole', () => {
  const stamps = Array.from({ length: cfg.maxRejoinsPerWindow }, (_, i) => T0 + i * 1000)
  const c = ctx({
    nowMs: T0 + 30_000, // 30s after a disconnect (grace = 120s)
    lastDeparture: dep({ kind: 'disconnect', stackAtLeaveChips: 150_000 }),
    recentRejoinTimestampsMs: stamps,
    requestedBuyInChips: 80_000, // returning short is fine — it's a resume
  })
  const d = evaluateRejoin(c, cfg)
  assert.equal(d.ok, true)
})
