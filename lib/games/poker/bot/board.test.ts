import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Card } from '../types.ts'
import { HandCategory } from '../evaluator.ts'
import { classifyBoard, classifyHand } from './board.ts'

const B = (...cs: string[]) => cs as Card[]
const H = (a: string, b: string): [Card, Card] => [a as Card, b as Card]

test('board texture: rainbow / monotone / two-tone / paired', () => {
  const rainbow = classifyBoard(B('As', 'Kd', 'Qc'))
  assert.equal(rainbow.rainbow, true)
  assert.equal(rainbow.monotone, false)
  assert.equal(rainbow.twoTone, false)
  assert.equal(rainbow.paired, false)

  const mono = classifyBoard(B('As', 'Ks', 'Qs'))
  assert.equal(mono.monotone, true)
  assert.equal(mono.rainbow, false)

  const twoTone = classifyBoard(B('As', 'Ks', 'Qd'))
  assert.equal(twoTone.twoTone, true)
  assert.equal(twoTone.monotone, false)

  const paired = classifyBoard(B('As', 'Ad', 'Qc'))
  assert.equal(paired.paired, true)
})

test('board texture: connectedness + wetness ordering', () => {
  const wet = classifyBoard(B('9h', '8h', '7h')) // monotone + connected → very wet
  const dry = classifyBoard(B('Kd', '8c', '2s')) // rainbow + disconnected → dry
  assert.equal(wet.connected, true)
  assert.equal(dry.connected, false)
  assert.ok(wet.wetness > dry.wetness, `wet ${wet.wetness} should exceed dry ${dry.wetness}`)
  assert.ok(wet.wetness >= 0 && wet.wetness <= 1 && dry.wetness >= 0 && dry.wetness <= 1)
})

test('hand class: flush draw detected (four to a suit, board < 5)', () => {
  const hc = classifyHand(H('Ah', 'Kh'), B('Qh', '2h', '7c'))
  assert.equal(hc.flushDraw, true)
})

test('hand class: made flush is NOT a draw', () => {
  const hc = classifyHand(H('Ah', 'Kh'), B('Qh', '2h', '7h'))
  assert.equal(hc.flushDraw, false)
  assert.equal(hc.category, HandCategory.Flush)
})

test('hand class: open-ended vs gutshot straight draws', () => {
  const oesd = classifyHand(H('9c', '8d'), B('7h', '6s', '2c'))
  assert.equal(oesd.openEnded, true)
  assert.equal(oesd.gutshot, false)

  const gut = classifyHand(H('9c', '5d'), B('7h', '6s', '2c'))
  assert.equal(gut.gutshot, true)
  assert.equal(gut.openEnded, false)
})

test('hand class: made straight is not a draw', () => {
  const hc = classifyHand(H('9c', '8d'), B('7h', '6s', '5c'))
  assert.equal(hc.category, HandCategory.Straight)
  assert.equal(hc.openEnded, false)
  assert.equal(hc.gutshot, false)
})

test('hand class: top pair / set / overcards / air tiers', () => {
  const topPair = classifyHand(H('Ah', '2d'), B('As', 'Kd', 'Qc'))
  assert.equal(topPair.pairKind, 'top')
  assert.equal(topPair.topPairOrBetter, true)
  assert.equal(topPair.madeTier, 'medium')

  const set = classifyHand(H('Kc', 'Kd'), B('Ks', '7h', '2c'))
  assert.equal(set.category, HandCategory.ThreeOfAKind)
  assert.equal(set.madeTier, 'strong')

  const overcards = classifyHand(H('Ah', 'Kd'), B('Qc', '7h', '2s'))
  assert.equal(overcards.madeTier, 'air')
  assert.equal(overcards.overcards, 2)

  const air = classifyHand(H('2c', '7d'), B('As', 'Kd', 'Qh'))
  assert.equal(air.madeTier, 'air')
  assert.equal(air.overcards, 0)
  assert.equal(air.drawStrength, 0)
})

test('hand class: overpair vs underpair', () => {
  const over = classifyHand(H('Ac', 'Ad'), B('Kh', '7s', '2c'))
  assert.equal(over.pairKind, 'overpair')
  assert.equal(over.madeTier, 'medium')

  const under = classifyHand(H('5c', '5d'), B('Kh', '9s', '7c')) // pocket pair below every board card
  assert.equal(under.pairKind, 'bottom')
  assert.equal(under.madeTier, 'weak')
})

test('classifyHand rejects a pre-flop (sub-3-card) board', () => {
  assert.throws(() => classifyHand(H('As', 'Ks'), B()))
  assert.throws(() => classifyHand(H('As', 'Ks'), B('Ah', 'Kd')))
})
