// ── Poker hand evaluator (pure) ────────────────────────────────────────────────────
//
// PURE module — no React, no Supabase, no browser API. Tested by evaluator.test.ts.
//
// Forms the BEST five-card hand from 5..7 cards (2 hole + up to 5 board) and produces a
// totally-ordered comparable value. Implements the full ladder and tiebreak rules
// (HAND-RANK-001, HAND-TIE-001, HAND-EXACT-TIE-001) including the wheel (HAND-STRAIGHT-WHEEL-001)
// and the wraparound-invalid rule (HAND-STRAIGHT-WRAP-001).
//
// Suits NEVER break a tie (CARD-SUIT-001): two hands with identical ranks are an EXACT tie,
// `compareHandValues === 0`, and split the pot (HAND-EXACT-TIE-001).
//
// Design: `evaluateFive` scores any 5 cards correctly; `evaluateBest` brute-forces all C(n,5)
// combinations (≤21 for 7 cards) and keeps the maximum. This makes "the board plays"
// (HAND-USE-001) and best-five extraction fall out for free, with zero special-casing.

import type { Card, Rank } from './types.ts'
import { isCard, rankValue, suitOf, RANK_VALUE } from './deck.ts'

// HAND-RANK-001 ladder. Higher number = stronger category. A const object (not a TS `enum`) so
// the module runs under node --test's strip-only TypeScript mode.
export const HandCategory = {
  HighCard: 0,
  Pair: 1,
  TwoPair: 2,
  ThreeOfAKind: 3,
  Straight: 4,
  Flush: 5,
  FullHouse: 6,
  FourOfAKind: 7,
  StraightFlush: 8,
} as const
export type HandCategory = (typeof HandCategory)[keyof typeof HandCategory]

export const HAND_CATEGORY_LABEL: Readonly<Record<HandCategory, string>> = {
  [HandCategory.HighCard]: 'high_card',
  [HandCategory.Pair]: 'pair',
  [HandCategory.TwoPair]: 'two_pair',
  [HandCategory.ThreeOfAKind]: 'three_of_a_kind',
  [HandCategory.Straight]: 'straight',
  [HandCategory.Flush]: 'flush',
  [HandCategory.FullHouse]: 'full_house',
  [HandCategory.FourOfAKind]: 'four_of_a_kind',
  [HandCategory.StraightFlush]: 'straight_flush',
}

// A scored hand. `tiebreakers` are the ordered significant ranks (descending) per category;
// `score` is a single canonical integer such that comparing scores is identical to comparing
// (category, tiebreakers) lexicographically. `bestFive` are the exact 5 cards that make it.
export interface HandValue {
  readonly category: HandCategory
  readonly tiebreakers: readonly number[] // up to 5 entries, descending
  readonly score: number // canonical comparable integer (HAND-INV-002)
  readonly bestFive: readonly Card[]
}

// Encode (category, up-to-5 tiebreakers) into one integer. Ranks are 1..14, base 15 leaves a
// clean 0 for "absent" padding. Max value ≈ 8·15^5 + … ≈ 6.8M, far inside safe-integer range,
// so this is an exact, allocation-free total order.
const BASE = 15
function encodeScore(category: HandCategory, tiebreakers: readonly number[]): number {
  let score = category
  for (let i = 0; i < 5; i++) {
    score = score * BASE + (tiebreakers[i] ?? 0)
  }
  return score
}

function descending(a: number, b: number): number {
  return b - a
}

// Detect a 5-card straight from a set of distinct rank values. Returns the run's TOP card
// value, or 0 if not a straight. Handles the wheel (A-2-3-4-5 → top 5, HAND-STRAIGHT-WHEEL-001)
// and rejects wraparounds (Q-K-A-2-3, HAND-STRAIGHT-WRAP-001) by only accepting 5 strictly
// consecutive values, with the Ace allowed as low (1) ONLY for the wheel.
function straightTop(distinctDesc: readonly number[]): number {
  // Try Ace-high runs first (Ace fixed at 14; a wraparound never forms because values are
  // strictly consecutive integers).
  for (let i = 0; i + 4 < distinctDesc.length; i++) {
    const top = distinctDesc[i]
    if (
      distinctDesc[i + 1] === top - 1 &&
      distinctDesc[i + 2] === top - 2 &&
      distinctDesc[i + 3] === top - 3 &&
      distinctDesc[i + 4] === top - 4
    ) {
      return top
    }
  }
  // Wheel: A,5,4,3,2 present → Ace plays low, straight top is 5.
  if (
    distinctDesc.includes(14) &&
    distinctDesc.includes(5) &&
    distinctDesc.includes(4) &&
    distinctDesc.includes(3) &&
    distinctDesc.includes(2)
  ) {
    return 5
  }
  return 0
}

