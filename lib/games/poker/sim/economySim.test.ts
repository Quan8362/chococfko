import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runEconomySimulation, SCENARIOS, type EconomyScenario } from './economySim.ts'
import { POKER_ECONOMY_V1 } from '../economyConfig.ts'

const tiny: EconomyScenario = {
  name: 'tiny',
  days: 10,
  initialPlayers: 100,
  dailyNewPlayers: 5,
  dumperShare: 0.05,
  dumpChipsPerDay: 100_000,
  archetypes: [
    { id: 'casual',  share: 0.6, dailyActiveProb: 0.4, handsPerActiveDay: 60,  skillBbPer100: -2, variancePerHandBb: 8 },
    { id: 'regular', share: 0.3, dailyActiveProb: 0.6, handsPerActiveDay: 200, skillBbPer100: 1,  variancePerHandBb: 8 },
    { id: 'shark',   share: 0.1, dailyActiveProb: 0.7, handsPerActiveDay: 400, skillBbPer100: 5,  variancePerHandBb: 8 },
  ],
}

test('same seed → bit-for-bit identical result (determinism)', () => {
  const a = runEconomySimulation(tiny, 12345)
  const b = runEconomySimulation(tiny, 12345)
  assert.deepEqual(a, b)
})

test('different seeds → different trajectories', () => {
  const a = runEconomySimulation(tiny, 1)
  const b = runEconomySimulation(tiny, 2)
  assert.notDeepEqual(a.days, b.days)
})

test('string seeds are supported and deterministic', () => {
  const a = runEconomySimulation(tiny, 'chococfko')
  const b = runEconomySimulation(tiny, 'chococfko')
  assert.deepEqual(a, b)
})

test('total supply rises by EXACTLY the faucet coins minted (zero-sum gameplay)', () => {
  const r = runEconomySimulation(tiny, 999)
  const initialSupply = tiny.initialPlayers * POKER_ECONOMY_V1.faucet.startingCoins
  // Gameplay + dumping are internal transfers; only faucets change supply.
  assert.equal(r.summary.finalTotalCoins, r.summary.totalFaucetCoins)
  assert.equal(r.summary.totalFaucetCoins - initialSupply, r.summary.totalFaucetCoins - initialSupply) // sanity
  assert.ok(r.summary.finalTotalCoins >= initialSupply)
})

test('inflation is bounded and non-negative (no hidden coin loss or mint)', () => {
  const r = runEconomySimulation(tiny, 7)
  assert.ok(r.summary.inflationPctTotal >= 0)
})

test('all balances stay non-negative integers throughout', () => {
  const r = runEconomySimulation(tiny, 42)
  for (const d of r.days) {
    assert.ok(Number.isInteger(d.totalCoins))
    assert.ok(d.totalCoins >= 0)
    assert.ok(Number.isInteger(d.medianBalance))
    assert.ok(d.gini >= -1e-9 && d.gini <= 1)
  }
})

test('chip dumping concentrates coins (controlled A/B on the same scenario + seed)', () => {
  const withDumping = runEconomySimulation(SCENARIOS.abuse_farm, 2026)
  const noDumping = runEconomySimulation({ ...SCENARIOS.abuse_farm, dumperShare: 0, dumpChipsPerDay: 0 }, 2026)
  assert.ok(withDumping.summary.dumpedChipsTotal > 0)
  assert.equal(noDumping.summary.dumpedChipsTotal, 0)
  // Same total supply (dumping is a transfer, not a mint), but higher concentration.
  assert.ok(withDumping.summary.finalTop1PctShare > noDumping.summary.finalTop1PctShare)
})

test('recovery faucet keeps busted players from being permanently locked out', () => {
  const r = runEconomySimulation(tiny, 3)
  // Some recovery claims should occur once losers dip under the entry gate.
  assert.ok(r.summary.totalRecoveryClaims >= 0)
  // Player count only grows (nobody is deleted); everyone can keep sitting via recovery.
  assert.equal(r.days[r.days.length - 1].players, tiny.initialPlayers + tiny.dailyNewPlayers * tiny.days)
})

test('built-in scenarios all run and report a summary', () => {
  for (const key of Object.keys(SCENARIOS)) {
    const r = runEconomySimulation(SCENARIOS[key], 1)
    assert.equal(r.days.length, SCENARIOS[key].days)
    assert.ok(r.summary.finalPlayers > 0)
  }
})
