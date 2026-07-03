// ── Poker BOT policies (pure, seeded) ─────────────────────────────────────────────────
//
// PURE module — no React, no Supabase, no clock. Tested by policies.test.ts.
//
// Four difficulty policies, each a `BotPolicy` = (BotObservation, rng) → BotDecision. They read
// ONLY the observation (the fairness boundary), so none can use hidden information. Every policy
// returns a canonical `AppliedAction`; `decideSafely` still validates legality before use, so a
// policy that ever slips is corrected to a safe fold — but each aims to be legal by construction.
//
//   simulation — uniform-random legal action; fast; deterministic; TEST-ONLY (never user-facing).
//   easy       — coarse hand strength + minimal position; makes understandable mistakes.
//   normal     — equity vs pot-odds, position, stack, value betting, light bluffing.
//   hard       — more equity samples, multiway-aware, varied sizing, controlled bluffing.
//
// NONE claims game-theory-optimal play (docs/poker/bots/policies.md): they are heuristic and
// intentionally beatable. "Hard" is simply less exploitable than "easy", not solved.

import type { AppliedAction, LegalAction } from '../betting.ts'
import type { BotObservation } from './observation.ts'
import type { BotDecision, BotPolicy, BotDifficulty } from './policy.ts'
import { safeFallbackDecision } from './policy.ts'
import { estimateEquity, preflopStrength } from './equity.ts'

// ── Small legal-action helpers (all clamp to the authoritative legal set) ────────────────

function find<T extends LegalAction['type']>(
  obs: BotObservation,
  type: T,
): Extract<LegalAction, { type: T }> | undefined {
  return obs.legal.find((a) => a.type === type) as Extract<LegalAction, { type: T }> | undefined
}

function has(obs: BotObservation, type: LegalAction['type']): boolean {
  return obs.legal.some((a) => a.type === type)
}

// Prefer a real (non-all-in) aggressive action if one is legal, computing an integer "to" from a
// pot fraction, clamped into the legal [min,max]. Falls back to all-in when only all-in remains.
function aggressiveTo(obs: BotObservation, potFraction: number): AppliedAction | null {
  const raise = find(obs, 'raise')
  const bet = find(obs, 'bet')
  const target = raise ?? bet
  if (target) {
    const potAfterCall = obs.potTotal + obs.toCall
    const desired = obs.currentBet + Math.round(potAfterCall * potFraction) || target.min
    const to = Math.min(target.max, Math.max(target.min, desired))
    return target.type === 'raise' ? { type: 'raise', to } : { type: 'bet', to }
  }
  if (has(obs, 'all_in')) return { type: 'all_in' }
  return null
}

// Passive continue: call if facing a bet, else check. Null if neither is legal.
function passive(obs: BotObservation): AppliedAction | null {
  if (obs.toCall > 0 && has(obs, 'call')) return { type: 'call' }
  if (has(obs, 'check')) return { type: 'check' }
  return null
}

function foldOrCheck(obs: BotObservation): AppliedAction {
  if (has(obs, 'check')) return { type: 'check' }
  return { type: 'fold' }
}

// Pot odds facing a call: chips-to-call / (pot + chips-to-call). Equity above this threshold
// makes a call profitable in expectation. Zero when nothing is owed.
function potOdds(obs: BotObservation): number {
  if (obs.toCall <= 0) return 0
  return obs.toCall / (obs.potTotal + obs.toCall)
}

// A position proxy in [0,1]: how many opponents are already all-in-or-folded behind is unknown,
// so we use distance from the button as a cheap "acts later = better" signal. Purely public.
function positionScore(obs: BotObservation): number {
  const order = obs.seats.map((s) => s.seatIndex).sort((a, b) => a - b)
  const n = order.length
  if (n <= 1) return 1
  const btnIdx = order.indexOf(obs.buttonSeat)
  const myIdx = order.indexOf(obs.seatIndex)
  if (btnIdx < 0 || myIdx < 0) return 0.5
  // Seats after the button act later postflop; measure clockwise distance from button.
  const dist = (myIdx - btnIdx + n) % n
  return dist / n // button-relative; ~1 = on/near the button (late), ~0 = blinds (early)
}

