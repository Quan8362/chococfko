// ─────────────────────────────────────────────────────────────────────────────
// Statistical comparison of two policies run over the SAME deals + seat
// assignments (paired design — the strongest, lowest-variance way to detect a real
// skill difference). For each (seed, candSeat) we have a win indicator for both
// policies; the pairing cancels deal luck. We report:
//   • the paired win-rate difference (candidate − baseline)
//   • a paired bootstrap 95% confidence interval (resamples the pairs)
//   • a normal-approximation CI on the paired mean (McNemar-style)
// Promotion requires the LOWER bound of the 95% CI for the improvement to be > 0.
// ─────────────────────────────────────────────────────────────────────────────
import { type PerGameRecord } from './evaluation.ts'
import { makeRng } from '../ai/seededRandom.ts'

export interface PairedResult {
  pairs: number
  candWinRate: number
  baseWinRate: number
  diff: number               // candidate − baseline (paired mean of win indicators)
  bootstrapLow: number       // 2.5th percentile of resampled diffs
  bootstrapHigh: number      // 97.5th percentile
  normalLow: number          // diff − 1.96·SE
  normalHigh: number         // diff + 1.96·SE
  se: number
  significant: boolean       // bootstrapLow > 0 (candidate strictly better at 95%)
  discordantCandWins: number // pairs candidate won but baseline lost
  discordantBaseWins: number // pairs baseline won but candidate lost
}

function key(r: PerGameRecord): string { return `${r.seed}#${r.candSeat}#${r.fieldKey}` }

/** Pair candidate vs baseline per-game records by (seed, seat, field) and compare. */
export function pairedWinRateDiff(
  candidate: PerGameRecord[],
  baseline: PerGameRecord[],
  opts: { bootstrap?: number; seed?: string | number } = {},
): PairedResult {
  const baseMap = new Map<string, PerGameRecord>()
  for (const r of baseline) baseMap.set(key(r), r)

  const diffs: number[] = []
  let candWins = 0
  let baseWins = 0
  let discCand = 0
  let discBase = 0
  for (const c of candidate) {
    const b = baseMap.get(key(c))
    if (!b) continue
    const cw = c.won ? 1 : 0
    const bw = b.won ? 1 : 0
    diffs.push(cw - bw)
    candWins += cw
    baseWins += bw
    if (cw === 1 && bw === 0) discCand++
    if (cw === 0 && bw === 1) discBase++
  }

  const n = diffs.length
  const mean = n ? diffs.reduce((a, b) => a + b, 0) / n : 0
  const variance = n > 1 ? diffs.reduce((a, d) => a + (d - mean) ** 2, 0) / (n - 1) : 0
  const se = n ? Math.sqrt(variance / n) : 0

  // Paired bootstrap: resample pairs with replacement, recompute the mean diff.
  const B = opts.bootstrap ?? 5000
  const rng = makeRng(opts.seed ?? 'bootstrap')
  const means: number[] = new Array(B)
  for (let i = 0; i < B; i++) {
    let acc = 0
    for (let j = 0; j < n; j++) acc += diffs[(rng() * n) | 0]
    means[i] = n ? acc / n : 0
  }
  means.sort((a, b) => a - b)
  const pct = (q: number) => means[Math.min(B - 1, Math.max(0, Math.floor(q * B)))]

  return {
    pairs: n,
    candWinRate: n ? candWins / n : 0,
    baseWinRate: n ? baseWins / n : 0,
    diff: mean,
    bootstrapLow: pct(0.025),
    bootstrapHigh: pct(0.975),
    normalLow: mean - 1.96 * se,
    normalHigh: mean + 1.96 * se,
    se,
    significant: pct(0.025) > 0,
    discordantCandWins: discCand,
    discordantBaseWins: discBase,
  }
}

/** Unpaired two-proportion normal-approx CI on a single win rate (for reference). */
export function winRateCI(wins: number, games: number): { rate: number; low: number; high: number } {
  const rate = games ? wins / games : 0
  const se = games ? Math.sqrt((rate * (1 - rate)) / games) : 0
  return { rate, low: rate - 1.96 * se, high: rate + 1.96 * se }
}
