// ── Poker BOT multi-hand simulation harness (pure, seeded) ────────────────────────────
//
// PURE module — no React, no Supabase, no clock, no I/O. Deterministic given its seed. Tested by
// sim.test.ts and driven by bot/cli.ts.
//
// Plays many full hands at one table with bot policies, carrying stacks across hands and rotating
// the button, then asserts the invariants that matter for a coin-integrity game:
//   • COIN CONSERVATION — the total chips on the table are a CONSTANT across the whole session
//     (no rake, no ante ⇒ zero-sum). Checked after EVERY hand, not just at the end.
//   • SIDE POTS — unequal stacks force multi-way all-ins; every such settlement must conserve.
//   • TERMINATION — the session always ends (hand cap + per-hand action budget in the runner).
//   • ENGINE CROSS-CHECK — each hand's driver settlement is re-verified against the canonical
//     scripted engine (see runner.ts). Any mismatch is collected as a defect.
//
// This is the "run a large number of synthetic hands to reveal rare state bugs" tool. It makes NO
// claim of statistical completeness — it is a fuzzer + invariant checker, not a proof.

import { makeRng } from '../../tlmn/ai/seededRandom.ts'
import { nextButton, type RingSeat } from '../order.ts'
import { playBotHand, type BotHandConfig, type HandDefect } from './runner.ts'
import { policyFor } from './policies.ts'
import type { BotDifficulty, BotPolicy } from './policy.ts'
import {
  createPolicyMetrics,
  recordHand,
  finalizePolicyMetrics,
  type PolicyMetrics,
  type PolicyMetricsAccumulator,
} from './metrics.ts'

export interface BotSimConfig {
  readonly seatCount: number // 2..6
  readonly startingStack: number // integer coins each seat starts with
  readonly bigBlind: number
  readonly smallBlind?: number
  readonly hands: number // number of hands to attempt
  // Difficulty per seat (length must equal seatCount) OR a single difficulty for all seats.
  readonly difficulties: readonly BotDifficulty[] | BotDifficulty
  // Auto-rebuy busted seats back to `startingStack` so the fuzzer can run the full hand count
  // instead of stopping the moment one seat busts. Default TRUE. Rebuys are a tracked "faucet":
  // conservation is still exact — table supply == initial + injected — and per-hand settlement is
  // still strictly zero-sum. Set false to model a real bust-out session (may terminate early).
  readonly rebuy?: boolean
}

export interface SimDefect extends HandDefect {
  readonly hand: number // hand index (1-based) the defect occurred in
}

export interface DifficultyStat {
  readonly difficulty: BotDifficulty
  readonly seats: number // seats assigned this difficulty
  readonly netChips: number // total chips won(+)/lost(−) across those seats
  readonly netBbPer100: number // net in big blinds per 100 hands (a rough winrate proxy)
}

export interface BotSimReport {
  readonly seed: string | number
  readonly seatCount: number
  readonly handsRequested: number
  readonly handsPlayed: number
  readonly terminatedEarly: boolean // stopped before `hands` (too few funded seats)
  readonly totalChips: number // initial table supply (Σ starting stacks)
  readonly injectedChips: number // chips added by auto-rebuys (the tracked faucet)
  readonly conserved: boolean // every hand was zero-sum AND supply == initial + injected
  readonly showdowns: number
  readonly sidePotHands: number // hands that produced ≥1 side pot
  readonly allInHands: number // hands with ≥1 all-in action
  readonly fallbacks: number // total safe-fallback substitutions
  readonly defects: readonly SimDefect[]
  readonly byDifficulty: readonly DifficultyStat[]
  // Per-policy behavioural baseline (VPIP/PFR/3bet/action-mix/sizing/showdown). Additive: purely
  // derived from public action history, so a seeded replay is still bit-for-bit identical.
  readonly metrics: readonly PolicyMetrics[]
  readonly finalStacks: ReadonlyArray<{ readonly seatIndex: number; readonly stack: number }>
}

function difficultyForSeat(config: BotSimConfig, seatIndex: number): BotDifficulty {
  if (typeof config.difficulties === 'string') return config.difficulties
  const d = config.difficulties[seatIndex]
  if (!d) throw new Error(`bot sim: no difficulty for seat ${seatIndex}`)
  return d
}

