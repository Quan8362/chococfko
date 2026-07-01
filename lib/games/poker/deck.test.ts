// Framework-free tests for the poker deck, cards & shuffle seam.
// Run with:  node --test lib/games/poker/deck.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  RANKS,
  SUITS,
  RANK_VALUE,
  rankOf,
  suitOf,
  rankValue,
  isCard,
  makeDeck,
  assertNoDuplicates,
  isCompleteDeck,
  assertCompleteDeck,
  shuffleWith,
  mulberry32,
  seededShuffle,
  makeSecureShuffleAdapter,
  deal,
} from './deck.ts'
import type { Card } from './types.ts'

// DECK-001: exactly 52 distinct cards.
test('DECK-001 makeDeck produces 52 unique valid cards', () => {
  const deck = makeDeck()
  assert.equal(deck.length, 52)
  assert.ok(isCompleteDeck(deck))
  assert.doesNotThrow(() => assertCompleteDeck(deck))
  assert.equal(RANKS.length, 13)
  assert.equal(SUITS.length, 4)
})

// CARD-RANK-001 / CARD-SUIT-001 accessors.
test('card accessors and rank values', () => {
  assert.equal(rankOf('As' as Card), 'A')
  assert.equal(suitOf('As' as Card), 's')
  assert.equal(rankValue('As' as Card), 14)
  assert.equal(rankValue('2c' as Card), 2)
  assert.equal(RANK_VALUE.T, 10)
})

test('isCard validates 2-char rank+suit strings', () => {
  assert.ok(isCard('Td'))
  assert.ok(isCard('2c'))
  assert.ok(!isCard('Xd'))
  assert.ok(!isCard('Tx'))
  assert.ok(!isCard('T'))
  assert.ok(!isCard('Tdd'))
  assert.ok(!isCard(10 as unknown))
})

// Duplicate-card validation never silently repairs.
test('assertNoDuplicates throws on duplicates and invalid cards', () => {
  assert.doesNotThrow(() => assertNoDuplicates(['As', 'Kd', '2c'] as Card[]))
  assert.throws(() => assertNoDuplicates(['As', 'As'] as Card[]), /duplicate/)
  assert.throws(() => assertNoDuplicates(['Zz' as Card]), /invalid card/)
  assert.ok(!isCompleteDeck(['As', 'As'] as Card[]))
  assert.ok(!isCompleteDeck(makeDeck().slice(0, 51)))
})

// DECK-SHUFFLE-001: deterministic seeded shuffle is reproducible; different seeds differ.
test('DECK-SHUFFLE-001 seededShuffle is deterministic and preserves the deck', () => {
  const a = seededShuffle(12345)
  const b = seededShuffle(12345)
  const c = seededShuffle(99999)
  assert.deepEqual(a, b) // same seed → identical permutation (ENGINE-DETERMINISM-001)
  assert.notDeepEqual(a, c) // different seed → different permutation
  assert.ok(isCompleteDeck(a)) // still 52 unique cards
})

test('shuffleWith does not mutate the input deck', () => {
  const deck = makeDeck()
  const snapshot = deck.slice()
  const out = shuffleWith(mulberry32(7), deck)
  assert.deepEqual(deck, snapshot) // input untouched (pure)
  assert.equal(out.length, 52)
})

// DECK-SHUFFLE-001 🔴 production shuffle must reject Math.random.
test('makeSecureShuffleAdapter refuses Math.random and accepts an injected CSPRNG source', () => {
  assert.throws(() => makeSecureShuffleAdapter(Math.random), /Math\.random/)
  // Inject a (fake) secure source; the adapter shuffles purely from it.
  let counter = 0
  const fakeSecure = () => {
    counter = (counter + 0.61803398875) % 1
    return counter
  }
  const adapter = makeSecureShuffleAdapter(fakeSecure)
  const out = adapter(makeDeck())
  assert.ok(isCompleteDeck(out))
})

// DECK-DEAL-001: fixed board indices, hole cards per seat, burns skipped but positions fixed.
test('DECK-DEAL-001 deal produces 2 hole cards per seat and a 5-card board, all distinct', () => {
  const shuffled = seededShuffle(2024)
  const dealt = deal(shuffled, 6)
  assert.equal(dealt.holeBySeat.length, 6)
  for (const h of dealt.holeBySeat) assert.equal(h.length, 2)
  const all = [
    ...dealt.holeBySeat.flatMap((h) => [h[0], h[1]]),
    ...dealt.flop,
    dealt.turn,
    dealt.river,
  ] as Card[]
  assert.doesNotThrow(() => assertNoDuplicates(all)) // no card dealt twice
  assert.equal(dealt.flop.length, 3)
})

test('deal is deterministic for a given seed and rejects bad seat counts', () => {
  const d1 = deal(seededShuffle(5), 4)
  const d2 = deal(seededShuffle(5), 4)
  assert.deepEqual(d1, d2)
  assert.throws(() => deal(seededShuffle(5), 1), /2\.\.6/)
  assert.throws(() => deal(seededShuffle(5), 7), /2\.\.6/)
})