// Strength in [0,1]: cheap preflop heuristic when the board is empty, else Monte-Carlo equity.
function strength(obs: BotObservation, samples: number, rng: () => number): number {
  if (obs.board.length === 0) return preflopStrength(obs.holeCards)
  return estimateEquity(obs.holeCards, obs.board, Math.max(1, obs.opponentsInHand), samples, rng).equity
}

// ── simulation policy: uniform random over the legal set (TEST-ONLY) ─────────────────────
//
// Picks a legal action uniformly; for bet/raise picks a legal integer size uniformly. Fast and
// deterministic — used to stress the engine with unpredictable-but-legal lines, never shown to
// users. It has no notion of hand strength (and so needs no equity CPU).
export const simulationPolicy: BotPolicy = (obs, rng) => {
  if (obs.legal.length === 0) return safeFallbackDecision(obs)
  const pick = obs.legal[Math.floor(rng() * obs.legal.length)]
  switch (pick.type) {
    case 'fold':
      return { action: { type: 'fold' }, note: 'sim' }
    case 'check':
      return { action: { type: 'check' }, note: 'sim' }
    case 'call':
      return { action: { type: 'call' }, note: 'sim' }
    case 'all_in':
      return { action: { type: 'all_in' }, note: 'sim' }
    case 'bet':
    case 'raise': {
      const span = pick.max - pick.min
      const to = pick.min + Math.floor(rng() * (span + 1))
      return { action: pick.type === 'bet' ? { type: 'bet', to } : { type: 'raise', to }, note: 'sim' }
    }
  }
}

// ── easy policy: coarse strength + minimal position; understandable mistakes ──────────────
//
// Uses hand strength with only a handful of equity samples and simple thresholds. It calls too
// much (a classic beginner leak) and bets only when quite strong. It understands one positional
// idea: it will open a bit wider when it is last to act preflop. No bluffing.
export const easyPolicy: BotPolicy = (obs, rng) => {
  const s = strength(obs, 40, rng)
  const inPosition = positionScore(obs) > 0.6

  if (obs.toCall === 0) {
    // Nobody has bet: bet strong hands, otherwise check.
    if (s > 0.62 || (inPosition && s > 0.55)) {
      const a = aggressiveTo(obs, 0.5)
      if (a) return { action: a, note: `easy:bet s=${s.toFixed(2)}` }
    }
    return { action: foldOrCheck(obs), note: `easy:check s=${s.toFixed(2)}` }
  }

  // Facing a bet: raise only monsters; call a wide (too-wide) range; fold the trash.
  if (s > 0.8) {
    const a = aggressiveTo(obs, 0.6)
    if (a) return { action: a, note: `easy:raise s=${s.toFixed(2)}` }
  }
  if (s > 0.35 || potOdds(obs) < 0.2) {
    const a = passive(obs)
    if (a) return { action: a, note: `easy:call s=${s.toFixed(2)}` }
  }
  return { action: foldOrCheck(obs), note: `easy:fold s=${s.toFixed(2)}` }
}

// ── normal policy: equity vs pot odds, value bets, light bluffs ───────────────────────────
//
// Calls when equity beats the pot odds (with a small cushion), bets/raises for value with strong
// hands, sizes to the pot, and bluffs at a low, capped frequency in position when it has nothing.
export const normalPolicy: BotPolicy = (obs, rng) => {
  const s = strength(obs, 120, rng)
  const odds = potOdds(obs)
  const pos = positionScore(obs)
  const multiway = obs.opponentsInHand >= 2
  const valueBar = multiway ? 0.72 : 0.62 // tighten value range multiway

  if (obs.toCall === 0) {
    if (s > valueBar) {
      const a = aggressiveTo(obs, multiway ? 0.66 : 0.55)
      if (a) return { action: a, note: `normal:value s=${s.toFixed(2)}` }
    }
    // Occasional positional stab with a weak hand (bluff), capped and only heads-up-ish.
    if (!multiway && pos > 0.6 && s < 0.3 && rng() < 0.15) {
      const a = aggressiveTo(obs, 0.5)
      if (a) return { action: a, note: 'normal:bluff' }
    }
    return { action: foldOrCheck(obs), note: `normal:check s=${s.toFixed(2)}` }
  }

  // Facing a bet.
  if (s > 0.82) {
    const a = aggressiveTo(obs, 0.7)
    if (a) return { action: a, note: `normal:raise s=${s.toFixed(2)}` }
  }
  if (s > odds + 0.03) {
    const a = passive(obs)
    if (a) return { action: a, note: `normal:call s=${s.toFixed(2)} odds=${odds.toFixed(2)}` }
  }
  return { action: foldOrCheck(obs), note: `normal:fold s=${s.toFixed(2)} odds=${odds.toFixed(2)}` }
}

