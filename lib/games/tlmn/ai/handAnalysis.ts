// ─────────────────────────────────────────────────────────────────────────────
// Hand-decomposition solver — the analytical core behind move scoring.
//
// estimateMinimumTurnsToFinish(hand) returns the TRUE minimum number of plays to
// empty a hand if unobstructed. It is NOT greedy: it branches on every legal play
// that covers the lowest remaining rank (a standard exact set-cover-by-smallest-
// element technique) and memoizes on the rank-count signature, so it explores
// pair-vs-single-vs-straight-vs-run trade-offs and returns the optimum.
//
// Rationale: a play must eventually consume the lowest remaining rank, so it is
// sufficient to branch on how that rank's first card is covered. This makes the
// search complete (finds the minimum) while keeping the state space small (distinct
// count vectors), and the memo makes repeated lookups in scoring cheap.
// ─────────────────────────────────────────────────────────────────────────────
import { type Card, RANKS, R2 } from '../engine.ts'

export type PlayShape = 'single' | 'pair' | 'triple' | 'four' | 'straight' | 'pairsRun'
export interface DecompPlay { type: PlayShape; startRank: number; length: number; size: number }
export interface HandDecomposition { turns: number; plays: DecompPlay[] }

export interface HandAnalysis {
  minTurns: number
  decomposition: DecompPlay[]
  singles: number
  pairs: number
  triples: number
  straights: number
  pairsRuns: number
  bombs: number            // tứ quý + ≥3-pair đôi thông
  isolatedLowSingles: number // singles below rank "10" left as standalone plays
  highCards: number        // K/A/2 still held (rank ≥ index of "K")
}

const NRANKS = RANKS.length // 13
const R_KING = RANKS.indexOf('K') // 10

function countsOf(cards: Card[]): number[] {
  const c = new Array(NRANKS).fill(0)
  for (const card of cards) c[card.rank]++
  return c
}

function key(counts: number[]): string {
  return counts.join(',')
}

const memo = new Map<string, HandDecomposition>()

// Branch on every legal play covering the lowest remaining rank, recurse, memoize.
function solve(counts: number[]): HandDecomposition {
  const k = key(counts)
  const cached = memo.get(k)
  if (cached) return cached

  let low = -1
  for (let r = 0; r < NRANKS; r++) if (counts[r] > 0) { low = r; break }
  if (low === -1) { const empty = { turns: 0, plays: [] }; memo.set(k, empty); return empty }

  let best: HandDecomposition | null = null
  const consider = (removed: () => void, restore: () => void, play: DecompPlay) => {
    removed()
    const sub = solve(counts)
    const cand: HandDecomposition = { turns: sub.turns + 1, plays: [play, ...sub.plays] }
    if (!best || cand.turns < best.turns) best = cand
    restore()
  }

  const n = counts[low]
  // Same-rank groups covering `low` (single / pair / triple / four).
  for (let size = 1; size <= n; size++) {
    consider(
      () => { counts[low] -= size },
      () => { counts[low] += size },
      { type: size === 1 ? 'single' : size === 2 ? 'pair' : size === 3 ? 'triple' : 'four', startRank: low, length: 1, size },
    )
  }

  // Straights starting at `low` (length ≥3, consecutive, exclude the 2).
  if (low < R2) {
    let len = 0
    for (let r = low; r < R2 && counts[r] >= 1; r++) len++
    for (let L = 3; L <= len; L++) {
      consider(
        () => { for (let r = low; r < low + L; r++) counts[r] -= 1 },
        () => { for (let r = low; r < low + L; r++) counts[r] += 1 },
        { type: 'straight', startRank: low, length: L, size: L },
      )
    }
  }

  // Pairs-runs starting at `low` (≥3 consecutive ranks each with ≥2, exclude the 2).
  if (low < R2) {
    let runs = 0
    for (let r = low; r < R2 && counts[r] >= 2; r++) runs++
    for (let K = 3; K <= runs; K++) {
      consider(
        () => { for (let r = low; r < low + K; r++) counts[r] -= 2 },
        () => { for (let r = low; r < low + K; r++) counts[r] += 2 },
        { type: 'pairsRun', startRank: low, length: K, size: 2 * K },
      )
    }
  }

  const result = best ?? { turns: Infinity, plays: [] }
  memo.set(k, result)
  return result
}

/** Minimum number of plays to empty `hand` if unobstructed (memoized, exact). */
export function estimateMinimumTurnsToFinish(hand: Card[]): number {
  if (hand.length === 0) return 0
  return solve(countsOf(hand)).turns
}

/** Full structural analysis using an optimal (min-turns) decomposition. */
export function analyzeHand(hand: Card[]): HandAnalysis {
  if (hand.length === 0) {
    return { minTurns: 0, decomposition: [], singles: 0, pairs: 0, triples: 0, straights: 0, pairsRuns: 0, bombs: 0, isolatedLowSingles: 0, highCards: 0 }
  }
  const decomp = solve(countsOf(hand))
  let singles = 0, pairs = 0, triples = 0, straights = 0, pairsRuns = 0, bombs = 0, isolatedLowSingles = 0
  for (const p of decomp.plays) {
    if (p.type === 'single') { singles++; if (p.startRank < RANKS.indexOf('10')) isolatedLowSingles++ }
    else if (p.type === 'pair') pairs++
    else if (p.type === 'triple') triples++
    else if (p.type === 'four') bombs++
    else if (p.type === 'straight') straights++
    else if (p.type === 'pairsRun') { pairsRuns++; if (p.length >= 3) bombs++ }
  }
  let highCards = 0
  for (const c of hand) if (c.rank >= R_KING) highCards++
  return { minTurns: decomp.turns, decomposition: decomp.plays, singles, pairs, triples, straights, pairsRuns, bombs, isolatedLowSingles, highCards }
}

/** Clear the memo (test isolation / long-running processes). Pure caches are safe to keep. */
export function _clearHandMemo(): void { memo.clear() }
