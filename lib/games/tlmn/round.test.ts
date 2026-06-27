// Tests for the pure ROUND state machine (round.ts). Proves the full lifecycle:
// deal → round-1 3♠ lead → trick flow (play/pass/reset) → first-out đếm-lá
// settlement, tới trắng, chặt/đền, cóng, thối heo, and the idle-turn auto-move.
// Run with:  node --test lib/games/tlmn/round.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseHand, parseCard, DEFAULT_RULES, createDeck, type Card } from './engine.ts'
import {
  dealRound, applyPlay, applyPass, applyTimeout, cardCounts, type RoundState,
} from './round.ts'

const RULES = DEFAULT_RULES

// Build a mid-round state directly so trick/settlement flows can be tested in isolation.
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

// ── Deal ───────────────────────────────────────────────────────────────────────────
test('deal: 4 players get 13 each; counts are public', () => {
  const s = dealRound({ seats: [0, 1, 2, 3], roundNo: 1, rules: RULES, deck: createDeck() })
  for (const seat of [0, 1, 2, 3]) assert.equal(s.hands[seat].length, 13)
  assert.deepEqual(cardCounts(s), { 0: 13, 1: 13, 2: 13, 3: 13 })
})

test('deal round 1: 3♠ holder leads and the opening must include 3♠', () => {
  // Fresh ordered deck → seat 0 gets 3♠ (deck[0]). toiTrang off so the ordered
  // block (which happens to be ba sám cô) doesn't end the round before we can lead.
  const rules = { ...RULES, toiTrangEnabled: false }
  const s = dealRound({ seats: [0, 1, 2, 3], roundNo: 1, rules, deck: createDeck() })
  const holder = [0, 1, 2, 3].find(seat =>
    s.hands[seat].some(c => c.rank === 0 && c.suit === 0))!
  assert.equal(s.turnSeat, holder)
  assert.equal(s.mustIncludeThreeSpade, true)

  // A lead that omits 3♠ is rejected; including it is accepted.
  const notThree = s.hands[holder].find(c => !(c.rank === 0 && c.suit === 0))!
  assert.equal(applyPlay(s, holder, [notThree]).ok, false)
  const threeSpade = parseCard('3S')
  const ok = applyPlay(s, holder, [threeSpade])
  assert.equal(ok.ok, true)
})

test('deal: only dealt cards are in play; the remainder is dropped (3 players ⇒ 13 of 39 unseen)', () => {
  const s = dealRound({ seats: [0, 1, 2], roundNo: 1, rules: RULES, deck: createDeck() })
  const total = s.seats.reduce((n, seat) => n + s.hands[seat].length, 0)
  assert.equal(total, 39) // 3×13, the other 13 are removed and never revealed
})

test('deal round 2: previous winner leads with no 3♠ requirement', () => {
  const s = dealRound({ seats: [0, 1, 2, 3], roundNo: 2, rules: { ...RULES, toiTrangEnabled: false }, deck: createDeck(), previousWinner: 2 })
  assert.equal(s.turnSeat, 2)
  assert.equal(s.mustIncludeThreeSpade, false)
})

// ── Chained chop follows seat order (§11.5) ───────────────────────────────────────
test('chained chop: single 2 → 3-pairs-run → tứ quý, each victim/cutter logged in turn order', () => {
  // Seat 0 leads a single 2; seat 1 cuts with a 3-pairs-run; seat 2 cuts with a tứ quý.
  const s = buildState(
    {
      0: '2H 5D',
      1: '3S 3C 4S 4C 5S 5C 9D',
      2: '7S 7C 7D 7H 9H',
      3: 'KD KH',
    },
    { turnSeat: 0 },
  )
  const r1 = applyPlay(s, 0, parseHand('2H'))
  assert.ok(r1.ok && r1.state.turnSeat === 1)
  const r2 = applyPlay(r1.ok ? r1.state : s, 1, parseHand('3S 3C 4S 4C 5S 5C'))
  assert.ok(r2.ok, r2.ok ? '' : r2.error)
  assert.equal(r2.ok && r2.state.turnSeat, 2)
  const r3 = applyPlay(r2.ok ? r2.state : s, 2, parseHand('7S 7C 7D 7H'))
  assert.ok(r3.ok, r3.ok ? '' : r3.error)
  if (r3.ok) {
    assert.equal(r3.state.cutEvents.length, 2)
    assert.deepEqual(r3.state.cutEvents.map(e => [e.cutVictim, e.cutter]), [[0, 1], [1, 2]])
  }
})