// Run a full session. Deterministic: the SAME config + seed yields a bit-for-bit identical report
// (seeded replay — asserted by sim.test.ts).
// `sharedMetrics`, when provided, is an accumulator the caller owns across MANY runs (the baseline
// runner uses this to aggregate a whole matrix). When omitted a fresh one is used, so a single-run
// report's `metrics` reflects exactly that run — and a seeded replay stays bit-for-bit identical.
export function runBotSimulation(
  config: BotSimConfig,
  seed: string | number,
  sharedMetrics?: PolicyMetricsAccumulator,
): BotSimReport {
  if (config.seatCount < 2 || config.seatCount > 6) {
    throw new Error('bot sim: seatCount must be 2..6')
  }
  if (Array.isArray(config.difficulties) && config.difficulties.length !== config.seatCount) {
    throw new Error('bot sim: difficulties length must equal seatCount')
  }
  const rng = makeRng(seed)
  const rebuy = config.rebuy ?? true

  // Persistent per-seat state across the session. `pnl` is the seat's TRUE cumulative win/loss
  // (sum of per-hand deltas) — independent of rebuys, so it is the honest winrate signal.
  const seats = Array.from({ length: config.seatCount }, (_, i) => ({
    seatIndex: i,
    stack: config.startingStack,
    pnl: 0,
    difficulty: difficultyForSeat(config, i),
    policy: policyFor(difficultyForSeat(config, i)) as BotPolicy,
  }))
  const initialSupply = seats.reduce((s, x) => s + x.stack, 0)

  const metrics = sharedMetrics ?? createPolicyMetrics()
  const defects: SimDefect[] = []
  let handsPlayed = 0
  let terminatedEarly = false
  let showdowns = 0
  let sidePotHands = 0
  let allInHands = 0
  let fallbacks = 0
  let conserved = true
  let injected = 0
  let button: number | null = null

  for (let hand = 1; hand <= config.hands; hand++) {
    // Auto-rebuy: top any seat too short to post a big blind back to the starting stack. This is a
    // TRACKED faucet (injected), so conservation stays exact; it is not the engine creating coins.
    if (rebuy) {
      for (const s of seats) {
        if (s.stack < config.bigBlind) {
          injected += config.startingStack - s.stack
          s.stack = config.startingStack
        }
      }
    }

    // Only seats with chips can be dealt in. A hand needs ≥2 funded seats.
    const funded = seats.filter((s) => s.stack > 0)
    if (funded.length < 2) {
      terminatedEarly = true
      break
    }

    const ring: RingSeat[] = seats.map((s) => ({ seatIndex: s.seatIndex, eligible: s.stack > 0 }))
    button = nextButton(ring, button)

    const supplyBefore = seats.reduce((sum, x) => sum + x.stack, 0)

    const handConfig: BotHandConfig = {
      seed: deriveHandSeed(seed, hand),
      bigBlind: config.bigBlind,
      smallBlind: config.smallBlind,
      buttonSeat: button,
      seats: funded.map((s) => ({ seatIndex: s.seatIndex, stack: s.stack, policy: s.policy })),
    }

    const outcome = playBotHand(handConfig, rng)
    handsPlayed += 1
    fallbacks += outcome.fallbacks

    // Behavioural metrics: attribute each dealt-in seat to its difficulty (public info only).
    const seatDifficulty = new Map<number, BotDifficulty>(
      funded.map((s) => [s.seatIndex, s.difficulty]),
    )
    recordHand(metrics, {
      history: outcome.history,
      seatDifficulty,
      stackDeltas: outcome.stackDeltas,
      wentToShowdown: outcome.wentToShowdown,
      smallBlind: config.smallBlind ?? Math.floor(config.bigBlind / 2),
      bigBlind: config.bigBlind,
    })

    if (outcome.wentToShowdown) showdowns += 1
    if (outcome.sidePotCount > 0) sidePotHands += 1
    if (outcome.actionLog.some((a) => a.action.type === 'all_in')) allInHands += 1
    for (const d of outcome.defects) defects.push({ ...d, hand })

    // Apply per-hand stack deltas (zero-sum by construction) and accumulate true P&L.
    let deltaSum = 0
    for (const s of seats) {
      const delta = outcome.stackDeltas.get(s.seatIndex) ?? 0
      s.stack += delta
      s.pnl += delta
      deltaSum += delta
    }

    // Per-hand conservation: settlement moved chips between seats and created/destroyed none.
    if (deltaSum !== 0) {
      conserved = false
      defects.push({ hand, kind: 'not_conserved', detail: `hand deltas summed to ${deltaSum}, expected 0` })
    }
    // Supply accounting: the table holds exactly what it held before the hand (rebuys happen only
    // at the top of a hand and are counted in `injected`).
    const supplyAfter = seats.reduce((sum, x) => sum + x.stack, 0)
    if (supplyAfter !== supplyBefore) {
      conserved = false
      defects.push({ hand, kind: 'not_conserved', detail: `table supply drifted ${supplyBefore}→${supplyAfter}` })
    }
  }

  // Global supply invariant: current supply must equal the initial supply plus every injected chip.
  const finalSupply = seats.reduce((sum, x) => sum + x.stack, 0)
  if (finalSupply !== initialSupply + injected) {
    conserved = false
    defects.push({ hand: handsPlayed, kind: 'not_conserved', detail: `final supply ${finalSupply} ≠ initial ${initialSupply} + injected ${injected}` })
  }

  // Per-difficulty aggregation (uses TRUE P&L, not raw stack, so rebuys don't distort winrate).
  const byDiffMap = new Map<BotDifficulty, { seats: number; net: number }>()
  for (const s of seats) {
    const cur = byDiffMap.get(s.difficulty) ?? { seats: 0, net: 0 }
    cur.seats += 1
    cur.net += s.pnl
    byDiffMap.set(s.difficulty, cur)
  }
  const bb = config.bigBlind > 0 ? config.bigBlind : 1
  const byDifficulty: DifficultyStat[] = Array.from(byDiffMap.entries()).map(([difficulty, v]) => ({
    difficulty,
    seats: v.seats,
    netChips: v.net,
    netBbPer100: handsPlayed > 0 ? (v.net / bb / handsPlayed) * 100 : 0,
  }))

  return {
    seed,
    seatCount: config.seatCount,
    handsRequested: config.hands,
    handsPlayed,
    terminatedEarly,
    totalChips: initialSupply,
    injectedChips: injected,
    conserved,
    showdowns,
    sidePotHands,
    allInHands,
    fallbacks,
    defects,
    byDifficulty,
    metrics: finalizePolicyMetrics(metrics),
    finalStacks: seats.map((s) => ({ seatIndex: s.seatIndex, stack: s.stack })),
  }
}

