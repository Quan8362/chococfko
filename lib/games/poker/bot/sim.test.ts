import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runBotSimulation, BOT_SIM_PROFILES, type BotSimConfig } from './sim.ts'

const small: BotSimConfig = {
  seatCount: 6,
  startingStack: 20000,
  bigBlind: 100,
  hands: 300,
  difficulties: 'simulation',
}

test('coin conservation holds exactly across a full simulation', () => {
  const r = runBotSimulation(small, 42)
  assert.equal(r.conserved, true)
  assert.equal(r.defects.length, 0)
  // Final supply must equal the initial supply plus every injected rebuy chip.
  const finalSupply = r.finalStacks.reduce((s, x) => s + x.stack, 0)
  assert.equal(finalSupply, r.totalChips + r.injectedChips)
})

test('the engine cross-check finds no defects over a large synthetic run', () => {
  // Larger run to exercise rare states (side pots, multiway all-ins).
  const r = runBotSimulation({ ...small, hands: 1500 }, 7)
  assert.equal(r.defects.length, 0, `defects: ${JSON.stringify(r.defects.slice(0, 3))}`)
  assert.equal(r.conserved, true)
  assert.ok(r.sidePotHands > 0, 'expected some side-pot hands in a large run')
  assert.ok(r.allInHands > 0, 'expected some all-in hands')
})

test('seeded replay: same config + seed ⇒ bit-for-bit identical report', () => {
  const a = runBotSimulation(small, 12345)
  const b = runBotSimulation(small, 12345)
  assert.deepEqual(a, b)
})

test('different seeds ⇒ different trajectories', () => {
  const a = runBotSimulation(small, 1)
  const b = runBotSimulation(small, 2)
  assert.notDeepEqual(a.finalStacks, b.finalStacks)
})

test('string seeds are supported and deterministic', () => {
  const a = runBotSimulation(small, 'chococfko')
  const b = runBotSimulation(small, 'chococfko')
  assert.deepEqual(a, b)
})

test('skill policies never need a forced fallback (they always act legally)', () => {
  const r = runBotSimulation(
    { seatCount: 4, startingStack: 20000, bigBlind: 100, hands: 180, difficulties: ['hard', 'normal', 'easy', 'normal'] },
    99,
  )
  assert.equal(r.fallbacks, 0, 'a skill policy proposed an illegal/throwing action')
  assert.equal(r.defects.length, 0)
})

test('every built-in profile conserves coins and is defect-free (short run)', () => {
  for (const [name, profile] of Object.entries(BOT_SIM_PROFILES)) {
    const r = runBotSimulation({ ...profile, hands: 200 }, 3)
    assert.equal(r.conserved, true, `${name} did not conserve`)
    assert.equal(r.defects.length, 0, `${name} had defects`)
  }
})

test('no-rebuy mode terminates safely when a table runs out of funded seats', () => {
  const r = runBotSimulation({ seatCount: 2, startingStack: 3000, bigBlind: 100, hands: 5000, difficulties: 'simulation', rebuy: false }, 1)
  assert.equal(r.conserved, true)
  assert.equal(r.injectedChips, 0)
  assert.ok(r.handsPlayed <= 5000)
  // With no rebuys the session must stop rather than deal an impossible hand.
  assert.ok(r.terminatedEarly || r.handsPlayed === 5000)
})

test('difficulties length mismatch is rejected', () => {
  assert.throws(() =>
    runBotSimulation({ seatCount: 6, startingStack: 20000, bigBlind: 100, hands: 10, difficulties: ['easy', 'normal'] }, 1),
  )
})
