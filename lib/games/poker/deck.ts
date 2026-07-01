// ── Poker deck, cards & shuffle (pure) ─────────────────────────────────────────────
//
// PURE module — no React, no Supabase, no browser API. Tested by deck.test.ts.
//
// Card representation reuses the domain vocabulary from ./types.ts: a `Card` is a 2-char
// `${Rank}${Suit}` string. This module owns the standard 52-card deck, duplicate validation,
// rank ordering, and the SHUFFLE seam.
//
// 🔴 SECURITY (DECK-SHUFFLE-001): production shuffle MUST use a cryptographically secure RNG.
// `Math.random` is FORBIDDEN in the production path. The engine accepts a deterministic seeded
// shuffle ONLY for tests/replay. The production adapter is a documented contract
// (`ShuffleAdapter`) fulfilled server-side with `crypto`-grade randomness — never here in pure
// code, never in the browser.

import type { Card, Rank, Suit } from './types.ts'

// ── Ranks & suits ──────────────────────────────────────────────────────────────────
// CARD-RANK-001: low→high. Index in this array IS the comparison order for "rank value".
export const RANKS: readonly Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const

// CARD-SUIT-001: suits have EQUAL value. This order is for deterministic deck layout ONLY —
// it must never break a tie, rank a hand, or award an odd chip.
export const SUITS: readonly Suit[] = ['c', 'd', 'h', 's'] as const

// Numeric rank value, Ace high (=14). The wheel (A-2-3-4-5) treats the Ace as low (=1) only
// inside the evaluator (HAND-STRAIGHT-WHEEL-001); the base value here is always Ace-high.
export const RANK_VALUE: Readonly<Record<Rank, number>> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
}

export function rankOf(card: Card): Rank {
  return card[0] as Rank
}

export function suitOf(card: Card): Suit {
  return card[1] as Suit
}

export function rankValue(card: Card): number {
  return RANK_VALUE[rankOf(card)]
}

const RANK_SET = new Set<string>(RANKS)
const SUIT_SET = new Set<string>(SUITS)

export function isCard(value: unknown): value is Card {
  return (
    typeof value === 'string' &&
    value.length === 2 &&
    RANK_SET.has(value[0]) &&
    SUIT_SET.has(value[1])
  )
}

// ── Deck construction (DECK-001) ────────────────────────────────────────────────────
// Exactly 52 cards in a fixed canonical order: rank-major, suit-minor. Deterministic so a
// seeded shuffle is reproducible (ENGINE-DETERMINISM-001).
export function makeDeck(): Card[] {
  const deck: Card[] = []
  for (const r of RANKS) {
    for (const s of SUITS) {
      deck.push(`${r}${s}` as Card)
    }
  }
  return deck
}

// Duplicate / validity check. Throws on any malformed card, wrong count, or duplicate — the
// engine NEVER silently repairs an impossible deck (engine rule: "Never silently repair").
export function assertNoDuplicates(cards: readonly Card[], label = 'cards'): void {
  const seen = new Set<string>()
  for (const c of cards) {
    if (!isCard(c)) throw new Error(`deck: ${label} contains an invalid card ${String(c)}`)
    if (seen.has(c)) throw new Error(`deck: ${label} contains a duplicate card ${c}`)
    seen.add(c)
  }
}

export function isCompleteDeck(cards: readonly Card[]): boolean {
  if (cards.length !== 52) return false
  try {
    assertNoDuplicates(cards, 'deck')
  } catch {
    return false
  }
  return true
}

export function assertCompleteDeck(cards: readonly Card[]): void {
  if (cards.length !== 52) throw new Error(`deck: expected 52 cards, got ${cards.length}`)
  assertNoDuplicates(cards, 'deck')
}

// ── Shuffle seam ─────────────────────────────────────────────────────────────────────
//
// `RandomSource` returns a float in [0, 1). The engine never calls global randomness directly;
// callers inject the source. This is the single seam where deterministic-test vs CSPRNG-
// production randomness is chosen.
export type RandomSource = () => number