// Derive a per-hand deal seed from the session seed + hand index. Deterministic and integer (the
// deck's seededShuffle requires an integer seed). Distinct hands get distinct boards.
function deriveHandSeed(seed: string | number, hand: number): number {
  const base = typeof seed === 'number' ? seed >>> 0 : hashString(String(seed))
  // Mix the hand index in; keep it a 32-bit unsigned integer.
  let h = (base ^ Math.imul(hand + 1, 0x9e3779b1)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0
  return h >>> 0
}

function hashString(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// ── Built-in simulation profiles (mirrors economySim's SCENARIOS pattern) ─────────────────

export const BOT_SIM_PROFILES: Record<string, BotSimConfig> = {
  // Heads-up random-vs-random: the harshest engine fuzzer (unpredictable legal lines).
  hu_sim: { seatCount: 2, startingStack: 20000, bigBlind: 100, hands: 2000, difficulties: 'simulation' },
  // 6-max all simulation bots: side-pot + multiway state-space coverage.
  six_sim: { seatCount: 6, startingStack: 20000, bigBlind: 100, hands: 2000, difficulties: 'simulation' },
  // Mixed skills at a 6-max table: sanity-check that stronger policies do not lose chips on
  // average and that mixed strategies still conserve.
  six_mixed: {
    seatCount: 6,
    startingStack: 20000,
    bigBlind: 100,
    hands: 2000,
    difficulties: ['hard', 'normal', 'normal', 'easy', 'easy', 'simulation'],
  },
  // Short stacks force frequent all-ins and layered side pots — stress the pot module.
  short_stacks: { seatCount: 4, startingStack: 1500, bigBlind: 100, hands: 3000, difficulties: 'simulation' },
}
