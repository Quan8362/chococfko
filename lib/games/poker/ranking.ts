// ── Poker RANKING / leaderboard metrics (PURE, integer-first, anti-abuse aware) ────────
//
// PURE module — no React, no Supabase, no clock. Ranking is ANALYTICS: it reads aggregated
// per-player results and produces a comparable ordering. It NEVER mutates a wallet or a
// stack — the authoritative coin movement stays inside the SECURITY DEFINER RPCs.
//
// DESIGN LAW (ranking-definition.md):
//   • Wallet balance is NEVER a skill rank. A big balance means "played a lot / got a big
//     signup grant", not "good". Balance ranking would directly reward chip-dumping and
//     multi-accounting (fund one account from many). So the ranked metrics below are all
//     RATE or NET-RESULT metrics, gated by a minimum sample AND a minimum number of
//     DISTINCT opponents, so a farm of colluding accounts cannot manufacture a rank.
//   • The primary skill metric is win-rate in big blinds per 100 hands (bb/100), which is
//     stake-independent (a 100-coin BB win and a 200,000-coin BB win both count as 1 bb).
//
// Inputs are aggregated upstream (a trusted server view over poker_hand_settlements /
// poker_actions). This module only ranks + flags; it does not compute the aggregates from
// raw hands, so it has no DB dependency and is fully unit-testable.

// The metrics an admin may choose as the PUBLISHED leaderboard sort. `net_profit` is offered
// for internal/ops dashboards but SHOULD NOT be the public metric (see collusion note).
export type PokerRankingMetric =
  | 'bb_per_100'          // primary skill metric: big blinds won per 100 hands (rate)
  | 'net_bb_won'          // total big blinds won (volume-weighted; favours grinders)
  | 'hands_played'        // pure participation (no skill signal, cannot be gamed for coins)
  | 'showdown_win_rate'   // fraction of showdowns reached that were won
  | 'biggest_pot_bb'      // single biggest pot won, in big blinds (fun stat, not skill)
  | 'net_profit_chips'    // raw coin profit — INTERNAL ONLY (dumping-sensitive)

export const PUBLIC_RANKING_METRICS: readonly PokerRankingMetric[] = [
  'bb_per_100',
  'net_bb_won',
  'hands_played',
  'showdown_win_rate',
  'biggest_pot_bb',
] as const

// Aggregated per-player stats for a ranking window (a season, or all-time). All coin/bb
// fields are signed INTEGERS. Big-blind results are carried in HUNDREDTHS of a big blind
// (bb × 100) so a normalized rate never needs floating-point accumulation upstream.
export interface PlayerRankStats {
  readonly userId: string
  readonly handsPlayed: number          // hands dealt into (>= 0)
  readonly showdownsSeen: number        // hands reaching showdown for this player
  readonly showdownsWon: number         // of those, how many were won (>= 0, <= showdownsSeen)
  readonly netBbHundredths: number      // signed: (chips won − chips staked) normalized to bb×100
  readonly netProfitChips: number       // signed raw coin profit (info/ops only, NOT public-ranked)
  readonly biggestPotBbHundredths: number // biggest single pot WON, in bb×100 (>= 0)
  readonly distinctOpponents: number    // number of distinct other players faced (>= 0)
  readonly sessionsCount: number        // distinct sit-down sessions (>= 0)
}

// Eligibility gate — a player must clear BOTH before appearing on a skill leaderboard.
// Rate metrics are meaningless (and abusable) on tiny samples, and the distinct-opponent
// floor is the core anti-farm control: two colluding accounts can never satisfy it.
export interface RankEligibility {
  readonly minHands: number             // e.g. 500 — enough to blunt variance
  readonly minDistinctOpponents: number // e.g. 8 — defeats 2-account chip farms
}

export const DEFAULT_RANK_ELIGIBILITY: RankEligibility = {
  minHands: 500,
  minDistinctOpponents: 8,
}

// ── Derived per-player figures (display analytics — floats allowed here, never coins) ──

// Big blinds won per 100 hands. 0 hands → 0 (also gated out by eligibility upstream).
export function bbPer100(s: PlayerRankStats): number {
  if (s.handsPlayed <= 0) return 0
  // netBbHundredths is bb×100; dividing by hands and NOT re-scaling gives bb/100 directly.
  return s.netBbHundredths / s.handsPlayed
}

export function netBbWon(s: PlayerRankStats): number {
  return s.netBbHundredths / 100
}

export function biggestPotBb(s: PlayerRankStats): number {
  return s.biggestPotBbHundredths / 100
}

// Fraction of reached showdowns that were won, in [0,1]. No showdowns → 0.
export function showdownWinRate(s: PlayerRankStats): number {
  if (s.showdownsSeen <= 0) return 0
  return s.showdownsWon / s.showdownsSeen
}

