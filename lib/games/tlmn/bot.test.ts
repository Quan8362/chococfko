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
import { chooseBotMove, botMoveAudit } from './bot.ts'

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

// ── Multi-card leading (the regression: bot was leading ONLY singles) ─────────────
// Each helper plays the chosen lead through the engine to prove the WHOLE move (all
// cards) flows: generated == selected == submitted == validated == removed.
function leadCombo(handStr: string): { type: string; cards: Card[] } {
  const st = buildState({ 0: handStr, 1: 'KC AC', 2: 'KD AD' }, { turnSeat: 0 })
  const move = chooseBotMove(st, 0)
  assert.equal(move.type, 'play', 'bot leads a play')
  const cards = move.type === 'play' ? move.cards : []
  const combo = parseCombo(cards)
  assert.ok(combo, 'lead is a valid combo')
  // The full move must pass the SAME engine validation a human goes through, and
  // remove exactly that many cards from the hand.
  const before = st.hands[0].length
  const res = applyPlay(st, 0, cards)
  assert.ok(res.ok, 'engine accepts the bot lead')
  if (res.ok) assert.equal(res.state.hands[0].length, before - cards.length, 'removes every played card')
  return { type: combo!.type, cards }
}

test('bot LEADS a pair (3♣3♦ over loose singles)', () => {
  const { type, cards } = leadCombo('3C 3D 6C 9H')
  assert.equal(type, 'pair')
  assert.equal(cards.length, 2)
})

test('bot LEADS a triple (5♣5♦5♥)', () => {
  const { type, cards } = leadCombo('5C 5D 5H 8S')
  assert.equal(type, 'triple')
  assert.equal(cards.length, 3)
})

test('bot LEADS a straight / sảnh (4-5-6)', () => {
  const { type, cards } = leadCombo('4C 5D 6S 9H')
  assert.equal(type, 'straight')
  assert.equal(cards.length, 3)
})

test('bot PLAYS four of a kind / tứ quý when it empties the hand', () => {
  const st = buildState({ 0: '7C 7D 7H 7S', 1: 'KC AC QS', 2: 'KD AD QH' }, { turnSeat: 0 })
  const move = chooseBotMove(st, 0)
  assert.equal(move.type, 'play')
  if (move.type === 'play') {
    assert.equal(parseCombo(move.cards)!.type, 'four')
    assert.equal(move.cards.length, 4)
    assert.ok(applyPlay(st, 0, move.cards).ok)
  }
})

test('bot PLAYS three consecutive pairs / đôi thông when it empties the hand', () => {
  const st = buildState({ 0: '3C 3D 4C 4D 5C 5D', 1: 'KC AC QS', 2: 'KD AD QH' }, { turnSeat: 0 })
  const move = chooseBotMove(st, 0)
  assert.equal(move.type, 'play')
  if (move.type === 'play') {
    assert.equal(parseCombo(move.cards)!.type, 'pairsRun')
    assert.equal(move.cards.length, 6)
    assert.ok(applyPlay(st, 0, move.cards).ok)
  }
})

test('bot keeps a tứ quý intact while leading (sheds the loose card, not the bomb)', () => {
  // 7777 + a single 10 → leading the lone 10 keeps the bomb; never break the four.
  const st = buildState({ 0: '7C 7D 7H 7S TC', 1: 'KC AC QS', 2: 'KD AD QH' }, { turnSeat: 0 })
  const move = chooseBotMove(st, 0)
  assert.equal(move.type, 'play')
  if (move.type === 'play') assert.deepEqual(move.cards, [parseCard('TC')])
})

// ── Multi-card responses ──────────────────────────────────────────────────────────
test('bot responds to a pair with a higher pair', () => {
  const st = buildState(
    { 0: '6S 6D 9C', 1: '4S 4D', 2: 'KD AD' },
    { turnSeat: 0, trick: { cards: [parseCard('4C'), parseCard('4H')], bySeat: 1 } },
  )
  const move = chooseBotMove(st, 0)
  assert.equal(move.type, 'play')
  if (move.type === 'play') {
    assert.equal(parseCombo(move.cards)!.type, 'pair')
    assert.deepEqual(move.cards.map(c => c.rank), [3, 3]) // rank index 3 == "6"
    assert.ok(applyPlay(st, 0, move.cards).ok)
  }
})