// A `ShuffleAdapter` shuffles a deck. Production MUST inject a CSPRNG-backed source
// (DECK-SHUFFLE-001); tests inject a seeded source. The adapter is pure given its source.
export type ShuffleAdapter = (deck: readonly Card[]) => Card[]

// Fisher–Yates over an injected random source. Pure: does not mutate the input array.
export function shuffleWith(source: RandomSource, deck: readonly Card[]): Card[] {
  const out = deck.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(source() * (i + 1))
    if (j < 0 || j > i) throw new Error('deck: random source returned out-of-range value')
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

// ── Deterministic test shuffle adapter ───────────────────────────────────────────────
// A small, well-distributed seeded PRNG (mulberry32). FOR TESTS / REPLAY ONLY. Given the same
// seed it produces the identical permutation (ENGINE-DETERMINISM-001 / ENGINE-REPLAY-001).
// NEVER use this in production: it is not cryptographically secure.
export function mulberry32(seed: number): RandomSource {
  let a = seed >>> 0
  return function next(): number {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Deterministic shuffle adapter from an integer seed (test/replay path).
export function seededShuffle(seed: number, deck: readonly Card[] = makeDeck()): Card[] {
  if (!Number.isInteger(seed)) throw new Error('deck: seededShuffle seed must be an integer')
  const shuffled = shuffleWith(mulberry32(seed), deck)
  assertCompleteDeck(shuffled.length === 52 ? shuffled : makeDeck()) // guard only for full decks
  return shuffled
}

// ── Production shuffle adapter contract ───────────────────────────────────────────────
//
// Documented seam, NOT an implementation. The server constructs a `secureShuffleAdapter` by
// injecting a CSPRNG source (e.g. derived from `crypto.getRandomValues`). This factory refuses
// a source that is `Math.random` to make the security rule structural rather than trusted.
// (Math.random is referentially identical when passed directly; this catches the common slip.)
export function makeSecureShuffleAdapter(source: RandomSource): ShuffleAdapter {
  if (source === Math.random) {
    throw new Error('deck: production shuffle must NOT use Math.random (DECK-SHUFFLE-001)')
  }
  if (typeof source !== 'function') {
    throw new Error('deck: secure shuffle requires a random source function')
  }
  return (deck: readonly Card[]) => shuffleWith(source, deck)
}

// ── Dealing (DECK-DEAL-001) ──────────────────────────────────────────────────────────
// Deterministic dealing from an already-shuffled deck. Hole cards: one to each seat in order,
// twice. Board: flop(3)/turn(1)/river(1) with a burn before each (burns never revealed). The
// board *indices* are fixed regardless of whether burns are physically skipped, so a replay
// always reconstructs the same board.
export interface DealtCards {
  readonly holeBySeat: ReadonlyArray<readonly [Card, Card]>
  readonly flop: readonly [Card, Card, Card]
  readonly turn: Card
  readonly river: Card
}

export function deal(shuffled: readonly Card[], seatCount: number): DealtCards {
  if (!Number.isInteger(seatCount) || seatCount < 2 || seatCount > 6) {
    throw new Error(`deck: seatCount must be 2..6, got ${seatCount}`)
  }
  // 2 hole cards × seats + 3 burns + 5 board cards.
  const needed = seatCount * 2 + 3 + 5
  if (shuffled.length < needed) {
    throw new Error(`deck: not enough cards to deal ${seatCount} seats (need ${needed}, have ${shuffled.length})`)
  }
  assertNoDuplicates(shuffled.slice(0, needed), 'deal window')

  const hole: Array<[Card, Card]> = Array.from({ length: seatCount }, () => ['' as Card, '' as Card])
  let idx = 0
  for (let round = 0; round < 2; round++) {
    for (let seat = 0; seat < seatCount; seat++) {
      hole[seat][round] = shuffled[idx++]
    }
  }
  idx++ // burn before flop
  const flop: [Card, Card, Card] = [shuffled[idx++], shuffled[idx++], shuffled[idx++]]
  idx++ // burn before turn
  const turn = shuffled[idx++]
  idx++ // burn before river
  const river = shuffled[idx++]

  return {
    holeBySeat: hole.map((h) => [h[0], h[1]] as const),
    flop,
    turn,
    river,
  }
}
