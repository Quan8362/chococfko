// ── Poker BOT fixed benchmark opponents (pure, seeded) — EVALUATION ONLY ────────────────
//
// PURE module — no React, no Supabase, no clock, no I/O. Deterministic given its rng. Tested by
// evaluate.test.ts. NOT exported from index.ts and NEVER used by any production/practice seat —
// these are FIXED reference opponents the 27C-C validation measures the skill bots against, exactly
// like a poker "bot suite" of exploitable archetypes (random / passive / aggressive / tight / loose /
// always-call / minimum-raise). Measuring the skill bots against a COMMON fixed reference avoids the
// intransitivity + variance traps of noisy skill-vs-skill self-play.
//
// 🔴 FAIRNESS: every benchmark is a `BotPolicy` and so, like the real bots, sees ONLY a
// `BotObservation` (its own cards + public facts). None can read hidden state. They are still run
// through `decideSafely`, which re-validates legality, so any archetype that ever slips is corrected
// to a safe fold — but each aims to be legal by construction.

import type { BotObservation } from './observation.ts'
import type { BotPolicy, BotDecision } from './policy.ts'
import { safeFallbackDecision } from './policy.ts'
import type { LegalAction } from '../betting.ts'
import { estimateEquity, preflopStrength } from './equity.ts'

function legalOfType<T extends LegalAction['type']>(
  obs: BotObservation,
  type: T,
): Extract<LegalAction, { type: T }> | undefined {
  return obs.legal.find((a) => a.type === type) as Extract<LegalAction, { type: T }> | undefined
}

const check = (): BotDecision => ({ action: { type: 'check' }, note: 'bench' })
const call = (): BotDecision => ({ action: { type: 'call' }, note: 'bench' })
const fold = (): BotDecision => ({ action: { type: 'fold' }, note: 'bench' })

// A cheap, fairness-clean own-hand strength in [0,1]: Chen preflop, a small seeded Monte-Carlo
// estimate postflop. Wrapped so a degenerate scenario can never throw a benchmark (it falls back to a
// neutral 0.5). Deterministic given the rng.
function ownStrength(obs: BotObservation, rng: () => number): number {
  if (obs.street === 'PREFLOP') return preflopStrength(obs.holeCards)
  try {
    const opps = Math.max(1, obs.opponentsInHand)
    return estimateEquity(obs.holeCards, obs.board, opps, 60, rng, { earlyStop: true }).equity
  } catch {
    return 0.5
  }
}

// ── random: uniform over the legal set (same archetype as the built-in `simulation` policy) ──────
// Kept as a named benchmark so the validation matrix reads clearly; behaviourally identical to the
// simulation policy (unpredictable-but-legal lines).
export const randomBenchmark: BotPolicy = (obs, rng) => {
  if (obs.legal.length === 0) return safeFallbackDecision(obs)
  const pick = obs.legal[Math.floor(rng() * obs.legal.length)]
  switch (pick.type) {
    case 'fold':
      return fold()
    case 'check':
      return check()
    case 'call':
      return call()
    case 'all_in':
      return { action: { type: 'all_in' }, note: 'bench' }
    case 'bet':
    case 'raise': {
      const span = pick.max - pick.min
      const to = pick.min + Math.floor(rng() * (span + 1))
      return { action: pick.type === 'bet' ? { type: 'bet', to } : { type: 'raise', to }, note: 'bench' }
    }
  }
}

// ── always-call (calling station): NEVER folds, NEVER raises ─────────────────────────────────────
// Check when free, otherwise call any bet. The purest "folds nothing" opponent — the target a bot
// must VALUE-BET thin against, and must NOT bluff.
export const alwaysCallBenchmark: BotPolicy = (obs) => {
  if (legalOfType(obs, 'check')) return check()
  if (legalOfType(obs, 'call')) return call()
  if (legalOfType(obs, 'all_in')) return { action: { type: 'all_in' }, note: 'bench' }
  return fold()
}

// ── passive (weak-tight, check-call, folds to pressure) ──────────────────────────────────────────
// Never bets or raises. Checks when free; when facing a bet, calls only when the price is cheap
// (≤ ~⅔ pot), otherwise folds. A "fit-or-fold-ish" station that still surrenders to real pressure —
// distinct from the never-folding always-call.
export const passiveBenchmark: BotPolicy = (obs) => {
  if (legalOfType(obs, 'check')) return check()
  const callable = legalOfType(obs, 'call')
  if (callable) {
    const pot = Math.max(1, obs.potTotal)
    if (obs.toCall <= pot * 0.67) return call()
    return fold()
  }
  return fold()
}

