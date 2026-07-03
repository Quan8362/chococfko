// ── Poker BOT equity estimation (pure, seeded) ────────────────────────────────────────
//
// PURE module — no React, no Supabase, no clock, no I/O. Deterministic given its rng. Tested by
// equity.test.ts.
//
// 🔴 FAIRNESS: this estimator uses ONLY information a human in the seat has — the bot's own two
// hole cards, the revealed board, and the NUMBER of opponents. It does NOT know any opponent's
// actual cards, the undealt board, or the deck order. It reasons about the unknown exactly the
// way a person does: by sampling. The "unknown" universe is the full 52-card deck MINUS the
// cards the bot can actually see (its own + the revealed board). Opponents' hands and the rest
// of the board are drawn from that universe uniformly at random — never from the real deck.
//
// This is Monte-Carlo hand-equity: run N random completions of the hand, count how often the
// bot's best five wins (a tie counts as a fractional win), and return the average. More samples
// → tighter estimate; the caller trades samples for CPU by difficulty.

import type { Card } from '../types.ts'
import { makeDeck } from '../deck.ts'
import { evaluateHand } from '../evaluator.ts'

// Cards the bot can actually see, used to derive the unknown universe.
function unknownCards(hole: readonly [Card, Card], board: readonly Card[]): Card[] {
  const known = new Set<string>([hole[0], hole[1], ...board])
  return makeDeck().filter((c) => !known.has(c))
}

// Partial Fisher–Yates: draw the first `count` cards of a seeded shuffle of `pool`, mutating a
// working copy. Deterministic given rng. Only the prefix is shuffled (cheap for small counts).
function drawWithoutReplacement(pool: Card[], count: number, rng: () => number): Card[] {
  const out: Card[] = []
  const n = pool.length
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (n - i))
    const tmp = pool[i]
    pool[i] = pool[j]
    pool[j] = tmp
    out.push(pool[i])
  }
  return out
}

export interface EquityEstimate {
  readonly equity: number // [0,1] — probability the bot's hand is best (ties fractional)
  readonly samples: number
  readonly wins: number
  readonly ties: number
}

// Estimate the bot's equity vs `opponents` unknown hands on the given board. Pure + seeded.
//
// `opponents` = number of OTHER seats still contesting the pot (>= 0). With no opponents the
// bot's equity is 1 by definition. Board may be 0..5 cards; the runout is completed from the
// unknown universe each sample.
export function estimateEquity(
  hole: readonly [Card, Card],
  board: readonly Card[],
  opponents: number,
  samples: number,
  rng: () => number,
): EquityEstimate {
  if (opponents <= 0) return { equity: 1, samples: 0, wins: 0, ties: 0 }
  const n = Math.max(1, Math.floor(samples))
  const boardNeed = 5 - board.length
  const pool = unknownCards(hole, board)
  const draw = opponents * 2 + boardNeed
  if (draw > pool.length) {
    throw new Error('bot equity: not enough unknown cards to sample this scenario')
  }

  let wins = 0
  let ties = 0
  const work = pool.slice()
  for (let s = 0; s < n; s++) {
    const drawn = drawWithoutReplacement(work, draw, rng)
    let d = 0
    const oppHoles: [Card, Card][] = []
    for (let o = 0; o < opponents; o++) {
      oppHoles.push([drawn[d++], drawn[d++]])
    }
    const fullBoard = board.concat(drawn.slice(d, d + boardNeed))
    const myScore = evaluateHand(hole, fullBoard).score

    let bestOpp = -Infinity
    for (const oh of oppHoles) {
      const sc = evaluateHand(oh, fullBoard).score
      if (sc > bestOpp) bestOpp = sc
    }
    if (myScore > bestOpp) wins += 1
    else if (myScore === bestOpp) ties += 1
    // else: a loss contributes 0
  }

  const equity = (wins + ties / (opponents + 1)) / n
  return { equity, samples: n, wins, ties }
}

// ── Cheap preflop strength (Chen-style, deterministic, no sampling) ──────────────────────
//
// A fast, allocation-light heuristic in [0,1] for the two hole cards alone, so the cheaper bots
// can act preflop without paying for Monte-Carlo. It is a coarse ranking, NOT an equity — it
// encodes the same public facts a human uses (high cards, pairs, suited, connected). Hard bots
// still use `estimateEquity`; this is the low-cost tier.
const RANK_ORDER: Readonly<Record<string, number>> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
}

// Chen "points" for the high card of the hand.
function chenHighCardPoints(rankValue: number): number {
  switch (rankValue) {
    case 14:
      return 10 // Ace
    case 13:
      return 8 // King
    case 12:
      return 7 // Queen
    case 11:
      return 6 // Jack
    default:
      return rankValue / 2
  }
}

// Normalized preflop strength in [0,1] from the classic Chen formula. Max raw ≈ 20 (AA); we map
// the practical [−1, 20] range onto [0,1].
export function preflopStrength(hole: readonly [Card, Card]): number {
  const r0 = RANK_ORDER[hole[0][0]]
  const r1 = RANK_ORDER[hole[1][0]]
  const hi = Math.max(r0, r1)
  const lo = Math.min(r0, r1)
  const suited = hole[0][1] === hole[1][1]
  const paired = r0 === r1

  let pts = chenHighCardPoints(hi)
  if (paired) {
    pts = Math.max(5, chenHighCardPoints(hi) * 2) // pairs: 2× high card, min 5
  }
  if (suited) pts += 2

  const gap = hi - lo
  if (!paired) {
    if (gap === 1) pts += 0 // connectors, no gap penalty
    else if (gap === 2) pts -= 1
    else if (gap === 3) pts -= 2
    else if (gap === 4) pts -= 4
    else if (gap >= 5) pts -= 5
    // Straight bonus for low, close, non-paired cards (both below Q, gap ≤ 1).
    if (gap <= 1 && hi < 12) pts += 1
  }

  // Map raw Chen points (≈ −1 .. 20) into [0,1].
  const norm = (pts + 1) / 21
  return Math.min(1, Math.max(0, norm))
}
