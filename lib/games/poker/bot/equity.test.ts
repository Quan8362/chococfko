import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeRng } from '../../tlmn/ai/seededRandom.ts'
import { estimateEquity, preflopStrength } from './equity.ts'
import type { Card } from '../types.ts'

test('pocket aces crush a single random opponent preflop (~0.85)', () => {
  const eq = estimateEquity(['As', 'Ah'], [], 1, 3000, makeRng(1))
  assert.ok(eq.equity > 0.8 && eq.equity < 0.9, `AA equity out of expected band: ${eq.equity}`)
})

test('72 offsuit is a weak hand heads-up (< 0.4)', () => {
  const eq = estimateEquity(['7c', '2d'], [], 1, 3000, makeRng(2))
  assert.ok(eq.equity < 0.4, `72o equity unexpectedly high: ${eq.equity}`)
})

test('equity is always within [0,1]', () => {
  const hands: [Card, Card][] = [
    ['As', 'Ks'],
    ['9d', '9c'],
    ['2c', '7h'],
  ]
  for (const h of hands) {
    for (let opp = 1; opp <= 4; opp++) {
      const eq = estimateEquity(h, ['Th', '5s', '2d'], opp, 500, makeRng(opp * 7))
      assert.ok(eq.equity >= 0 && eq.equity <= 1, `equity ${eq.equity} out of range`)
    }
  }
})

test('more opponents lowers a strong hand’s equity (harder to hold up)', () => {
  const heads = estimateEquity(['As', 'Ah'], [], 1, 4000, makeRng(10)).equity
  const five = estimateEquity(['As', 'Ah'], [], 5, 4000, makeRng(10)).equity
  assert.ok(five < heads, `expected AA vs 5 (${five}) < vs 1 (${heads})`)
})

test('deterministic: same seed → identical estimate', () => {
  const a = estimateEquity(['Kd', 'Qd'], ['Jd', '4c', '9h'], 2, 800, makeRng(555))
  const b = estimateEquity(['Kd', 'Qd'], ['Jd', '4c', '9h'], 2, 800, makeRng(555))
  assert.deepEqual(a, b)
})

test('zero opponents ⇒ equity 1 by definition', () => {
  const eq = estimateEquity(['2c', '3d'], ['As', 'Kd', 'Qc'], 0, 100, makeRng(1))
  assert.equal(eq.equity, 1)
})

test('preflopStrength orders hands sensibly and stays in [0,1]', () => {
  const aa = preflopStrength(['As', 'Ah'])
  const kk = preflopStrength(['Ks', 'Kh'])
  const ako = preflopStrength(['Ac', 'Kd'])
  const trash = preflopStrength(['7c', '2d'])
  for (const s of [aa, kk, ako, trash]) assert.ok(s >= 0 && s <= 1)
  assert.ok(aa > kk, 'AA should rank above KK')
  assert.ok(kk > ako, 'KK should rank above AKo')
  assert.ok(ako > trash, 'AKo should rank above 72o')
})

test('suited beats its offsuit twin', () => {
  assert.ok(preflopStrength(['Ah', 'Kh']) > preflopStrength(['Ah', 'Kd']))
})
