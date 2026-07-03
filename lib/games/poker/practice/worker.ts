// ── Poker PRACTICE bot-action worker (pure timing / idempotency / safety) ─────────────
//
// PURE module — no React, no Supabase, no clock (time is passed IN, never read here). Tested by
// worker.test.ts.
//
// The trusted bot-action worker's DECISION logic, separate from I/O. The server-action wrapper
// (app/games/poker/practice-actions.ts) owns the DB compare-and-swap + scheduling; this module
// decides:
//   • whether a bot MAY act right now (flag on, practice table, bot seat, its turn, delay elapsed);
//   • the server-controlled think-time delay (bounded, deterministic in tests, strength-agnostic);
//   • how a duplicate/stale invocation collapses to a single action (via the runtime's actionSeq).
//
// It NEVER edits pots/stacks/cards/turn order — it only routes an action through the runtime's
// shared authoritative core.

import type { PracticeGame } from './types.ts'
import { currentActor, botActOnce, type BotActOutcome } from './runtime.ts'
import type { BotPolicy } from '../bot/policy.ts'

export interface BotTimingConfig {
  readonly baseMs: number
  readonly perOpponentMs: number
  readonly jitterMs: number
  readonly minMs: number
  readonly maxMs: number
}

// Conservative, bounded defaults. Delay is server-controlled and STRENGTH-AGNOSTIC — it depends
// only on the number of live opponents + seeded jitter, never on the bot's hand, so timing can
// never tell a human what the bot holds.
export const DEFAULT_BOT_TIMING: BotTimingConfig = {
  baseMs: 800,
  perOpponentMs: 200,
  jitterMs: 900,
  minMs: 400,
  maxMs: 5000,
}

// Deterministic (given rng) think-time for the current bot actor. Does NOT read the clock.
export function botThinkDelayMs(game: PracticeGame, rng: () => number, cfg: BotTimingConfig = DEFAULT_BOT_TIMING): number {
  const hand = game.hand
  const opponents = hand ? hand.players.filter((p) => p.status === 'active' || p.status === 'allin').length - 1 : 0
  let ms = cfg.baseMs + cfg.perOpponentMs * Math.max(0, opponents) + rng() * cfg.jitterMs
  ms = Math.min(cfg.maxMs, Math.max(cfg.minMs, ms))
  return Math.round(ms)
}

export type BotEligibility =
  | { readonly canAct: true; readonly seatIndex: number }
  | { readonly canAct: false; readonly reason: BotIneligibleReason }

export type BotIneligibleReason =
  | 'flag_off' // practice bots disabled
  | 'not_practice' // table is not classified practice
  | 'no_live_hand' // no hand in progress
  | 'not_bot_turn' // the current actor is a human (or nobody)
  | 'delay_pending' // the artificial think-time has not elapsed

// Decide whether the current bot actor may act at `nowMs`. `turnStartedAtMs` is when the current
// actor's turn began; `delayMs` is the server think-time. A bot must not act before the delay
// elapses AND must not act before it is confirmed to be its turn.
export function botEligibility(input: {
  readonly game: PracticeGame
  readonly flagOn: boolean
  readonly nowMs: number
  readonly turnStartedAtMs: number
  readonly delayMs: number
}): BotEligibility {
  if (!input.flagOn) return { canAct: false, reason: 'flag_off' }
  if (input.game.config.kind !== 'practice') return { canAct: false, reason: 'not_practice' }
  const actor = currentActor(input.game)
  if (!actor) return { canAct: false, reason: 'no_live_hand' }
  if (!actor.isBot) return { canAct: false, reason: 'not_bot_turn' }
  if (input.nowMs - input.turnStartedAtMs < input.delayMs) return { canAct: false, reason: 'delay_pending' }
  return { canAct: true, seatIndex: actor.seatIndex }
}

export interface WorkerStepResult {
  readonly acted: boolean
  readonly outcome: BotActOutcome | null
  readonly ineligibleReason: BotIneligibleReason | null
}

// One worker step: if the current bot may act now, act once through the runtime's authoritative
// core. Idempotent by construction — the runtime rejects a stale actionSeq, so a duplicate
// invocation on the same state produces exactly one committed action.
export function workerStep(input: {
  readonly game: PracticeGame
  readonly flagOn: boolean
  readonly nowMs: number
  readonly turnStartedAtMs: number
  readonly rng: () => number
  readonly timing?: BotTimingConfig
  readonly policyOverride?: BotPolicy
}): WorkerStepResult {
  const delayMs = botThinkDelayMs(input.game, input.rng, input.timing)
  const elig = botEligibility({
    game: input.game,
    flagOn: input.flagOn,
    nowMs: input.nowMs,
    turnStartedAtMs: input.turnStartedAtMs,
    delayMs,
  })
  if (!elig.canAct) return { acted: false, outcome: null, ineligibleReason: elig.reason }

  const outcome = botActOnce(input.game, input.rng, input.policyOverride)
  return { acted: outcome.result.ok, outcome, ineligibleReason: null }
}