// ── Trick flow ───────────────────────────────────────────────────────────────────
test('trick: lead → all others pass → leader wins and re-leads a fresh trick', () => {
  let s = buildState({ 0: '5S 6S 7S', 1: '8S 9S 10S', 2: 'JS QS KS' }, { turnSeat: 0 })
  s = expectOk(applyPlay(s, 0, [parseCard('5S')]))          // 0 leads a single 5
  assert.equal(s.turnSeat, 1)
  s = expectOk(applyPass(s, 1))
  assert.equal(s.turnSeat, 2)
  s = expectOk(applyPass(s, 2))
  // Everyone else passed ⇒ trick resets, 0 leads again.
  assert.equal(s.trick, null)
  assert.deepEqual(s.passed, [])
  assert.equal(s.turnSeat, 0)
})

test('pass is illegal while leading an empty trick', () => {
  const s = buildState({ 0: '5S 6S', 1: '8S 9S' }, { turnSeat: 0 })
  assert.equal(applyPass(s, 0).ok, false)
})

test('a follow must beat the table; a weaker same-shape card is rejected', () => {
  let s = buildState({ 0: '5S 6S', 1: '4S 9S' }, { turnSeat: 0 })
  s = expectOk(applyPlay(s, 0, [parseCard('5S')]))
  assert.equal(applyPlay(s, 1, [parseCard('4S')]).ok, false) // 4 < 5
  assert.equal(applyPlay(s, 1, [parseCard('9S')]).ok, true)
})

test('regression: the round-1 3♠ rule never blocks a follow (only the opening lead)', () => {
  // Round 1, mid-trick: the table holds the bot's single 4♠ and it's the human's
  // turn. The human holds no 3♠ but a 6♥. Even with the opening flag still set, a
  // FOLLOW must be legal — the 3♠ requirement applies only when leading.
  const s = buildState(
    { 0: '4D 5D', 1: '6H 7H' },
    { roundNo: 1, turnSeat: 1, trick: { cards: parseHand('4S'), bySeat: 0 }, mustIncludeThreeSpade: true },
  )
  const res = applyPlay(s, 1, [parseCard('6H')])
  assert.ok(res.ok, `a single 6♥ must legally follow a single 4♠, got: ${res.ok ? '' : res.error}`)
  assert.equal(res.ok && res.state.trick?.bySeat, 1) // the human now owns the trick
})

// ── First-out đếm-lá settlement ─────────────────────────────────────────────────
test('first out ends the round; đếm-lá charges remaining cards to the Nhất', () => {
  // seat 0 plays its last card; seats 1,2 hold plain cards (played > 0 ⇒ no cóng).
  let s = buildState(
    { 0: '2H', 1: '4S 7D 9C', 2: '8S 10D' },
    { turnSeat: 0 },
  )
  s = expectOk(applyPlay(s, 0, [parseCard('2H')]))
  assert.equal(s.status, 'ended')
  assert.equal(s.winner, 0)
  // base = 1/card: seat1 -3, seat2 -2, winner +5.
  assert.deepEqual(s.deltas, { 0: 5, 1: -3, 2: -2 })
  assert.equal(sum(s.deltas!), 0)
})

test('cóng: a loser who played 0 cards pays 13×base×congMultiplier', () => {
  let s = buildState(
    { 0: '2H', 1: '4S 6D', 2: '8S 9D' },
    { turnSeat: 0, playedCount: { 0: 5, 1: 5, 2: 0 } }, // seat 2 played nothing ⇒ cóng
  )
  s = expectOk(applyPlay(s, 0, [parseCard('2H')]))
  // seat1 -2 (2 cards), seat2 -26 (13×1×2), winner +28.
  assert.deepEqual(s.deltas, { 0: 28, 1: -2, 2: -26 })
})

test('thối heo: a loser still holding a 2 has the card-count payment multiplied', () => {
  let s = buildState(
    { 0: '2H', 1: '2S 4D', 2: '8S' },
    { turnSeat: 0 },
  )
  s = expectOk(applyPlay(s, 0, [parseCard('2H')]))
  // seat1: 2 cards ×1 = 2, ×2 (holds a 2) = 4; seat2: 1; winner +5.
  assert.deepEqual(s.deltas, { 0: 5, 1: -4, 2: -1 })
})

