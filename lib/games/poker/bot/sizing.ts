// ── Poker BOT bet-sizing (pure, legal by construction) ────────────────────────────────
//
// PURE module — no React, no Supabase, no clock. Deterministic. Tested by sizing.test.ts.
//
// 🔴 EVERY amount this module produces is:
//   • an INTEGER (chips are integers — coin-model INT-001),
//   • a "raise-TO" total (never a "raise-BY" delta) — the vocabulary applyAction expects,
//   • clamped into the authoritative legal band [min, max] the SERVER supplied on the observation,
//   • never zero, negative, fractional, or above the seat's stack.
// It only ever RETURNS one of the legal actions in `obs.legal`; if the requested aggressive action
// is not legal (e.g. we wanted to raise but only all-in remains) it returns `null` so the caller
// falls back safely. `decideSafely` then re-validates against the same legal set — this module is
// belt, `decideSafely` is braces.

import type { AppliedAction, LegalAction } from '../betting.ts'
import type { BotObservation } from './observation.ts'

function legal<T extends LegalAction['type']>(
  obs: BotObservation,
  type: T,
): Extract<LegalAction, { type: T }> | undefined {
  return obs.legal.find((a) => a.type === type) as Extract<LegalAction, { type: T }> | undefined
}

function hasLegal(obs: BotObservation, type: LegalAction['type']): boolean {
  return obs.legal.some((a) => a.type === type)
}

// Clamp an integer "to" into an inclusive legal band. `to` is rounded to the nearest integer first.
export function clampTo(to: number, min: number, max: number): number {
  const i = Math.round(to)
  if (i < min) return min
  if (i > max) return max
  return i
}

// The pot as seen for sizing: chips already committed this hand. `potAfterCall` adds the chips we
// would owe to continue — the base most pot-fraction sizings are quoted against.
export function potAfterCall(obs: BotObservation): number {
  return obs.potTotal + obs.toCall
}

// Turn a raw "to" total into a concrete legal bet or raise, honouring which of the two is offered.
// Returns null when neither bet nor raise is legal for this seat right now.
export function aggressiveToAmount(obs: BotObservation, rawTo: number): AppliedAction | null {
  const raise = legal(obs, 'raise')
  if (raise) {
    const to = clampTo(rawTo, raise.min, raise.max)
    return { type: 'raise', to }
  }
  const bet = legal(obs, 'bet')
  if (bet) {
    const to = clampTo(rawTo, bet.min, bet.max)
    return { type: 'bet', to }
  }
  return null
}

// Size an OPENING bet (nothing owed) as a fraction of the current pot. `fraction` of 0.66 on a 300
// pot ⇒ a bet-to of 200 (clamped to the legal band). Falls back to all-in when a bet is not legal
// but all-in is (a stack too short to make the min bet can still shove).
export function betPotFraction(obs: BotObservation, fraction: number): AppliedAction | null {
  const bet = legal(obs, 'bet')
  if (bet) {
    const rawTo = Math.round(obs.potTotal * fraction)
    return { type: 'bet', to: clampTo(rawTo, bet.min, bet.max) }
  }
  if (hasLegal(obs, 'all_in')) return { type: 'all_in' }
  return null
}

// Size a RAISE facing a bet as a fraction of the pot-after-our-call, expressed as a raise-TO:
//   raiseTo = currentBet + fraction × (pot + toCall)
// which adds `fraction` of the post-call pot on top of matching. Clamped to the legal raise band.
// Falls back to all-in when raising is closed but shoving is legal.
export function raisePotFraction(obs: BotObservation, fraction: number): AppliedAction | null {
  const raise = legal(obs, 'raise')
  if (raise) {
    const rawTo = obs.currentBet + Math.round(potAfterCall(obs) * fraction)
    return { type: 'raise', to: clampTo(rawTo, raise.min, raise.max) }
  }
  if (hasLegal(obs, 'all_in')) return { type: 'all_in' }
  return null
}

// Size a preflop OPEN/RE-RAISE from an explicit raise-to target in CHIPS (already computed in big
// blinds by the caller). Works whether the seat is opening (bet) or re-raising (raise). Clamped.
export function raiseToChips(obs: BotObservation, rawTo: number): AppliedAction | null {
  return aggressiveToAmount(obs, rawTo)
}

// The passive continue: call when facing a bet, else check. Null when neither is legal.
export function passiveContinue(obs: BotObservation): AppliedAction | null {
  if (obs.toCall > 0 && hasLegal(obs, 'call')) return { type: 'call' }
  if (hasLegal(obs, 'check')) return { type: 'check' }
  return null
}

// The always-legal give-up: check when free, otherwise fold.
export function checkOrFold(obs: BotObservation): AppliedAction {
  if (hasLegal(obs, 'check')) return { type: 'check' }
  return { type: 'fold' }
}
