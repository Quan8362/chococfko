// ── Poker ECONOMY SIMULATION (PURE, deterministic, seeded) ─────────────────────────────
//
// PURE module — no React, no Supabase, no clock, no I/O. A modeling tool to reason about the
// coin economy BEFORE any production reward is enabled. Given a seed it is bit-for-bit
// reproducible (uses the shared mulberry32 RNG), which is what the determinism tests assert.
//
// KEY ECONOMIC INSIGHT the model encodes: poker settlement is ZERO-SUM (no rake, no ante),
// so gameplay NEVER creates or destroys coins — it only moves them between players. The ONLY
// coin sources ("faucets") are the signup grant and the busted-wallet daily recovery. So the
// total coin supply can only rise, and it rises at exactly the faucet rate. Concentration
// (a few players holding most coins) is driven by skill variance and by abuse (chip dumping),
// NOT by the settlement itself.
//
// THIS IS NOT A PREDICTION. It is a transparent what-if with explicit assumptions (see
// docs/poker/economy/simulation-assumptions.md). Behavioural inputs (activity, skill spread,
// dumping share) are guesses; treat outputs as directional, not forecast.

import { makeRng } from '../../tlmn/ai/seededRandom.ts'
import {
  POKER_ECONOMY_V1,
  buyInBoundsForTier,
  recommendTierForBalance,
  type PokerEconomyConfig,
} from '../economyConfig.ts'

// ── Scenario inputs ─────────────────────────────────────────────────────────────────────

export interface PlayerArchetype {
  readonly id: string
  readonly share: number            // fraction of the population (shares are normalized)
  readonly dailyActiveProb: number  // probability this archetype plays on a given day [0,1]
  readonly handsPerActiveDay: number // hands played on an active day (>= 0)
  readonly skillBbPer100: number    // true edge in big blinds per 100 hands (signed; sums needn't be 0)
  readonly variancePerHandBb: number // std-dev of a single hand result, in big blinds
}

export interface EconomyScenario {
  readonly name: string
  readonly days: number
  readonly initialPlayers: number
  readonly dailyNewPlayers: number  // signups per day (each gets startingCoins → inflation)
  readonly archetypes: readonly PlayerArchetype[]
  // Fraction of the population that are colluding "dumpers" who funnel a fixed chip amount to
  // a single collector each active day (models multi-account value transfer / chip dumping).
  readonly dumperShare: number
  readonly dumpChipsPerDay: number
  readonly config?: PokerEconomyConfig // defaults to v1
}

// ── Outputs ───────────────────────────────────────────────────────────────────────────

export interface DayMetrics {
  readonly day: number
  readonly players: number
  readonly totalCoins: number       // total supply across all wallets
  readonly faucetCoinsToday: number // coins minted today (signup + recovery)
  readonly recoveryClaimsToday: number
  readonly bustsToday: number        // wallets that dropped to/under the entry gate today
  readonly medianBalance: number
  readonly gini: number              // 0 (equal) .. ~1 (one holder) — coin concentration
  readonly top1PctShare: number      // fraction of all coins held by the richest 1%
  readonly top10PctShare: number
}

export interface SimulationResult {
  readonly scenario: string
  readonly seed: string | number
  readonly config: string           // config version used
  readonly days: readonly DayMetrics[]
  readonly summary: {
    readonly finalPlayers: number
    readonly finalTotalCoins: number
    readonly totalFaucetCoins: number
    readonly inflationPctTotal: number      // (final − initial supply) / initial supply × 100
    readonly avgDailyInflationPct: number
    readonly finalGini: number
    readonly finalTop1PctShare: number
    readonly totalBusts: number
    readonly totalRecoveryClaims: number
    readonly dumpedChipsTotal: number       // chips moved by colluders (transfer, not minted)
  }
}

// ── Internal player state ───────────────────────────────────────────────────────────────

interface SimPlayer {
  balance: number
  archetype: PlayerArchetype
  isDumper: boolean
  collectorIndex: number  // persistent dump target (index into players[]); -1 = none yet
  lastRecoveryDay: number // -Infinity if never
  recoveryClaims: number
}