// ── Chặt / đền ────────────────────────────────────────────────────────────────────
test('chặt: a tứ quý cutting a single 2 logs the cut and đền moves denHeo', () => {
  // seat 1 has a single 2 on the table; seat 0 cuts with a four and goes out.
  let s = buildState(
    { 0: '5S 5C 5D 5H', 1: '4S 6D', 2: '7S' },
    { turnSeat: 0, trick: { cards: [parseCard('2S')], bySeat: 1 }, passed: [2] },
  )
  s = expectOk(applyPlay(s, 0, parseHand('5S 5C 5D 5H')))
  assert.equal(s.winner, 0)
  assert.equal(s.cutEvents.length, 1)
  assert.deepEqual(s.cutEvents[0], { cutVictim: 1, cutter: 0, kind: 'heo' })
  // đếm-lá: seat1 -2, seat2 -1, winner +3.  đền heo: seat1 -5 → seat0 +5.
  assert.deepEqual(s.deltas, { 0: 8, 1: -7, 2: -1 })
  assert.equal(sum(s.deltas!), 0)
})

// ── Tới trắng ───────────────────────────────────────────────────────────────────
test('tới trắng: a tứ quý heo on the deal ends the round instantly with the payout', () => {
  // Hand seat 0 = the four 2s + filler ⇒ tuQuyHeo instant win. Force via deck.
  const seat0: Card[] = parseHand('2S 2C 2D 2H 3S 4S 5S 6S 7S 8S 9S 10S JS')
  const rest = createDeck().filter(c => !seat0.some(h => h.rank === c.rank && h.suit === c.suit))
  const deck = [...seat0, ...rest] // first 13 → seat 0
  const s = dealRound({ seats: [0, 1, 2, 3], roundNo: 1, rules: RULES, deck })
  assert.equal(s.status, 'ended')
  assert.equal(s.winner, 0)
  assert.equal(s.instantWin?.type, 'tuQuyHeo')
  // toiTrangPayout = 20 from each of 3 others.
  assert.deepEqual(s.deltas, { 0: 60, 1: -20, 2: -20, 3: -20 })
})

test('tới trắng off ⇒ never an instant win even on a qualifying deal', () => {
  const seat0: Card[] = parseHand('2S 2C 2D 2H 3S 4S 5S 6S 7S 8S 9S 10S JS')
  const rest = createDeck().filter(c => !seat0.some(h => h.rank === c.rank && h.suit === c.suit))
  const deck = [...seat0, ...rest]
  const rules = { ...RULES, toiTrangEnabled: false }
  const s = dealRound({ seats: [0, 1, 2, 3], roundNo: 1, rules, deck })
  assert.equal(s.status, 'playing')
  assert.equal(s.instantWin, null)
})

// ── Timeout auto-move ──────────────────────────────────────────────────────────────
test('timeout while leading auto-plays the lowest single', () => {
  const s = buildState({ 0: '9S 4S 2H', 1: '5S' }, { turnSeat: 0 })
  const r = expectOk(applyTimeout(s))
  // lowest single is 4♠; it becomes the table; turn passes to seat 1.
  assert.equal(r.trick?.cards.length, 1)
  assert.equal(r.trick?.cards[0].rank, parseCard('4S').rank)
  assert.equal(r.turnSeat, 1)
})

test('timeout while following auto-passes', () => {
  let s = buildState({ 0: '5S 6S', 1: '8S 9S' }, { turnSeat: 0 })
  s = expectOk(applyPlay(s, 0, [parseCard('5S')]))
  const r = expectOk(applyTimeout(s)) // seat 1 times out ⇒ passes ⇒ 0 re-leads
  assert.equal(r.turnSeat, 0)
  assert.equal(r.trick, null)
})

test('round-1 timeout while leading auto-plays 3♠ (the mandatory opener, lowest single)', () => {
  const s = buildState(
    { 0: '3S 9S 2H', 1: '5S' },
    { turnSeat: 0, mustIncludeThreeSpade: true },
  )
  const r = expectOk(applyTimeout(s))
  assert.equal(r.trick?.cards[0].rank, 0)
  assert.equal(r.trick?.cards[0].suit, 0)
})

// ── helpers ─────────────────────────────────────────────────────────────────────
function expectOk(r: ReturnType<typeof applyPlay>): RoundState {
  assert.ok(r.ok, r.ok ? '' : `unexpected error: ${r.error}`)
  return (r as { ok: true; state: RoundState }).state
}
function sum(rec: Record<number, number>): number {
  return Object.values(rec).reduce((a, b) => a + b, 0)
}
