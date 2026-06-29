// Voluntary-exit forfeit — proves the quit penalty reuses the SAME official đếm-lá
// formula as a normal round-end loss, and that excluding a forfeited seat keeps the
// remaining players' settlement zero-sum (the sink model used by leaveTable).
// Run with:  node --test lib/games/tlmn/forfeit.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseHand, settleRound, loserHandPayment, DEFAULT_RULES,
  type Card, type SettlementState,
} from './engine.ts'

const RULES = DEFAULT_RULES

function sum(rec: Record<number, number>): number {
  return Object.values(rec).reduce((a, b) => a + b, 0)
}

// The amount a single loser pays in a 2-seat round (winner went out, loser holds `hand`).
// This is the authoritative end-of-round figure we compare the forfeit formula against.
function roundEndLoserPayment(hand: Card[], playedCount: number): number {
  const state: SettlementState = {
    seats: [0, 1],
    winner: 0,
    hands: { 0: [], 1: hand },
    playedCount: { 0: 13, 1: playedCount },
  }
  const delta = settleRound(state, RULES)
  assert.equal(sum(delta), 0, 'round settlement must be zero-sum')
  return -delta[1] // what seat 1 (the loser) paid
}

// ── Test #2 — the forfeit formula EQUALS the normal end-of-round formula ──────────────
const CASES: Array<{ name: string; hand: string; played: number }> = [
  { name: 'Case A — full fresh hand (cóng, played 0)', hand: '3S 4S 5S 6S 7D 8C 9H 10S JD QH KS AD 2C', played: 0 },
  { name: 'Case B — one ordinary card', hand: '5D', played: 7 },
  { name: 'Case C — one black 2 (thối heo)', hand: '2S', played: 7 },
  { name: 'Case C2 — one red 2 (thối heo)', hand: '2H', played: 7 },
  { name: 'Case C3 — two 2s (red + black)', hand: '2S 2H', played: 5 },
  { name: 'Case D — held tứ quý (thối bom)', hand: '7S 7C 7D 7H 9S', played: 4 },
  { name: 'Case D2 — held 3 đôi thông (thối bom)', hand: '4S 4C 5S 5C 6S 6C', played: 6 },
  { name: 'Case D3 — tứ quý + a held 2', hand: 'KS KC KD KH 2D', played: 3 },
  { name: 'plain mid-hand, not cóng', hand: '3S 4D 9H', played: 9 },
]

for (const c of CASES) {
  test(`forfeit == round-end loss · ${c.name}`, () => {
    const hand = parseHand(c.hand)
    const playedZero = c.played === 0
    const forfeit = loserHandPayment(hand, playedZero, RULES)
    const roundEnd = roundEndLoserPayment(hand, c.played)
    assert.equal(forfeit, roundEnd, `forfeit ${forfeit} must equal round-end ${roundEnd}`)
    assert.ok(forfeit > 0, 'a held hand always carries a positive penalty')
  })
}

// ── Test #3 — black & red 2s both trigger thối heo (×2 by default) ────────────────────
test('a held 2 doubles the card payment (thối heo), any suit', () => {
  const baseline = loserHandPayment(parseHand('5D'), false, RULES) // 1 card, no 2 → basePerCard
  const withTwo = loserHandPayment(parseHand('2S'), false, RULES)  // 1 card that IS a 2
  assert.equal(withTwo, baseline * RULES.thoiHeoMultiplier)
})

// ── Test #4 — special-combo penalty counted once, not double ──────────────────────────
test('a single held tứ quý adds exactly one thối-bom unit (no double count)', () => {
  const four = parseHand('7S 7C 7D 7H')
  const pay = loserHandPayment(four, false, RULES)
  // 4 cards × basePerCard + 1 × thoiBomPenalty (no held 2 → no thối heo).
  assert.equal(pay, 4 * RULES.basePerCard + 1 * RULES.thoiBomPenalty)
})

// ── Test #19 — excluding a forfeited seat keeps the live settlement balanced ───────────
// 4-seat round; seat 3 "forfeited" (already charged a separate sink). The remaining live
// players (winner + two losers) settle zero-sum among themselves with the winner credited
// exactly the sum the two live losers pay — no coins created or destroyed.
test('excluding a forfeited seat → live settlement is zero-sum & winner-balanced', () => {
  const hands: Record<number, Card[]> = {
    0: [],                       // winner (out)
    1: parseHand('4S 4C'),       // live loser
    2: parseHand('9H 10D 2S'),   // live loser (holds a 2)
    3: parseHand('3S 3C 3D'),    // forfeited — excluded from this settlement
  }
  const played = { 0: 13, 1: 6, 2: 5, 3: 2 }

  const live = [0, 1, 2]
  const delta = settleRound(
    { seats: live, winner: 0, hands: { 0: hands[0], 1: hands[1], 2: hands[2] }, playedCount: played },
    RULES,
  )
  assert.equal(sum(delta), 0, 'live settlement must be zero-sum (no inflation/deflation)')
  const paidByLosers = -(delta[1] + delta[2])
  assert.equal(delta[0], paidByLosers, 'winner is credited exactly what the live losers pay')
  // The forfeited seat is absent from the live settlement entirely.
  assert.equal(delta[3], undefined)
})
