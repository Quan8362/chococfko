// ── Poker BOT board-texture & made-hand/draw classification (pure) ─────────────────────
//
// PURE module — no React, no Supabase, no clock, no I/O. Deterministic. Tested by board.test.ts.
//
// 🔴 FAIRNESS: every function here reads ONLY the bot's OWN two hole cards + the REVEALED board —
// exactly what a human in the seat sees. It never touches an opponent's cards, the undealt deck,
// or the shuffle seed. It computes NO probabilities that require hidden state; it is a cheap,
// public classification of "what is this board" and "what do I have / draw to" that lets the
// strategy pick an explainable line (c-bet a dry board, semi-bluff a draw, protection-bet a
// vulnerable made hand on a wet board) WITHOUT spending Monte-Carlo CPU on facts a glance settles.
//
// This is a "cached public-state classification" (27C-A performance plan): the strategy classifies
// the board ONCE per decision and reuses it, instead of re-deriving texture inside every branch.

import type { Card } from '../types.ts'
import { rankValue, suitOf } from '../deck.ts'
import { evaluateHand, HandCategory, type HandCategory as HandCategoryT } from '../evaluator.ts'

// ── Board texture ────────────────────────────────────────────────────────────────────────

export interface BoardTexture {
  readonly cardCount: number // 0 (preflop) .. 5
  readonly paired: boolean // the board itself shows a pair (or better)
  readonly monotone: boolean // 3+ board cards, all one suit
  readonly twoTone: boolean // a two-suit board where a flush draw is live (dominant suit ≥ 2)
  readonly rainbow: boolean // no two board cards share a suit
  readonly connected: boolean // straight-heavy (small spread among the top board ranks)
  readonly highCard: number // rank value of the highest board card (0 when no board)
  // 0 (bone-dry) .. 1 (very draw-heavy). A heuristic blend of suitedness + connectedness used to
  // decide protection sizing / bluff frequency — NOT an equity.
  readonly wetness: number
}

function suitCounts(cards: readonly Card[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const c of cards) m.set(suitOf(c), (m.get(suitOf(c)) ?? 0) + 1)
  return m
}

// Distinct rank values present, ascending. Aces are counted BOTH high (14) and low (1) so wheel
// straights (A-2-3-4-5) are detected without a special case.
function rankSet(cards: readonly Card[]): Set<number> {
  const s = new Set<number>()
  for (const c of cards) {
    const v = rankValue(c)
    s.add(v)
    if (v === 14) s.add(1)
  }
  return s
}

export function classifyBoard(board: readonly Card[]): BoardTexture {
  const n = board.length
  if (n === 0) {
    return { cardCount: 0, paired: false, monotone: false, twoTone: false, rainbow: false, connected: false, highCard: 0, wetness: 0 }
  }

  const ranks = board.map(rankValue)
  const uniqueRanks = new Set(ranks)
  const paired = uniqueRanks.size < ranks.length

  const suits = suitCounts(board)
  const maxSuit = Math.max(...Array.from(suits.values()))
  const monotone = n >= 3 && maxSuit === n
  const rainbow = suits.size === n // every card a distinct suit
  const twoTone = !monotone && maxSuit >= 2 && !rainbow

  // Connectedness: how tightly packed the (distinct) board ranks are. A 3-card span ≤ 4 is
  // "connected" (e.g. 9-8-6 spans 3), a wide spread (K-8-2) is not.
  const sorted = Array.from(uniqueRanks).sort((a, b) => a - b)
  const span = sorted.length >= 2 ? sorted[sorted.length - 1] - sorted[0] : 0
  const connected = sorted.length >= 2 && span <= 4

  const highCard = Math.max(...ranks)

  // Wetness blend: flush-ness (dominant suit share) + straight-ness (inverse span) + a paired
  // penalty (a paired board is less draw-heavy for straights/flushes). Bounded to [0,1].
  const flushness = n >= 3 ? Math.max(0, (maxSuit - 1) / (n - 1)) : maxSuit >= 2 ? 0.5 : 0
  const straightness = sorted.length >= 2 ? Math.max(0, 1 - (span - 1) / 8) : 0
  let wetness = 0.6 * flushness + 0.4 * straightness
  if (paired) wetness *= 0.7
  wetness = Math.min(1, Math.max(0, wetness))

  return { cardCount: n, paired, monotone, twoTone, rainbow, connected, highCard, wetness }
}

// ── Made-hand + draw classification (own cards vs the board) ───────────────────────────────

export type MadeTier = 'nutlike' | 'strong' | 'medium' | 'weak' | 'air'
export type PairKind = 'overpair' | 'top' | 'middle' | 'bottom' | 'none'

export interface HandClass {
  readonly category: HandCategoryT // best 5-card category using own + board
  readonly madeTier: MadeTier
  readonly pairKind: PairKind
  readonly topPairOrBetter: boolean
  readonly flushDraw: boolean // exactly four to a flush (a made flush is NOT a draw)
  readonly openEnded: boolean // open-ended straight draw (8 outs shape)
  readonly gutshot: boolean // inside straight draw (4 outs shape)
  readonly overcards: number // hole ranks strictly above the top board card (0..2), unpaired only
  readonly drawStrength: number // 0..1 heuristic combining live draws (semi-bluff signal)
}