export function isRankEligible(s: PlayerRankStats, elig: RankEligibility = DEFAULT_RANK_ELIGIBILITY): boolean {
  return s.handsPlayed >= elig.minHands && s.distinctOpponents >= elig.minDistinctOpponents
}

// The comparable sort key for a metric (higher = better). Returned as a plain number;
// ties are broken deterministically by hands played then userId in rankPlayers.
export function metricValue(s: PlayerRankStats, metric: PokerRankingMetric): number {
  switch (metric) {
    case 'bb_per_100':        return bbPer100(s)
    case 'net_bb_won':        return netBbWon(s)
    case 'hands_played':      return s.handsPlayed
    case 'showdown_win_rate': return showdownWinRate(s)
    case 'biggest_pot_bb':    return biggestPotBb(s)
    case 'net_profit_chips':  return s.netProfitChips
  }
}

export interface RankedEntry {
  readonly rank: number            // 1-based
  readonly userId: string
  readonly metric: PokerRankingMetric
  readonly value: number
  readonly stats: PlayerRankStats
}

// Rank a population by `metric`. `hands_played` (participation) and 'net_profit_chips'
// intentionally SKIP the skill-eligibility gate — participation is not a skill claim, and
// the raw-profit metric is internal-only. Every skill metric is gated. Sort is stable and
// deterministic: value desc, then handsPlayed desc, then userId asc.
export function rankPlayers(
  players: readonly PlayerRankStats[],
  metric: PokerRankingMetric,
  elig: RankEligibility = DEFAULT_RANK_ELIGIBILITY,
): RankedEntry[] {
  const gated = metric === 'hands_played' || metric === 'net_profit_chips'
  const pool = gated ? players : players.filter((p) => isRankEligible(p, elig))
  const sorted = [...pool].sort((a, b) => {
    const dv = metricValue(b, metric) - metricValue(a, metric)
    if (dv !== 0) return dv
    if (b.handsPlayed !== a.handsPlayed) return b.handsPlayed - a.handsPlayed
    return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0
  })
  return sorted.map((stats, i) => ({
    rank: i + 1,
    userId: stats.userId,
    metric,
    value: metricValue(stats, metric),
    stats,
  }))
}

// ── Collusion / chip-dumping risk heuristic ────────────────────────────────────────────
//
// A pure, explainable signal for the ops dashboard — NOT an automatic punishment. It looks
// at how concentrated a player's profit is against a single counterparty and how few
// distinct opponents produced most of the volume. A real grinder wins a little from many
// opponents; a dump collector wins almost everything from one or two feeders.

export interface CollusionInput {
  readonly userId: string
  readonly netProfitChips: number             // signed
  // Profit attributed per opposing user: userId → signed chips transferred (this player's gain).
  readonly perOpponentProfitChips: ReadonlyArray<{ readonly opponentId: string; readonly chips: number }>
  readonly handsPlayed: number
  readonly distinctOpponents: number
}

export interface CollusionSignal {
  readonly userId: string
  readonly score: number                       // 0..1, higher = more suspicious
  readonly topCounterpartyShare: number        // share of positive winnings from the single biggest feeder
  readonly reasons: readonly string[]          // human-readable codes
}

// Heuristic score in [0,1]. Combines (a) how much of all winnings came from ONE opponent and
// (b) how few opponents the player faced. Deterministic and side-effect free.
export function collusionRiskScore(input: CollusionInput): CollusionSignal {
  const reasons: string[] = []
  const wins = input.perOpponentProfitChips.filter((o) => o.chips > 0)
  const totalWon = wins.reduce((acc, o) => acc + o.chips, 0)
  let topShare = 0
  if (totalWon > 0) {
    const top = wins.reduce((mx, o) => (o.chips > mx ? o.chips : mx), 0)
    topShare = top / totalWon
  }
  if (topShare >= 0.7) reasons.push('single_counterparty_dominant')
  if (input.distinctOpponents > 0 && input.distinctOpponents < 4) reasons.push('few_distinct_opponents')
  if (input.handsPlayed > 0 && input.handsPlayed < 100 && input.netProfitChips > 0) reasons.push('fast_large_winner')

  // Blend: 70% concentration, 30% opponent scarcity (fewer opponents → higher).
  const scarcity = input.distinctOpponents <= 0 ? 1 : Math.min(1, 4 / input.distinctOpponents) - 0.25
  const score = Math.max(0, Math.min(1, 0.7 * topShare + 0.3 * Math.max(0, scarcity)))
  return { userId: input.userId, score, topCounterpartyShare: topShare, reasons }
}
