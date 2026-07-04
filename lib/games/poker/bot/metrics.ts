// ── Poker BOT baseline metrics (pure aggregation) ─────────────────────────────────────
//
// PURE module — no React, no Supabase, no clock, no I/O. Deterministic. Tested by metrics.test.ts.
//
// Establishes a trustworthy, REPRODUCIBLE behavioural baseline for the existing policies BEFORE
// any strategy calibration (Prompt 27C-A). It consumes ONLY public, street-attributed action
// history + net stack deltas (both already public facts the whole table saw) and aggregates the
// classic poker style metrics per DIFFICULTY: VPIP, PFR, 3-bet, per-street action frequencies,
// all-in / showdown frequency, a rough showdown win-rate, and a coarse bet-sizing distribution.
//
// 🔴 This module reads NO cards and NO hidden state. It is a measurement tool, not a policy input —
// nothing here ever flows back into a `BotObservation`. Several metrics are deliberately COARSE and
// their caveats are documented on each field (see docs/poker/bots/performance-baseline.md &
// 27c-a-baseline.md); do NOT read a strength ordering out of them.

import type { BotDifficulty } from './policy.ts'
import type { PublicActionEntry } from './observation.ts'

// Coarse pot-fraction buckets for aggressive sizing. `potBefore` is reconstructed by walking the
// hand (initial pot = posted blinds), so this is an APPROXIMATION — good enough to see whether a
// policy varies its sizing at all, not an exact sizing histogram.
export const SIZING_BUCKETS: readonly string[] = ['<=0.33p', '0.33-0.66p', '0.66-1p', '1-2p', '>2p']

function sizingBucket(fraction: number): string {
  if (fraction <= 0.33) return '<=0.33p'
  if (fraction <= 0.66) return '0.33-0.66p'
  if (fraction <= 1.0) return '0.66-1p'
  if (fraction <= 2.0) return '1-2p'
  return '>2p'
}

// Mutable accumulator for ONE difficulty. Counts are integers; ratios are derived at finalize().
interface DiffAccumulator {
  handsDealtIn: number // hands this difficulty was dealt into (across all its seats)
  vpip: number // hands it voluntarily put chips in preflop (call/bet/raise/all_in preflop)
  pfr: number // hands it raised/bet/all-in preflop
  threeBet: number // hands it made a preflop RE-raise (2nd+ aggressive preflop action)
  decisions: number // total voluntary decisions (every action it submitted, any street)
  actionCounts: Record<string, number> // action type → count (fold/check/call/bet/raise/all_in)
  allInHands: number // hands with ≥1 all-in action by this difficulty
  showdownReached: number // hands it was still contesting at showdown (dealt in, never folded)
  showdownWon: number // of those, hands it finished with a positive net delta (won or chopped up)
  sizingCounts: Record<string, number> // bucket → count of aggressive (bet/raise) actions
}

function newAccumulator(): DiffAccumulator {
  return {
    handsDealtIn: 0,
    vpip: 0,
    pfr: 0,
    threeBet: 0,
    decisions: 0,
    actionCounts: { fold: 0, check: 0, call: 0, bet: 0, raise: 0, all_in: 0 },
    allInHands: 0,
    showdownReached: 0,
    showdownWon: 0,
    sizingCounts: Object.fromEntries(SIZING_BUCKETS.map((b) => [b, 0])) as Record<string, number>,
  }
}

export interface PolicyMetricsAccumulator {
  readonly byDifficulty: Map<BotDifficulty, DiffAccumulator>
}

export function createPolicyMetrics(): PolicyMetricsAccumulator {
  return { byDifficulty: new Map() }
}

function accFor(acc: PolicyMetricsAccumulator, d: BotDifficulty): DiffAccumulator {
  let a = acc.byDifficulty.get(d)
  if (!a) {
    a = newAccumulator()
    acc.byDifficulty.set(d, a)
  }
  return a
}

// One hand's worth of public data, plus the seat→difficulty map + who reached showdown.
export interface HandMetricsInput {
  readonly history: readonly PublicActionEntry[] // public, street-attributed; NO cards
  readonly seatDifficulty: ReadonlyMap<number, BotDifficulty> // dealt-in seats → their difficulty
  readonly stackDeltas: ReadonlyMap<number, number> // net chip change this hand (Σ = 0)
  readonly wentToShowdown: boolean
  readonly smallBlind: number
  readonly bigBlind: number
}

