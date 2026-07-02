import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  POKER_ECONOMY_V1,
  POKER_ECONOMY_VERSIONS,
  ACTIVE_ECONOMY_VERSION,
  getEconomyConfig,
  validateEconomyConfig,
  buyInBoundsForTier,
  findTierById,
  findTierByBlinds,
  isSupportedBlindTier,
  recommendTierForBalance,
  type PokerEconomyConfig,
} from './economyConfig.ts'
import { SIGNUP_GRANT, DAILY_GRANT, ENTRY_MIN_BALANCE } from '../../game/economy.ts'

test('v1 config validates', () => {
  assert.deepEqual(validateEconomyConfig(POKER_ECONOMY_V1), { ok: true })
})

test('v1 reuses the shared wallet faucet constants (no drift)', () => {
  assert.equal(POKER_ECONOMY_V1.faucet.startingCoins, SIGNUP_GRANT)
  assert.equal(POKER_ECONOMY_V1.faucet.dailyRecoveryCoins, DAILY_GRANT)
  assert.equal(POKER_ECONOMY_V1.faucet.recoveryEligibilityBalance, ENTRY_MIN_BALANCE)
})

test('getEconomyConfig resolves the active version and rejects unknown', () => {
  assert.equal(getEconomyConfig().version, ACTIVE_ECONOMY_VERSION)
  assert.equal(getEconomyConfig('v1'), POKER_ECONOMY_V1)
  assert.throws(() => getEconomyConfig('v999'), /unknown config version/)
})

test('every published version validates (registry stays clean)', () => {
  for (const c of POKER_ECONOMY_VERSIONS) {
    assert.deepEqual(validateEconomyConfig(c), { ok: true }, `version ${c.version} should validate`)
  }
})

test('all v1 tiers use SB = BB/2 and ascending blinds', () => {
  let prevBb = 0
  for (const t of POKER_ECONOMY_V1.blindTiers) {
    assert.equal(t.smallBlind * 2, t.bigBlind, `${t.id} SB*2 must equal BB`)
    assert.ok(t.bigBlind > prevBb, `${t.id} blinds must ascend`)
    prevBb = t.bigBlind
  }
})

test('buyInBoundsForTier applies the 40–100 BB rule', () => {
  const micro = findTierById(POKER_ECONOMY_V1, 'micro')!
  const b = buyInBoundsForTier(micro)
  assert.equal(b.min, 40 * 100) // 4,000
  assert.equal(b.max, 100 * 100) // 10,000
})

test('a fresh wallet buys ~100 max buy-ins at micro (beginner cannot bust in one session)', () => {
  const micro = findTierById(POKER_ECONOMY_V1, 'micro')!
  const maxBuyIn = buyInBoundsForTier(micro).max
  assert.equal(Math.floor(SIGNUP_GRANT / maxBuyIn), 100)
})

test('findTierByBlinds / isSupportedBlindTier', () => {
  assert.equal(findTierByBlinds(POKER_ECONOMY_V1, 1_000, 2_000)?.id, 'medium')
  assert.equal(isSupportedBlindTier(POKER_ECONOMY_V1, 1_000, 2_000), true)
  assert.equal(isSupportedBlindTier(POKER_ECONOMY_V1, 3, 7), false)
})

test('recommendTierForBalance steers wallets to an appropriate tier', () => {
  assert.equal(recommendTierForBalance(POKER_ECONOMY_V1, 50_000)?.id, 'micro')
  assert.equal(recommendTierForBalance(POKER_ECONOMY_V1, 800_000)?.id, 'medium')
  assert.equal(recommendTierForBalance(POKER_ECONOMY_V1, 100_000_000)?.id, 'whale')
  // Below the cheapest min buy-in → no tier.
  assert.equal(recommendTierForBalance(POKER_ECONOMY_V1, 100), undefined)
})

// ── Validation rejects broken configs (used for admin preview + rollback safety) ────────

function clone(): PokerEconomyConfig {
  return JSON.parse(JSON.stringify(POKER_ECONOMY_V1))
}

test('rejects non-SB/BB blinds', () => {
  const c = clone()
  ;(c.blindTiers as unknown as { smallBlind: number; bigBlind: number }[])[0].bigBlind = 150 // 50*2 != 150
  const r = validateEconomyConfig(c)
  assert.equal(r.ok, false)
  assert.ok(!r.ok && r.errors.includes('tier_bad_blinds'))
})

test('rejects duplicate tier ids', () => {
  const c = clone()
  ;(c.blindTiers as unknown as { id: string }[])[1].id = 'micro'
  const r = validateEconomyConfig(c)
  assert.ok(!r.ok && r.errors.includes('duplicate_tier_id'))
})

test('rejects fractional faucet amounts (integer-only law)', () => {
  const c = clone()
  ;(c.faucet as unknown as { startingCoins: number }).startingCoins = 1_000_000.5
  const r = validateEconomyConfig(c)
  assert.ok(!r.ok && r.errors.includes('bad_faucet'))
})

test('rejects a ratholing return factor above 100%', () => {
  const c = clone()
  ;(c.ratholing as unknown as { minReturnStackFactorPct: number }).minReturnStackFactorPct = 150
  const r = validateEconomyConfig(c)
  assert.ok(!r.ok && r.errors.includes('bad_ratholing'))
})

test('rollback target (a prior version) must itself validate', () => {
  // Simulate a v2 then rollback to v1: both must validate to be safe to activate.
  const v2: PokerEconomyConfig = { ...clone(), version: 'v2', effectiveFrom: '2026-08-01' }
  assert.deepEqual(validateEconomyConfig(v2), { ok: true })
  assert.deepEqual(validateEconomyConfig(getEconomyConfig('v1')), { ok: true })
})