// ── aggressive (maniac): bet/raise at every opportunity ──────────────────────────────────────────
// Fires a large bet/raise whenever raising is legal (mixes ~pot / all-in), else calls, and almost
// never folds. The over-aggression target a bot must not spew back at — call down / trap, do not
// out-bluff.
export const aggressiveBenchmark: BotPolicy = (obs, rng) => {
  const raise = legalOfType(obs, 'raise')
  const bet = legalOfType(obs, 'bet')
  if (raise) {
    // Mix a pot-ish raise-to with the occasional jam, staying inside the legal band.
    const target = obs.potTotal + obs.toCall
    const to = Math.min(raise.max, Math.max(raise.min, Math.max(raise.min, Math.round(target))))
    if (rng() < 0.25) return { action: { type: 'raise', to: raise.max }, note: 'bench' }
    return { action: { type: 'raise', to }, note: 'bench' }
  }
  if (bet) {
    const to = Math.min(bet.max, Math.max(bet.min, Math.round(Math.max(1, obs.potTotal) * 0.75)))
    if (rng() < 0.2) return { action: { type: 'bet', to: bet.max }, note: 'bench' }
    return { action: { type: 'bet', to }, note: 'bench' }
  }
  if (legalOfType(obs, 'call')) return call()
  if (legalOfType(obs, 'check')) return check()
  return fold()
}

// ── minimum-raise: always the smallest legal raise/bet ───────────────────────────────────────────
// Raise-to = min when raising is legal (bet-to = min otherwise); else call; else check; else fold.
// Exercises the engine's minimum-raise / reopening rules under relentless small raises, and the bot's
// response to a one-size, always-min pattern.
//
// Escalation is BOUNDED by `MIN_RAISE_WAR_CAP` big blinds: once the current bet already exceeds that,
// it CALLS instead of re-raising. This is only observable when TWO pure min-raisers face each other
// (a benchmark-self-play war) — against any real bot the war ends far sooner. Without the cap, the
// rebuy faucet can grow a seat deep enough that a pure min-raise war outruns the hand action budget
// (a bounded-computation safety net that would fire correctly, but as a benign self-play artifact).
// The cap keeps the archetype's INTENT (relentless small raises in normal pots) while guaranteeing a
// natural termination, so the engine's reopening rules are still fully exercised.
const MIN_RAISE_WAR_CAP = 15
export const minRaiseBenchmark: BotPolicy = (obs) => {
  const raise = legalOfType(obs, 'raise')
  if (raise && obs.currentBet < MIN_RAISE_WAR_CAP * obs.bigBlind) {
    return { action: { type: 'raise', to: raise.min }, note: 'bench' }
  }
  const bet = legalOfType(obs, 'bet')
  if (bet) return { action: { type: 'bet', to: bet.min }, note: 'bench' }
  if (legalOfType(obs, 'call')) return call()
  if (legalOfType(obs, 'check')) return check()
  return fold()
}

// ── tight (nit): only continues with strong hands; passive otherwise ─────────────────────────────
// Continues (calls / checks) only when its OWN-hand strength clears a high bar; folds to any bet
// without it. Never raises (isolates the "too tight / over-folds" axis). Uses only own cards + board
// (fairness-clean). The exploit target for stealing / relentless small bets.
export const tightBenchmark: BotPolicy = (obs, rng) => {
  const strong = ownStrength(obs, rng) >= 0.55
  if (legalOfType(obs, 'check')) return check()
  if (strong && legalOfType(obs, 'call')) return call()
  return fold()
}

// ── loose (station-lite): enters/continues very wide; passive ────────────────────────────────────
// Calls with almost anything (very low bar), checks when free, never raises. The "plays too many
// hands / calls too wide" axis — a bot must value-bet it wide and fold-equity-bluff it rarely.
export const looseBenchmark: BotPolicy = (obs, rng) => {
  if (legalOfType(obs, 'check')) return check()
  const callable = legalOfType(obs, 'call')
  if (callable) {
    const playable = ownStrength(obs, rng) >= 0.18
    const pot = Math.max(1, obs.potTotal)
    if (playable || obs.toCall <= pot * 0.5) return call()
    return fold()
  }
  return fold()
}

export type BenchmarkId =
  | 'random'
  | 'always_call'
  | 'passive'
  | 'aggressive'
  | 'min_raise'
  | 'tight'
  | 'loose'

export const BENCHMARK_IDS: readonly BenchmarkId[] = [
  'random',
  'always_call',
  'passive',
  'aggressive',
  'min_raise',
  'tight',
  'loose',
]

export const BENCHMARKS: Readonly<Record<BenchmarkId, BotPolicy>> = {
  random: randomBenchmark,
  always_call: alwaysCallBenchmark,
  passive: passiveBenchmark,
  aggressive: aggressiveBenchmark,
  min_raise: minRaiseBenchmark,
  tight: tightBenchmark,
  loose: looseBenchmark,
}

export function benchmarkFor(id: BenchmarkId): BotPolicy {
  return BENCHMARKS[id]
}
