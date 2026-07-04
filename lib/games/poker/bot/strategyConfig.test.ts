import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  STRATEGY_VERSION,
  DIFFICULTY_STRATEGY,
  strategyFor,
  POSITION_CLASSES,
  PERSONALITIES,
  DEFAULT_PERSONALITY,
  PERSONALITY_BOUNDS,
  type PositionClass,
} from './strategyConfig.ts'

test('strategy config is versioned', () => {
  assert.ok(typeof STRATEGY_VERSION === 'string' && STRATEGY_VERSION.length > 0)
})

test('exactly the three skill difficulties are configured (simulation is not tunable)', () => {
  assert.deepEqual(Object.keys(DIFFICULTY_STRATEGY).sort(), ['easy', 'hard', 'normal'])
})

test('every position has an open + defend threshold for each difficulty', () => {
  for (const d of ['easy', 'normal', 'hard'] as const) {
    const cfg = strategyFor(d)
    for (const pos of POSITION_CLASSES) {
      assert.ok(pos in cfg.preflop.open, `${d} missing open[${pos}]`)
      assert.ok(pos in cfg.preflop.vsRaiseCall, `${d} missing vsRaiseCall[${pos}]`)
      for (const v of [cfg.preflop.open[pos], cfg.preflop.vsRaiseCall[pos]]) {
        assert.ok(v >= 0 && v <= 1, `${d} threshold out of [0,1]`)
      }
    }
  }
})

test('ranges are position-monotone: late seats open at least as wide as early seats', () => {
  const wideOrder: PositionClass[] = ['ep', 'mp', 'co', 'btn']
  for (const d of ['normal', 'hard'] as const) {
    const open = strategyFor(d).preflop.open
    for (let i = 1; i < wideOrder.length; i++) {
      assert.ok(
        open[wideOrder[i]] <= open[wideOrder[i - 1]] + 1e-9,
        `${d}: ${wideOrder[i]} (${open[wideOrder[i]]}) should open >= wide vs ${wideOrder[i - 1]} (${open[wideOrder[i - 1]]})`,
      )
    }
  }
})

test('difficulty capabilities encode the intended bounded weaknesses', () => {
  const easy = strategyFor('easy').capabilities
  const normal = strategyFor('normal').capabilities
  const hard = strategyFor('hard').capabilities
  // Easy: no 3-betting, no bluffing, no position, no sizing mix, no action reads.
  assert.equal(easy.threeBets, false)
  assert.equal(easy.bluffs, false)
  assert.equal(easy.usesPosition, false)
  assert.equal(easy.mixesSizing, false)
  // Normal: capable but not action-reading; Hard: the full set.
  assert.equal(normal.threeBets, true)
  assert.equal(normal.readsAction, false)
  assert.equal(hard.readsAction, true)
  assert.equal(hard.semiBluffs, true)
})

test('equity sample budgets increase with difficulty (hard thinks hardest)', () => {
  const e = strategyFor('easy').equitySamples.postflop
  const n = strategyFor('normal').equitySamples.postflop
  const h = strategyFor('hard').equitySamples.postflop
  assert.ok(e < n && n < h, `expected easy(${e}) < normal(${n}) < hard(${h})`)
})

test('personalities: balanced is neutral and all shifts stay within safety bounds', () => {
  assert.equal(DEFAULT_PERSONALITY.id, 'balanced')
  assert.equal(DEFAULT_PERSONALITY.enterShift, 0)
  assert.equal(DEFAULT_PERSONALITY.aggressionShift, 0)
  assert.equal(DEFAULT_PERSONALITY.bluffMult, 1)
  assert.equal(DEFAULT_PERSONALITY.sizingBias, 0)

  for (const p of Object.values(PERSONALITIES)) {
    assert.ok(Math.abs(p.enterShift) <= PERSONALITY_BOUNDS.maxEnterShift, `${p.id} enterShift out of bounds`)
    assert.ok(Math.abs(p.aggressionShift) <= PERSONALITY_BOUNDS.maxAggressionShift, `${p.id} aggressionShift out of bounds`)
    assert.ok(p.bluffMult >= 0 && p.bluffMult <= PERSONALITY_BOUNDS.maxBluffMult, `${p.id} bluffMult out of bounds`)
    assert.ok(Math.abs(p.sizingBias) <= PERSONALITY_BOUNDS.maxSizingBias, `${p.id} sizingBias out of bounds`)
  }
})