// Fold into the accumulator the metrics from ONE completed hand. Pure w.r.t. `acc` mutation only.
export function recordHand(acc: PolicyMetricsAccumulator, input: HandMetricsInput): void {
  const { history, seatDifficulty, stackDeltas, wentToShowdown, smallBlind, bigBlind } = input

  // Per-seat, per-hand tallies (so a metric counts a HAND once, not each action).
  const dealtIn = new Set<number>(seatDifficulty.keys())
  const folded = new Set<number>()
  const vpipSeats = new Set<number>()
  const pfrSeats = new Set<number>()
  const threeBetSeats = new Set<number>()
  const allInSeats = new Set<number>()

  // Reconstruct a running pot to size aggressive actions. Blinds are posted before any history
  // entry, so seed the pot with them (an approximation when a blind is short/all-in).
  let runningPot = smallBlind + bigBlind
  let preflopAggressions = 0

  for (const e of history) {
    const d = seatDifficulty.get(e.seatIndex)
    if (d === undefined) continue // a seat we are not measuring (should not happen in a bot sim)
    const a = accFor(acc, d)
    a.decisions += 1
    a.actionCounts[e.type] = (a.actionCounts[e.type] ?? 0) + 1

    const aggressive = e.type === 'bet' || e.type === 'raise' || e.type === 'all_in'

    if (e.type === 'fold') folded.add(e.seatIndex)
    if (e.type === 'all_in') allInSeats.add(e.seatIndex)

    if (e.street === 'PREFLOP') {
      if (e.type === 'call' || aggressive) vpipSeats.add(e.seatIndex)
      if (aggressive) {
        pfrSeats.add(e.seatIndex)
        preflopAggressions += 1
        // The big blind is the "1st bet"; the first raise is a 2-bet; a 2nd+ aggressive action is
        // a 3-bet(+). Definition documented in docs/poker/bots/27c-a-baseline.md.
        if (preflopAggressions >= 2) threeBetSeats.add(e.seatIndex)
      }
    }

    // Sizing for a real aggressive action, relative to the pot BEFORE it.
    if (e.type === 'bet' || e.type === 'raise') {
      const potBefore = runningPot > 0 ? runningPot : bigBlind
      a.sizingCounts[sizingBucket(e.addedChips / potBefore)] += 1
    }
    runningPot += e.addedChips
  }

  // Roll per-hand seat tallies up into the difficulty accumulators.
  for (const seat of Array.from(dealtIn)) {
    const d = seatDifficulty.get(seat)!
    const a = accFor(acc, d)
    a.handsDealtIn += 1
    if (vpipSeats.has(seat)) a.vpip += 1
    if (pfrSeats.has(seat)) a.pfr += 1
    if (threeBetSeats.has(seat)) a.threeBet += 1
    if (allInSeats.has(seat)) a.allInHands += 1
    // Showdown = dealt in, never folded, and the hand actually reached a showdown.
    if (wentToShowdown && !folded.has(seat)) {
      a.showdownReached += 1
      if ((stackDeltas.get(seat) ?? 0) > 0) a.showdownWon += 1
    }
  }
}

export interface PolicyMetrics {
  readonly difficulty: BotDifficulty
  readonly handsDealtIn: number
  readonly decisions: number
  // Percentages in [0,100], rounded to 2 dp. VPIP/PFR/3bet are per HAND dealt in.
  readonly vpipPct: number
  readonly pfrPct: number
  readonly threeBetPct: number
  readonly allInHandPct: number
  readonly showdownPct: number // of hands dealt in, reached showdown
  readonly showdownWinPct: number // of showdowns reached, finished with a positive delta (coarse)
  // Per-decision action mix (shares of every action it submitted), each in [0,1].
  readonly actionMix: Readonly<Record<string, number>>
  // The single most-frequent action's share — a crude "repetitiveness" signal (higher = more
  // predictable / less diverse). NOT a strength metric.
  readonly topActionShare: number
  // Coarse aggressive-sizing distribution (shares over bet/raise actions), each in [0,1].
  readonly sizingMix: Readonly<Record<string, number>>
}

function pct(num: number, den: number): number {
  if (den <= 0) return 0
  return Math.round((num / den) * 10000) / 100
}

function share(num: number, den: number): number {
  if (den <= 0) return 0
  return Math.round((num / den) * 10000) / 10000
}

export function finalizePolicyMetrics(acc: PolicyMetricsAccumulator): PolicyMetrics[] {
  const out: PolicyMetrics[] = []
  for (const [difficulty, a] of Array.from(acc.byDifficulty)) {
    const totalActions = a.decisions
    const actionMix: Record<string, number> = {}
    let top = 0
    for (const [type, n] of Array.from(Object.entries(a.actionCounts))) {
      const s = share(n as number, totalActions)
      actionMix[type] = s
      if (s > top) top = s
    }
    const totalAggr = Object.values(a.sizingCounts).reduce((s: number, n) => s + (n as number), 0)
    const sizingMix: Record<string, number> = {}
    for (const b of SIZING_BUCKETS) sizingMix[b] = share(a.sizingCounts[b] ?? 0, totalAggr)

    out.push({
      difficulty,
      handsDealtIn: a.handsDealtIn,
      decisions: a.decisions,
      vpipPct: pct(a.vpip, a.handsDealtIn),
      pfrPct: pct(a.pfr, a.handsDealtIn),
      threeBetPct: pct(a.threeBet, a.handsDealtIn),
      allInHandPct: pct(a.allInHands, a.handsDealtIn),
      showdownPct: pct(a.showdownReached, a.handsDealtIn),
      showdownWinPct: pct(a.showdownWon, a.showdownReached),
      actionMix,
      topActionShare: top,
      sizingMix,
    })
  }
  // Stable order for reproducible reports.
  out.sort((x, y) => x.difficulty.localeCompare(y.difficulty))
  return out
}