// ── hard policy: more samples, multiway-aware, varied sizing, controlled bluffs ────────────
//
// Same public inputs, more careful use of them: a larger equity sample, opponent-count-aware
// value/continue thresholds, stack-aware shove/fold when short, several bet sizings chosen by a
// seeded weighting (harder to read), and a low, capped bluff frequency weighted by position.
export const hardPolicy: BotPolicy = (obs, rng) => {
  const s = strength(obs, 320, rng)
  const odds = potOdds(obs)
  const pos = positionScore(obs)
  const opp = Math.max(1, obs.opponentsInHand)
  // Tighten as the field grows: each extra opponent raises the bar a little.
  const valueBar = 0.6 + 0.06 * (opp - 1)
  const continueBar = odds + 0.02 + 0.015 * (opp - 1)

  const self = obs.seats.find((x) => x.seatIndex === obs.seatIndex)
  const bb = obs.bigBlind > 0 ? obs.bigBlind : 1
  const stackBb = self ? self.stack / bb : 100
  const shortStacked = stackBb < 12

  // Short-stacked with a strong hand: prefer to get it in rather than bloat a tricky pot.
  if (shortStacked && s > 0.6 && has(obs, 'all_in')) {
    return { action: { type: 'all_in' }, note: `hard:shove s=${s.toFixed(2)} bb=${stackBb.toFixed(1)}` }
  }

  if (obs.toCall === 0) {
    if (s > valueBar) {
      // Varied sizing: mix 1/2, 2/3, pot — deterministic given rng, so replayable but mixed.
      const sizes = [0.5, 0.66, 1.0]
      const frac = sizes[Math.floor(rng() * sizes.length)]
      const a = aggressiveTo(obs, frac)
      if (a) return { action: a, note: `hard:value s=${s.toFixed(2)} f=${frac}` }
    }
    // Controlled bluff: weighted by position, capped low, and only when genuinely weak.
    const bluffFreq = Math.min(0.18, 0.08 + 0.14 * pos)
    if (s < 0.28 && obs.opponentsInHand <= 2 && rng() < bluffFreq) {
      const a = aggressiveTo(obs, 0.6)
      if (a) return { action: a, note: 'hard:bluff' }
    }
    return { action: foldOrCheck(obs), note: `hard:check s=${s.toFixed(2)}` }
  }

  // Facing a bet: raise strong, occasionally raise as a semi-bluff-ish balance move, else call by
  // odds, else fold.
  if (s > 0.8) {
    const a = aggressiveTo(obs, 0.75)
    if (a) return { action: a, note: `hard:raise s=${s.toFixed(2)}` }
  }
  if (s > continueBar) {
    const a = passive(obs)
    if (a) return { action: a, note: `hard:call s=${s.toFixed(2)} odds=${odds.toFixed(2)}` }
  }
  return { action: foldOrCheck(obs), note: `hard:fold s=${s.toFixed(2)} odds=${odds.toFixed(2)}` }
}

// Registry: difficulty → policy. The one place difficulty names map to behavior.
export const POLICIES: Readonly<Record<BotDifficulty, BotPolicy>> = {
  simulation: simulationPolicy,
  easy: easyPolicy,
  normal: normalPolicy,
  hard: hardPolicy,
}

export function policyFor(difficulty: BotDifficulty): BotPolicy {
  return POLICIES[difficulty]
}