// The strongest PAIR relationship of a hole card to the board (over/top/middle/bottom), used to
// separate a strong top pair from a weak underpair without a Monte-Carlo call.
function classifyPair(hole: readonly [Card, Card], board: readonly Card[]): PairKind {
  const boardRanks = board.map(rankValue).sort((a, b) => b - a) // descending
  if (boardRanks.length === 0) return 'none'
  const top = boardRanks[0]
  const h0 = rankValue(hole[0])
  const h1 = rankValue(hole[1])

  // Pocket pair: over the board (overpair) or below the top card (an underpair plays like middle).
  if (h0 === h1) {
    if (h0 > top) return 'overpair'
    return h0 >= boardRanks[boardRanks.length - 1] ? 'middle' : 'bottom'
  }

  // A hole card that pairs a board rank.
  const paired: number[] = []
  for (const h of [h0, h1]) if (boardRanks.includes(h)) paired.push(h)
  if (paired.length === 0) return 'none'
  const best = Math.max(...paired)
  if (best === top) return 'top'
  if (best === boardRanks[boardRanks.length - 1]) return 'bottom'
  return 'middle'
}

// Straight-draw shape from the combined rank set. Returns whether an open-ended (8-out) or an
// inside/gutshot (4-out) draw is present — never both flags for the same shape (oesd wins).
function straightDraw(allRanks: Set<number>): { openEnded: boolean; gutshot: boolean } {
  // Already a made straight? Then it is not a draw.
  for (let lo = 1; lo <= 10; lo++) {
    let run = 0
    for (let r = lo; r <= lo + 4; r++) if (allRanks.has(r)) run++
    if (run === 5) return { openEnded: false, gutshot: false }
  }

  // Open-ended: four consecutive ranks present, extendable at a live (2..14) end. Exclude the
  // A-high and wheel ends that cannot extend (KQJT extends only down, A-high edge handled by run).
  let openEnded = false
  for (let lo = 2; lo <= 11; lo++) {
    const four = [lo, lo + 1, lo + 2, lo + 3]
    if (four.every((r) => allRanks.has(r))) {
      const lowEnd = lo - 1
      const highEnd = lo + 4
      // Genuine two-way draw needs BOTH ends inside the playable range (a T-J-Q-K only makes a
      // one-ended draw and is treated as a gutshot-strength four-outer below).
      if (lowEnd >= 1 && highEnd <= 14) openEnded = true
    }
  }
  if (openEnded) return { openEnded: true, gutshot: false }

  // Gutshot: any 5-window with exactly four of the five ranks present (a single inside gap).
  for (let lo = 1; lo <= 10; lo++) {
    let count = 0
    for (let r = lo; r <= lo + 4; r++) if (allRanks.has(r)) count++
    if (count === 4) return { openEnded: false, gutshot: true }
  }
  return { openEnded: false, gutshot: false }
}

// Classify the bot's holding on the given (revealed) board. Requires a 3+ card board (flop+),
// because a made-hand category needs five cards; preflop strength is handled elsewhere.
export function classifyHand(hole: readonly [Card, Card], board: readonly Card[]): HandClass {
  if (board.length < 3) {
    throw new Error('classifyHand: needs a flop or later board (3+ cards)')
  }
  const made = evaluateHand(hole, board)
  const pairKind = classifyPair(hole, board)

  const all = [...hole, ...board]
  const suits = suitCounts(all)
  const maxSuit = Math.max(...Array.from(suits.values()))
  // A four-flush (with a live 5th to come) is a draw; five is a made flush (not a draw).
  const flushDraw = board.length < 5 && maxSuit === 4

  const draw = board.length < 5 ? straightDraw(rankSet(all)) : { openEnded: false, gutshot: false }

  const topBoard = Math.max(...board.map(rankValue))
  let overcards = 0
  if (pairKind === 'none' && made.category === HandCategory.HighCard) {
    for (const h of hole) if (rankValue(h) > topBoard) overcards++
  }

  // Draw strength blend (semi-bluff signal): a flush draw is the strongest single draw, an OESD
  // next, a gutshot weakest; overcards add a little. Combos (flush + straight) stack toward 1.
  let drawStrength = 0
  if (flushDraw) drawStrength += 0.55
  if (draw.openEnded) drawStrength += 0.45
  else if (draw.gutshot) drawStrength += 0.18
  if (overcards === 2) drawStrength += 0.12
  else if (overcards === 1) drawStrength += 0.05
  drawStrength = Math.min(1, drawStrength)

  const madeTier = tierFor(made.category, pairKind)
  const topPairOrBetter =
    made.category >= HandCategory.TwoPair || pairKind === 'overpair' || pairKind === 'top'

  return {
    category: made.category,
    madeTier,
    pairKind,
    topPairOrBetter,
    flushDraw,
    openEnded: draw.openEnded,
    gutshot: draw.gutshot,
    overcards,
    drawStrength,
  }
}

function tierFor(category: HandCategoryT, pairKind: PairKind): MadeTier {
  if (category >= HandCategory.FullHouse) return 'nutlike'
  if (category >= HandCategory.ThreeOfAKind) return 'strong' // set/trips, straight, flush
  if (category === HandCategory.TwoPair) return 'strong'
  if (category === HandCategory.Pair) {
    if (pairKind === 'overpair' || pairKind === 'top') return 'medium'
    return 'weak' // middle/bottom pair (or an underpair)
  }
  return 'air' // high card (a draw is scored separately via drawStrength)
}
