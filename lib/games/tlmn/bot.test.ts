// Tests for the pure BOT AI (bot.ts). Proves the bot ALWAYS returns a legal move,
// shapes its leading/following choices as documented, conserves 2s/bombs early, and
// spends them near the endgame. Run with:  node --test lib/games/tlmn/bot.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseHand, parseCard, DEFAULT_RULES, createDeck, shuffle, beats, parseCombo,
  type Card,
} from './engine.ts'
import { dealRound, applyPlay, applyPass, type RoundState } from './round.ts'
import { chooseBotMove } from './bot.ts'

const RULES = DEFAULT_RULES

function buildState(handsStr: Record<number, string>, over: Partial<RoundState> = {}): RoundState {
  const seats = Object.keys(handsStr).map(Number).sort((a, b) => a - b)
  const hands: Record<number, Card[]> = {}
  const playedCount: Record<number, number> = {}
  for (const s of seats) { hands[s] = parseHand(handsStr[s]); playedCount[s] = 5 }
  return {
    seats, roundNo: 2, rules: RULES, hands, turnSeat: seats[0],
    trick: null, passed: [], playedCount, cutEvents: [],
    mustIncludeThreeSpade: false, status: 'playing', winner: null,
    instantWin: null, deltas: null, ...over,
  }
}

// ── Legality (the hard guarantee) ───────────────────────────────────────────────
test('bot leading always returns a legal, held combo', () => {
  const st = buildState(
    { 0: '3S 5D 7C 2H QH QS', 1: '4S 4D 4C', 2: '6S 6D 6C' },
    { turnSeat: 0 },
  )
  const move = chooseBotMove(st, 0)
  assert.equal(move.type, 'play')
  if (move.type === 'play') {
    const combo = parseCombo(move.cards)
    assert.ok(combo, 'is a valid combo')
    assert.ok(beats(combo!, null, RULES))
  }
})

test('bot never makes an illegal move across a full randomized self-play round', () => {
  for (let trial = 0; trial < 40; trial++) {
    const deck = shuffle(createDeck(), mulberry32(trial + 1))
    let st = dealRound({ seats: [0, 1, 2, 3], roundNo: 2, rules: RULES, deck, previousWinner: 0 })
    let guard = 0
    while (st.status === 'playing' && guard++ < 400) {
      const seat = st.turnSeat
      const before = st.hands[seat].length
      const move = chooseBotMove(st, seat)
      if (move.type === 'pass') {
        const res = applyPass(st, seat)
        assert.ok(res.ok, `pass legal (trial ${trial})`)
        st = res.state
      } else {
        // The chosen cards must beat the table per the engine.
        const table = st.trick ? parseCombo(st.trick.cards) : null
        const combo = parseCombo(move.cards)
        assert.ok(combo && beats(combo, table, RULES), `play beats table (trial ${trial})`)
        const res = applyPlay(st, seat, move.cards)
        assert.ok(res.ok, `play accepted by engine (trial ${trial}): ${(res as { error?: string }).error}`)
        st = res.state
        assert.ok(st.hands[seat] !== undefined)
        assert.ok(before > 0)
      }
    }
    assert.equal(st.status, 'ended', `round terminates (trial ${trial})`)
  }
})

// ── Leading strategy ─────────────────────────────────────────────────────────────
test('bot leading sheds a low single and keeps 2s/bombs in reserve', () => {
  const st = buildState(
    { 0: '3S 4D 9C 2H 2S', 1: '5S 5D 5C', 2: '6S 6D 6C' },
    { turnSeat: 0 },
  )
  const move = chooseBotMove(st, 0)
  assert.equal(move.type, 'play')
  if (move.type === 'play') {
    // Lowest single (3♠), not a 2.
    assert.deepEqual(move.cards, [parseCard('3S')])
  }
})

test('bot forced to lead with only 2s plays a 2', () => {
  const st = buildState({ 0: '2S 2D', 1: '5S 5D 5C', 2: '6S 6D 6C' }, { turnSeat: 0 })
  const move = chooseBotMove(st, 0)
  assert.equal(move.type, 'play')
  if (move.type === 'play') assert.ok(move.cards.every(c => c.rank === 12))
})

// ── Following strategy ───────────────────────────────────────────────────────────
test('bot following plays the lowest beating single, not a high one', () => {
  const st = buildState(
    { 0: '5D 8C KH 2S', 1: '6S 6D', 2: '7S 7D' },
    { turnSeat: 0, trick: { cards: [parseCard('4S')], bySeat: 1 } },
  )
  const move = chooseBotMove(st, 0)
  assert.equal(move.type, 'play')
  if (move.type === 'play') assert.deepEqual(move.cards, [parseCard('5D')])
})

test('bot passes rather than burn a 2 early when only a 2 beats the table', () => {
  // Plenty of cards left for everyone → not the endgame.
  const st = buildState(
    { 0: '2S 3D 4C 5H 6S 7D', 1: '8S 8D 8C 9H 9S 9D', 2: 'TS TD TC JH JS JD' },
    { turnSeat: 0, trick: { cards: [parseCard('KH')], bySeat: 1 } },
  )
  const move = chooseBotMove(st, 0)
  assert.equal(move.type, 'pass')
})

test('bot spends a 2 to deny an opponent on their last card', () => {
  const st = buildState(
    { 0: '2S 4D 6C', 1: 'AS', 2: '7S 7D' }, // seat 1 is one card from going out
    { turnSeat: 0, trick: { cards: [parseCard('KH')], bySeat: 1 } },
  )
  const move = chooseBotMove(st, 0)
  assert.equal(move.type, 'play')
  if (move.type === 'play') assert.deepEqual(move.cards, [parseCard('2S')])
})

test('bot goes out when a move empties its hand', () => {
  const st = buildState(
    { 0: '2S', 1: '5S 5D', 2: '7S 7D' }, // seat 0's only card — going out beats conserving
    { turnSeat: 0, trick: { cards: [parseCard('KH')], bySeat: 1 } },
  )
  const move = chooseBotMove(st, 0)
  assert.equal(move.type, 'play')
  if (move.type === 'play') assert.deepEqual(move.cards, [parseCard('2S')])
})

// Tiny deterministic RNG for reproducible shuffles.
function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