// Standard normal via Box–Muller, deterministic given the rng.
function nextGaussian(rng: () => number): number {
  let u = 0
  let v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function normalizeShares(archetypes: readonly PlayerArchetype[]): number[] {
  const total = archetypes.reduce((a, x) => a + Math.max(0, x.share), 0)
  if (total <= 0) return archetypes.map(() => 1 / archetypes.length)
  return archetypes.map((x) => Math.max(0, x.share) / total)
}

// Gini coefficient over non-negative balances. 0 = perfectly equal, →1 = maximally unequal.
function gini(values: number[]): number {
  const n = values.length
  if (n === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const sum = sorted.reduce((a, b) => a + b, 0)
  if (sum === 0) return 0
  let cum = 0
  for (let i = 0; i < n; i++) cum += (i + 1) * sorted[i]
  // G = (2·Σ i·x_i) / (n·Σx) − (n+1)/n
  return (2 * cum) / (n * sum) - (n + 1) / n
}

function topShare(values: number[], pct: number): number {
  const n = values.length
  if (n === 0) return 0
  const sum = values.reduce((a, b) => a + b, 0)
  if (sum === 0) return 0
  const sorted = [...values].sort((a, b) => b - a)
  const k = Math.max(1, Math.floor((n * pct) / 100))
  const top = sorted.slice(0, k).reduce((a, b) => a + b, 0)
  return top / sum
}

function median(values: number[]): number {
  const n = values.length
  if (n === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(n / 2)
  return n % 2 ? sorted[mid] : Math.floor((sorted[mid - 1] + sorted[mid]) / 2)
}

// ── The simulation ──────────────────────────────────────────────────────────────────────

export function runEconomySimulation(scenario: EconomyScenario, seed: string | number): SimulationResult {
  const cfg = scenario.config ?? POKER_ECONOMY_V1
  const rng = makeRng(seed)
  const shares = normalizeShares(scenario.archetypes)
  const startCoins = cfg.faucet.startingCoins
  const entryGate = cfg.faucet.recoveryEligibilityBalance
  const recoveryCoins = cfg.faucet.dailyRecoveryCoins
  const recoveryCooldownDays = Math.max(1, Math.round(cfg.faucet.recoveryCooldownHours / 24))

  const players: SimPlayer[] = []
  const spawn = (): void => {
    // Choose an archetype by cumulative share.
    let r = rng()
    let idx = 0
    for (let i = 0; i < shares.length; i++) {
      r -= shares[i]
      if (r <= 0) { idx = i; break }
      idx = i
    }
    const isDumper = rng() < scenario.dumperShare
    // Real chip-dumping funnels to ONE persistent collector, not a fresh target each day —
    // that is what actually concentrates coins. Pick a stable non-dumper already in the pool.
    let collectorIndex = -1
    if (isDumper) {
      const eligible: number[] = []
      for (let i = 0; i < players.length; i++) if (!players[i].isDumper) eligible.push(i)
      if (eligible.length > 0) collectorIndex = eligible[Math.floor(rng() * eligible.length)]
    }
    players.push({
      balance: startCoins,
      archetype: scenario.archetypes[idx],
      isDumper,
      collectorIndex,
      lastRecoveryDay: -Infinity,
      recoveryClaims: 0,
    })
  }

  let initialSupply = 0
  for (let i = 0; i < scenario.initialPlayers; i++) spawn()
  initialSupply = players.reduce((a, p) => a + p.balance, 0)

  const dayMetrics: DayMetrics[] = []
  let totalFaucet = initialSupply // signup grants issued so far (initial cohort counts as faucet)
  let totalBusts = 0
  let totalRecovery = 0
  let dumpedTotal = 0

  for (let day = 1; day <= scenario.days; day++) {
    let faucetToday = 0
    let recoveryToday = 0
    let bustsToday = 0

    // New signups (inflation).
    for (let i = 0; i < scenario.dailyNewPlayers; i++) {
      spawn()
      faucetToday += startCoins
      totalFaucet += startCoins
    }

    // Recovery faucet: busted, cooldown elapsed → claim.
    for (const p of players) {
      if (
        p.balance <= entryGate &&
        day - p.lastRecoveryDay >= recoveryCooldownDays &&
        (cfg.faucet.maxLifetimeRecoveryClaims === null || p.recoveryClaims < cfg.faucet.maxLifetimeRecoveryClaims)
      ) {
        p.balance += recoveryCoins
        p.lastRecoveryDay = day
        p.recoveryClaims += 1
        faucetToday += recoveryCoins
        recoveryToday += 1
        totalFaucet += recoveryCoins
        totalRecovery += 1
      }
    }

    // Gameplay: ZERO-SUM by construction (mirrors real no-rake settlement). Active players are
    // grouped by their recommended tier, paired inside the tier, and each pair exchanges chips.
    // The transfer is clamped to each player's table exposure so nobody can lose more than they
    // could bring — an exact per-pair conservation, so total supply is untouched by gameplay.
    const byTier = new Map<string, number[]>() // tier.id → player indices
    for (let i = 0; i < players.length; i++) {
      const p = players[i]
      if (rng() >= p.archetype.dailyActiveProb) continue
      const tier = recommendTierForBalance(cfg, p.balance)
      if (!tier) continue // too broke to sit; relies on the recovery faucet next eligible day
      const arr = byTier.get(tier.id)
      if (arr) arr.push(i)
      else byTier.set(tier.id, [i])
    }
    for (const [tierId, idxs] of Array.from(byTier.entries())) {
      const tier = cfg.blindTiers.find((t) => t.id === tierId)!
      const bounds = buyInBoundsForTier(tier)
      // Seeded Fisher–Yates shuffle so pairings are deterministic yet mixed.
      for (let i = idxs.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
        ;[idxs[i], idxs[j]] = [idxs[j], idxs[i]]
      }
      for (let k = 0; k + 1 < idxs.length; k += 2) {
        const a = players[idxs[k]]
        const b = players[idxs[k + 1]]
        const hands = Math.round((a.archetype.handsPerActiveDay + b.archetype.handsPerActiveDay) / 2)
        if (hands <= 0) continue
        // Result to A in big blinds: relative skill edge + zero-mean noise scaled by √hands.
        const edgeDiffPerHand = (a.archetype.skillBbPer100 - b.archetype.skillBbPer100) / 100
        const sigma = Math.max(a.archetype.variancePerHandBb, b.archetype.variancePerHandBb)
        const resultBbToA = edgeDiffPerHand * hands + sigma * Math.sqrt(hands) * nextGaussian(rng)
        let transfer = Math.round(resultBbToA * tier.bigBlind) // >0 → A wins from B
        // Table stakes: neither can lose more than min(balance, one max buy-in).
        const expoA = Math.min(a.balance, bounds.max)
        const expoB = Math.min(b.balance, bounds.max)
        if (transfer > expoB) transfer = expoB
        if (transfer < -expoA) transfer = -expoA
        const beforeA = a.balance
        const beforeB = b.balance
        a.balance += transfer
        b.balance -= transfer
        if (beforeA > entryGate && a.balance <= entryGate) bustsToday += 1
        if (beforeB > entryGate && b.balance <= entryGate) bustsToday += 1
      }
    }

    // Multi-account chip dumping: each active dumper funnels a fixed amount to its PERSISTENT
    // collector. This is a pure TRANSFER — supply is unchanged; it only worsens concentration.
    for (const p of players) {
      if (!p.isDumper || p.collectorIndex < 0) continue
      if (rng() >= p.archetype.dailyActiveProb) continue
      const move = Math.min(p.balance, scenario.dumpChipsPerDay)
      if (move <= 0) continue
      const collector = players[p.collectorIndex]
      p.balance -= move
      collector.balance += move
      dumpedTotal += move
      if (p.balance <= entryGate && p.balance + move > entryGate) bustsToday += 1
    }

    totalBusts += bustsToday

    const balances = players.map((p) => p.balance)
    dayMetrics.push({
      day,
      players: players.length,
      totalCoins: balances.reduce((a, b) => a + b, 0),
      faucetCoinsToday: faucetToday,
      recoveryClaimsToday: recoveryToday,
      bustsToday,
      medianBalance: median(balances),
      gini: gini(balances),
      top1PctShare: topShare(balances, 1),
      top10PctShare: topShare(balances, 10),
    })
  }

  const last = dayMetrics[dayMetrics.length - 1]
  const finalTotal = last ? last.totalCoins : initialSupply
  const inflationPctTotal = initialSupply > 0 ? ((finalTotal - initialSupply) / initialSupply) * 100 : 0

  return {
    scenario: scenario.name,
    seed,
    config: cfg.version,
    days: dayMetrics,
    summary: {
      finalPlayers: last ? last.players : players.length,
      finalTotalCoins: finalTotal,
      totalFaucetCoins: totalFaucet,
      inflationPctTotal,
      avgDailyInflationPct: scenario.days > 0 ? inflationPctTotal / scenario.days : 0,
      finalGini: last ? last.gini : 0,
      finalTop1PctShare: last ? last.top1PctShare : 0,
      totalBusts,
      totalRecoveryClaims: totalRecovery,
      dumpedChipsTotal: dumpedTotal,
    },
  }
}

// ── Built-in scenarios (documented assumptions) ─────────────────────────────────────────

export const SCENARIOS: Record<string, EconomyScenario> = {
  // A healthy mixed population: mostly casual, some winners/losers, small dumper fraction.
  baseline: {
    name: 'baseline',
    days: 90,
    initialPlayers: 1_000,
    dailyNewPlayers: 20,
    dumperShare: 0.02,
    dumpChipsPerDay: 100_000,
    archetypes: [
      { id: 'casual',  share: 0.6, dailyActiveProb: 0.3, handsPerActiveDay: 60,  skillBbPer100: -2, variancePerHandBb: 8 },
      { id: 'regular', share: 0.3, dailyActiveProb: 0.6, handsPerActiveDay: 200, skillBbPer100: 1,  variancePerHandBb: 8 },
      { id: 'shark',   share: 0.1, dailyActiveProb: 0.7, handsPerActiveDay: 400, skillBbPer100: 5,  variancePerHandBb: 8 },
    ],
  },
  // Heavy grinders + high signup rate → stress the faucet-driven inflation.
  heavy_growth: {
    name: 'heavy_growth',
    days: 90,
    initialPlayers: 500,
    dailyNewPlayers: 80,
    dumperShare: 0.02,
    dumpChipsPerDay: 100_000,
    archetypes: [
      { id: 'casual',  share: 0.4, dailyActiveProb: 0.4, handsPerActiveDay: 100, skillBbPer100: -3, variancePerHandBb: 9 },
      { id: 'regular', share: 0.4, dailyActiveProb: 0.7, handsPerActiveDay: 400, skillBbPer100: 1,  variancePerHandBb: 9 },
      { id: 'shark',   share: 0.2, dailyActiveProb: 0.8, handsPerActiveDay: 800, skillBbPer100: 6,  variancePerHandBb: 9 },
    ],
  },
  // Abuse-heavy: large dumper fraction and big transfers → concentration stress test.
  abuse_farm: {
    name: 'abuse_farm',
    days: 60,
    initialPlayers: 1_000,
    dailyNewPlayers: 30,
    dumperShare: 0.15,
    dumpChipsPerDay: 500_000,
    archetypes: [
      { id: 'casual',  share: 0.5, dailyActiveProb: 0.3, handsPerActiveDay: 60,  skillBbPer100: -2, variancePerHandBb: 8 },
      { id: 'regular', share: 0.4, dailyActiveProb: 0.6, handsPerActiveDay: 200, skillBbPer100: 1,  variancePerHandBb: 8 },
      { id: 'shark',   share: 0.1, dailyActiveProb: 0.7, handsPerActiveDay: 400, skillBbPer100: 5,  variancePerHandBb: 8 },
    ],
  },
}