test('bot responds to a triple with a higher triple', () => {
  const st = buildState(
    { 0: '8S 8D 8C JH', 1: '5S 5D', 2: 'KD AD' },
    { turnSeat: 0, trick: { cards: [parseCard('6S'), parseCard('6D'), parseCard('6C')], bySeat: 1 } },
  )
  const move = chooseBotMove(st, 0)
  assert.equal(move.type, 'play')
  if (move.type === 'play') {
    assert.equal(parseCombo(move.cards)!.type, 'triple')
    assert.equal(move.cards.length, 3)
    assert.ok(applyPlay(st, 0, move.cards).ok)
  }
})

test('bot responds to a straight with a higher straight of the SAME length', () => {
  const st = buildState(
    { 0: '7S 8D 9C 2H', 1: 'KS', 2: 'KD AD' },
    { turnSeat: 0, trick: { cards: [parseCard('4S'), parseCard('5D'), parseCard('6C')], bySeat: 1 } },
  )
  const move = chooseBotMove(st, 0)
  assert.equal(move.type, 'play')
  if (move.type === 'play') {
    const combo = parseCombo(move.cards)!
    assert.equal(combo.type, 'straight')
    assert.equal(combo.count, 3) // must match the table length, not a 4-straight
    assert.ok(applyPlay(st, 0, move.cards).ok)
  }
})

test('bot does NOT shatter a triple into a single just to follow a single', () => {
  // Table is a single; bot holds a triple of 9s + a lone 5. It should answer with the
  // lone 5 (lowest beat), keeping the triple together — never peel one 9 off.
  const st = buildState(
    { 0: '5H 9S 9D 9C', 1: 'KS', 2: 'KD AD' },
    { turnSeat: 0, trick: { cards: [parseCard('4S')], bySeat: 1 } },
  )
  const move = chooseBotMove(st, 0)
  assert.equal(move.type, 'play')
  if (move.type === 'play') assert.deepEqual(move.cards, [parseCard('5H')])
})

// ── Pipeline integrity: generated == selected == submitted == removed ──────────────
test('multi-card lead removes exactly the played cards (no partial move)', () => {
  const st = buildState({ 0: '5C 5D 5H 8S', 1: 'KC AC QS', 2: 'KD AD QH' }, { turnSeat: 0 })
  const audit = botMoveAudit(st, 0)
  assert.ok(audit.generatedMovesByType.triple >= 1, 'generator emits the triple')
  assert.equal(audit.selectedCombinationType, 'triple')
  assert.equal(audit.submittedCardIds.length, 3)
  const move = chooseBotMove(st, 0)
  if (move.type === 'play') {
    const res = applyPlay(st, 0, move.cards)
    assert.ok(res.ok)
    if (res.ok) assert.equal(res.state.hands[0].length, 1)
  }
})

test('audit never leaks an opponent hand and reports every generated shape', () => {
  const st = buildState({ 0: '3C 3D 5C 5D 5H 6C 7D 8S 9C 9D 9H 9S', 1: '4S', 2: '4D' }, { turnSeat: 0 })
  const audit = botMoveAudit(st, 0)
  // Only the bot's own 12 cards appear; nothing from seats 1/2.
  assert.equal(audit.hand.length, 12)
  assert.ok(!audit.hand.includes('4S') && !audit.hand.includes('4D'))
  assert.ok(audit.generatedMovesByType.pair >= 1)
  assert.ok(audit.generatedMovesByType.triple >= 1)
  assert.ok(audit.generatedMovesByType.straight >= 1)
  assert.ok(audit.generatedMovesByType.fourOfKind >= 1)
})

test('self-play actually uses multi-card combos (not a singles-only game)', () => {
  let multiCardPlays = 0
  for (let trial = 0; trial < 20; trial++) {
    const deck = shuffle(createDeck(), mulberry32(trial + 100))
    let st = dealRound({ seats: [0, 1, 2, 3], roundNo: 2, rules: RULES, deck, previousWinner: 0 })
    let guard = 0
    while (st.status === 'playing' && guard++ < 400) {
      const seat = st.turnSeat
      const move = chooseBotMove(st, seat)
      if (move.type === 'pass') { st = applyPass(st, seat).state; continue }
      if (move.cards.length >= 2) multiCardPlays++
      const res = applyPlay(st, seat, move.cards)
      assert.ok(res.ok)
      st = res.state
    }
  }
  assert.ok(multiCardPlays > 0, 'bots play multi-card combos during normal self-play')
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
