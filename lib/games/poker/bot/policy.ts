// ── Poker BOT policy contract, safety wrapper & helpers (pure) ─────────────────────────
//
// PURE module — no React, no Supabase, no clock. Tested by policy.test.ts.
//
// A `BotPolicy` is a pure function from a `BotObservation` (the fairness boundary — see
// observation.ts) to a canonical `AppliedAction` (the SAME action vocabulary a human submits).
// It receives ONLY the observation and a seeded rng, so it structurally cannot read hidden
// state, mutate anything, or reach the clock/network.
//
// This module owns the SAFETY contract around policies:
//   • `decideSafely` — never lets a policy freeze or crash a table: it catches, validates the
//     returned action against the authoritative legal set, and falls back to a legal
//     check/fold if the policy throws, returns garbage, or returns an illegal action.
//   • `safeFallbackDecision` — the always-legal default (check if free, else fold).
//   • idempotency-key + natural-delay helpers used by the server-facing (user) mode.

import type { AppliedAction } from '../betting.ts'
import type { BotObservation } from './observation.ts'
import { assertObservationClean } from './observation.ts'
import { makeIdempotencyKey } from '../../shared/ids.ts'

export type BotDifficulty = 'simulation' | 'easy' | 'normal' | 'hard'

export const BOT_DIFFICULTIES: readonly BotDifficulty[] = [
  'simulation',
  'easy',
  'normal',
  'hard',
]

export interface BotDecision {
  readonly action: AppliedAction
  // Debug-only rationale. NEVER sent to clients / logs that reach players (could hint strength).
  readonly note?: string
}

// A policy sees ONLY the observation + a seeded rng. No other parameter exists, so there is no
// channel through which hidden state could be passed in.
export type BotPolicy = (obs: BotObservation, rng: () => number) => BotDecision

// The always-legal default: check when nothing is owed, otherwise fold. Used whenever a policy
// cannot be trusted to have produced a legal action.
export function safeFallbackDecision(obs: BotObservation): BotDecision {
  const canCheck = obs.legal.some((a) => a.type === 'check')
  if (canCheck) return { action: { type: 'check' }, note: 'fallback:check' }
  return { action: { type: 'fold' }, note: 'fallback:fold' }
}

// Validate a candidate action against the authoritative legal-action set in the observation.
// Returns true only when the action is one a human could legally submit right now. Bet/raise
// amounts must be integers within [min, max]; all-in/call/check/fold must be offered.
export function isDecisionLegal(obs: BotObservation, action: AppliedAction): boolean {
  switch (action.type) {
    case 'fold':
      return obs.legal.some((a) => a.type === 'fold')
    case 'check':
      return obs.legal.some((a) => a.type === 'check')
    case 'call':
      return obs.legal.some((a) => a.type === 'call')
    case 'all_in':
      return obs.legal.some((a) => a.type === 'all_in')
    case 'bet': {
      const l = obs.legal.find((a) => a.type === 'bet')
      if (!l || l.type !== 'bet') return false
      return Number.isInteger(action.to) && action.to >= l.min && action.to <= l.max
    }
    case 'raise': {
      const l = obs.legal.find((a) => a.type === 'raise')
      if (!l || l.type !== 'raise') return false
      return Number.isInteger(action.to) && action.to >= l.min && action.to <= l.max
    }
    default:
      return false
  }
}

export type BotDecisionOutcome =
  | { readonly kind: 'ok'; readonly decision: BotDecision }
  | { readonly kind: 'fallback'; readonly decision: BotDecision; readonly reason: BotFallbackReason }

export type BotFallbackReason = 'threw' | 'illegal' | 'no_legal_actions' | 'unclean_observation'

// Run a policy under the safety contract. Guarantees a LEGAL decision (or, when no action is
// possible at all, a fold) and NEVER propagates a policy exception — a broken/timed-out/adversarial
// policy degrades to a safe fold/check instead of freezing or crashing the table.
export function decideSafely(
  policy: BotPolicy,
  obs: BotObservation,
  rng: () => number,
): BotDecisionOutcome {
  // A malformed observation is a boundary violation, not a policy bug — fail safe, don't guess.
  try {
    assertObservationClean(obs)
  } catch {
    return { kind: 'fallback', decision: { action: { type: 'fold' }, note: 'fallback:unclean' }, reason: 'unclean_observation' }
  }

  if (obs.legal.length === 0) {
    return { kind: 'fallback', decision: { action: { type: 'fold' }, note: 'fallback:no_legal' }, reason: 'no_legal_actions' }
  }

  let decision: BotDecision
  try {
    decision = policy(obs, rng)
  } catch {
    return { kind: 'fallback', decision: safeFallbackDecision(obs), reason: 'threw' }
  }

  if (!decision || !decision.action || !isDecisionLegal(obs, decision.action)) {
    return { kind: 'fallback', decision: safeFallbackDecision(obs), reason: 'illegal' }
  }
  return { kind: 'ok', decision }
}

// ── Idempotency (duplicate-action protection) ────────────────────────────────────────────
//
// A bot action carries the SAME deterministic key discipline as a human action (coin-model
// ACTION-IDEMPOTENT-001). Keying on (handId, seatIndex, stateVersion) means a retried bot
// submission — a re-fired timer, a reconnect replay, a duplicated nudge — collapses to ONE
// authoritative effect: two calls at the same state version produce the same key.
export function botActionKey(handId: string, seatIndex: number, stateVersion: number): string {
  if (!Number.isInteger(seatIndex) || seatIndex < 0) {
    throw new Error('botActionKey: seatIndex must be a non-negative integer')
  }
  if (!Number.isInteger(stateVersion) || stateVersion < 0) {
    throw new Error('botActionKey: stateVersion must be a non-negative integer')
  }
  return makeIdempotencyKey('bot', handId, seatIndex, stateVersion)
}

// ── Natural action delay (USER-FACING mode ONLY) ─────────────────────────────────────────
//
// So a bot at a practice table does not act inhumanly fast, the user-facing runner waits a
// jittered, action-dependent delay before submitting. This is PRESENTATION only — it must never
// gate or reorder authoritative state, and SIMULATION mode ignores it entirely (delay = 0).
export interface NaturalDelayConfig {
  readonly baseMs: number
  readonly perOpponentMs: number
  readonly jitterMs: number
  readonly maxMs: number
}

export const DEFAULT_NATURAL_DELAY: NaturalDelayConfig = {
  baseMs: 700,
  perOpponentMs: 250,
  jitterMs: 1200,
  maxMs: 6000,
}

// Deterministic (given rng) delay in ms for a decision. Aggressive actions "think" a touch
// longer; more live opponents adds a little. Purely cosmetic — never used in simulation.
export function naturalActionDelayMs(
  obs: BotObservation,
  action: AppliedAction,
  rng: () => number,
  config: NaturalDelayConfig = DEFAULT_NATURAL_DELAY,
): number {
  let ms = config.baseMs + config.perOpponentMs * Math.max(0, obs.opponentsInHand)
  if (action.type === 'bet' || action.type === 'raise' || action.type === 'all_in') {
    ms += config.baseMs * 0.5
  }
  ms += rng() * config.jitterMs
  return Math.min(config.maxMs, Math.round(ms))
}
