// ─────────────────────────────────────────────────────────────────────────────
// Public-information opponent model.
//
// Uses ONLY what a human at the table can see: the bot's own hand, every card that
// has already been played (seenCards), per-seat card counts, and seat order. From
// the UNSEEN pool (52 − my hand − seen) it estimates — never asserts — the odds an
// opponent can answer a given lead, via hypergeometric draws over the pool.
//
// CRITICAL correctness rule: an opponent holding `h` cards can only answer a k-card
// shape if h ≥ k AND they hold ≥k qualifying cards. (A 1-card opponent can never
// beat a pair.) This is what makes danger-mode defence sound.
//
// It NEVER receives an opponent's hidden hand — see ai.fairness.test.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { type Card, RANKS, SUITS, R2, strength, createDeck } from '../engine.ts'
import { type LegalMove, type PolicyView } from './types.ts'

const NRANKS = RANKS.length

/** Cards not visible to the bot: full deck minus our hand minus everything played. */
export function unseenCards(view: PolicyView): Card[] {
  const taken = new Set<string>()
  for (const c of view.myHand) taken.add(`${c.rank}-${c.suit}`)
  for (const c of view.seenCards) taken.add(`${c.rank}-${c.suit}`)
  return createDeck().filter(c => !taken.has(`${c.rank}-${c.suit}`))
}

function rankCountsOf(cards: Card[]): number[] {
  const out = new Array(NRANKS).fill(0)
  for (const c of cards) out[c.rank]++
  return out
}

// C(n, k) as a float (n ≤ 52 → exact enough). Returns 0 for invalid args.
function comb(n: number, k: number): number {
  if (k < 0 || k > n || n < 0) return 0
  k = Math.min(k, n - k)
  let r = 1
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
  return r
}

// Hypergeometric P(at least `t` successes) drawing `n` from `N` with `K` successes.
function probDrawAtLeast(K: number, N: number, n: number, t: number): number {
  if (t <= 0) return 1
  if (n < t || K < t || N <= 0 || n <= 0) return 0
  const denom = comb(N, n)
  if (denom <= 0) return 0
  let pLess = 0
  for (let i = 0; i < t; i++) pLess += (comb(K, i) * comb(N - K, n - i)) / denom
  return Math.max(0, Math.min(1, 1 - pLess))
}

// Probability a SINGLE opponent holding `h` cards can beat `move` (same shape &
// higher, or a bomb cut where applicable), drawn from the unseen pool.
function oppBeatProb(
  move: LegalMove,
  total: number,
  unseen: Card[],
  counts: number[],
  h: number,
): number {
  if (h <= 0 || total <= 0) return 0
  let p = 0
  switch (move.combinationType) {
    case 'single': {
      const s = strength(move.cards[0])
      const K = unseen.filter(c => strength(c) > s).length
      p = probDrawAtLeast(K, total, h, 1)
      break
    }
    case 'pair': {
      let none = 1
      for (let r = move.primaryRank + 1; r < NRANKS; r++)
        if (counts[r] >= 2) none *= 1 - probDrawAtLeast(counts[r], total, h, 2)
      p = 1 - none
      break
    }
    case 'triple': {
      let none = 1
      for (let r = move.primaryRank + 1; r < NRANKS; r++)
        if (counts[r] >= 3) none *= 1 - probDrawAtLeast(counts[r], total, h, 3)
      p = 1 - none
      break
    }
    case 'four': {
      // A higher tứ quý is needed (extremely rare); approximate.
      let none = 1
      for (let r = move.primaryRank + 1; r < NRANKS; r++)
        if (counts[r] === 4) none *= 1 - probDrawAtLeast(4, total, h, 4)
      p = 1 - none
      break
    }
    case 'straight': {
      // Loose: a higher straight needs cards above the top + at least `len` cards.
      const top = strength(move.cards[move.cards.length - 1])
      const K = unseen.filter(c => strength(c) > top).length
      p = probDrawAtLeast(K, total, h, move.cardCount)
      break
    }
    case 'pairsRun': {
      p = h >= move.cardCount ? 0.05 : 0
      break
    }
  }

  // Bomb cuts: a 2 (single/pair) or a bomb on the table can be chopped by a bomb.
  const cuttable = move.cards.some(c => c.rank === R2) || move.isBomb
  if (cuttable) {
    let bombChance = 0
    for (let r = 0; r < R2; r++) if (counts[r] === 4) bombChance = Math.max(bombChance, probDrawAtLeast(4, total, h, 4))
    p = 1 - (1 - p) * (1 - bombChance)
  }
  return Math.max(0, Math.min(1, p))
}

/**
 * Estimated probability that AT LEAST ONE opponent can beat `move` if the bot leads
 * it (1 − this = the bot's chance of keeping control). Opponents draw from the same
 * unseen pool, treated independently — an accepted heuristic simplification.
 */
export function chanceOpponentBeats(view: PolicyView, move: LegalMove): number {
  const unseen = unseenCards(view)
  const total = unseen.length
  if (total === 0) return 0
  const counts = rankCountsOf(unseen)

  let pNobody = 1
  for (const opp of view.opponents) {
    pNobody *= 1 - oppBeatProb(move, total, unseen, counts, opp.cardsLeft)
  }
  return 1 - pNobody
}

/** 1 − chanceOpponentBeats — the bot's estimated chance of keeping the lead. */
export function keepsControlProbability(view: PolicyView, move: LegalMove): number {
  return 1 - chanceOpponentBeats(view, move)
}

// Readable probability snapshot for explanations / opponent profiling.
export interface OpponentEstimates {
  unseenCount: number
  twosUnplayed: number
  bombsPossible: boolean
  mostDangerous: { seat: number; cardsLeft: number } | null
}

export function opponentEstimates(view: PolicyView): OpponentEstimates {
  const unseen = unseenCards(view)
  const twosUnplayed = unseen.filter(c => c.rank === R2).length
  const counts = rankCountsOf(unseen)
  const bombsPossible = counts.some(n => n >= 4)
  let mostDangerous: { seat: number; cardsLeft: number } | null = null
  for (const o of view.opponents) {
    if (!mostDangerous || o.cardsLeft < mostDangerous.cardsLeft) mostDangerous = { seat: o.seat, cardsLeft: o.cardsLeft }
  }
  return { unseenCount: unseen.length, twosUnplayed, bombsPossible, mostDangerous }
}

// Keep SUITS referenced so the deck model stays in lock-step with the engine.
export const SUIT_COUNT = SUITS.length