// Evaluate EXACTLY five cards. Throws on a malformed/duplicated input — never repairs.
export function evaluateFive(cards: readonly Card[]): HandValue {
  if (cards.length !== 5) throw new Error(`evaluator: evaluateFive needs 5 cards, got ${cards.length}`)
  const seen = new Set<string>()
  for (const c of cards) {
    if (!isCard(c)) throw new Error(`evaluator: invalid card ${String(c)}`)
    if (seen.has(c)) throw new Error(`evaluator: duplicate card ${c}`)
    seen.add(c)
  }

  const values = cards.map(rankValue).sort(descending)
  const isFlush = cards.every((c) => suitOf(c) === suitOf(cards[0]))

  // Rank → count.
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  const distinctDesc = Array.from(counts.keys()).sort(descending)

  // Groups sorted by (count desc, rank desc) — the canonical kicker order.
  const groups = Array.from(counts.entries()).sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]))
  const top = straightTop(distinctDesc)

  let category: HandCategory
  let tiebreakers: number[]

  if (isFlush && top > 0) {
    category = HandCategory.StraightFlush
    tiebreakers = [top]
  } else if (groups[0][1] === 4) {
    category = HandCategory.FourOfAKind
    tiebreakers = [groups[0][0], groups[1][0]]
  } else if (groups[0][1] === 3 && groups[1][1] >= 2) {
    category = HandCategory.FullHouse
    tiebreakers = [groups[0][0], groups[1][0]]
  } else if (isFlush) {
    category = HandCategory.Flush
    tiebreakers = values.slice() // all five, descending
  } else if (top > 0) {
    category = HandCategory.Straight
    tiebreakers = [top]
  } else if (groups[0][1] === 3) {
    category = HandCategory.ThreeOfAKind
    tiebreakers = [groups[0][0], ...groups.slice(1).map((g) => g[0])]
  } else if (groups[0][1] === 2 && groups[1][1] === 2) {
    category = HandCategory.TwoPair
    const highPair = Math.max(groups[0][0], groups[1][0])
    const lowPair = Math.min(groups[0][0], groups[1][0])
    const kicker = groups[2][0]
    tiebreakers = [highPair, lowPair, kicker]
  } else if (groups[0][1] === 2) {
    category = HandCategory.Pair
    tiebreakers = [groups[0][0], ...groups.slice(1).map((g) => g[0])]
  } else {
    category = HandCategory.HighCard
    tiebreakers = values.slice()
  }

  return {
    category,
    tiebreakers,
    score: encodeScore(category, tiebreakers),
    bestFive: cards.slice(),
  }
}

// Generate all C(n,5) index combinations for n in [5..7].
function combinations5(n: number): number[][] {
  const out: number[][] = []
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) out.push([a, b, c, d, e])
  return out
}

// Evaluate the BEST five-card hand from 5..7 cards (HAND-USE-001 / "the board plays"). Returns
// the winning HandValue including the selected `bestFive`.
export function evaluateBest(cards: readonly Card[]): HandValue {
  if (cards.length < 5 || cards.length > 7) {
    throw new Error(`evaluator: evaluateBest needs 5..7 cards, got ${cards.length}`)
  }
  let best: HandValue | null = null
  for (const idx of combinations5(cards.length)) {
    const five = idx.map((i: number) => cards[i])
    const v = evaluateFive(five)
    if (best === null || v.score > best.score) best = v
  }
  return best as HandValue
}

// Evaluate a player's hand from 2 hole + 0..5 board cards. (HAND-INV-001: order/seat
// independent — the result depends only on the multiset of cards.)
export function evaluateHand(hole: readonly [Card, Card], board: readonly Card[]): HandValue {
  return evaluateBest([...hole, ...board])
}

// HAND-INV-002: total order. 0 IFF exact tie (suits excluded → real ties exist).
export function compareHandValues(a: HandValue, b: HandValue): -1 | 0 | 1 {
  if (a.score < b.score) return -1
  if (a.score > b.score) return 1
  return 0
}

// Human-readable metadata (NO UI strings baked into engine logic — this is a stable machine
// vocabulary, e.g. 'two_pair', that the UI layer maps to localized text).
export interface HandMeta {
  readonly category: HandCategory
  readonly label: string
  readonly tiebreakerRanks: readonly Rank[]
}

const VALUE_TO_RANK: Readonly<Record<number, Rank>> = Object.fromEntries(
  (Object.entries(RANK_VALUE) as [Rank, number][]).map(([r, v]) => [v, r]),
) as Record<number, Rank>

export function describeHand(value: HandValue): HandMeta {
  return {
    category: value.category,
    label: HAND_CATEGORY_LABEL[value.category],
    tiebreakerRanks: value.tiebreakers.map((v) => VALUE_TO_RANK[v] ?? ('5' as Rank)),
  }
}
