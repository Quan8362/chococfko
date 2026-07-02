// ── Poker HAND-RANKING guide (pure data) ───────────────────────────────────────────────────────
//
// PURE — the visual hand-ranking guide's source data. Every example is a REAL 5-card hand that the
// evaluator scores to the stated category (asserted in handGuide.test.ts), so the guide can never
// drift from the engine that actually decides hands. The UI renders these with the shared card
// component and localizes labels from `games.poker.hand_name.*` (the frozen glossary), so no rule
// text is hard-coded here.
//
// `key` matches the frozen hand-name i18n keys. Ordered STRONGEST → weakest (comparison order).

import type { Card } from '../types.ts'
import { HandCategory, type HandCategory as HandCategoryT } from '../evaluator.ts'

export interface RankingExample {
  readonly key: string
  readonly category: HandCategoryT
  readonly cards: readonly Card[] // exactly 5, evaluates to `category`
}

export const HAND_RANKING_GUIDE: readonly RankingExample[] = [
  { key: 'straight_flush', category: HandCategory.StraightFlush, cards: ['9h', 'Th', 'Jh', 'Qh', 'Kh'] },
  { key: 'four_of_a_kind', category: HandCategory.FourOfAKind, cards: ['9c', '9d', '9h', '9s', 'Kd'] },
  { key: 'full_house', category: HandCategory.FullHouse, cards: ['Qc', 'Qd', 'Qh', '7s', '7d'] },
  { key: 'flush', category: HandCategory.Flush, cards: ['2c', '5c', '8c', 'Jc', 'Kc'] },
  { key: 'straight', category: HandCategory.Straight, cards: ['4d', '5s', '6h', '7c', '8d'] },
  { key: 'three_of_a_kind', category: HandCategory.ThreeOfAKind, cards: ['Jc', 'Jd', 'Jh', '9s', '4d'] },
  { key: 'two_pair', category: HandCategory.TwoPair, cards: ['Ac', 'Ad', '9h', '9s', '4d'] },
  { key: 'pair', category: HandCategory.Pair, cards: ['Kc', 'Kd', '9h', '7s', '4d'] },
  { key: 'high_card', category: HandCategory.HighCard, cards: ['Ac', 'Jd', '9h', '7s', '4d'] },
]

// ── Special teaching cases the guide must show without oversimplifying ─────────────────────────

// Kicker: same pair (aces), the higher side card wins. `a` beats `b` (King kicker > Queen kicker).
export const KICKER_EXAMPLE = {
  key: 'kicker',
  a: ['As', 'Ah', 'Kd', '9c', '4s'] as readonly Card[], // pair of aces, King kicker — WINS
  b: ['Ac', 'Ad', 'Qs', '9h', '4d'] as readonly Card[], // pair of aces, Queen kicker
} as const

// The wheel: Ace plays LOW to make the smallest straight A-2-3-4-5 (top card = five).
export const WHEEL_EXAMPLE = {
  key: 'wheel',
  cards: ['As', '2c', '3d', '4h', '5s'] as readonly Card[],
} as const

// The board plays: the five community cards are the best hand, and neither player's hole cards
// improve it — so the pot is split (both "play the board").
export const BOARD_PLAYS_EXAMPLE = {
  key: 'board_plays',
  board: ['As', 'Ks', 'Qs', 'Js', 'Ts'] as readonly Card[], // royal flush on the board
  holeA: ['2c', '3d'] as readonly [Card, Card],
  holeB: ['4h', '5c'] as readonly [Card, Card],
} as const

// Exact tie: identical ranks across different suits — suits never break ties in Hold'em.
export const EXACT_TIE_EXAMPLE = {
  key: 'exact_tie',
  a: ['Ac', 'Kc', 'Qd', 'Jh', '9s'] as readonly Card[],
  b: ['Ad', 'Kh', 'Qs', 'Jc', '9d'] as readonly Card[],
} as const
