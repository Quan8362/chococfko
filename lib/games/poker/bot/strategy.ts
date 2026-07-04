// ── Poker BOT strategy interpreter (pure, seeded) ──────────────────────────────────────
//
// PURE module — no React, no Supabase, no clock. Deterministic given its rng. Tested by
// strategy.test.ts (+ preflop.test.ts / postflop.test.ts).
//
// This is the thin, EXPLAINABLE interpreter of the versioned strategy config (strategyConfig.ts).
// Given the fairness-bounded observation, the cached public context (context.ts), a board/hand
// classification (board.ts), and an injected equity estimator, it produces ONE canonical
// AppliedAction plus a human-readable line label (Value Bet / Semi-Bluff / C-Bet / Fold / …). It
// uses ONLY public + own-card facts; every amount comes from sizing.ts (integer, legal, clamped).
//
// Difficulty is expressed entirely as config + capability toggles; personality is a bounded overlay
// applied here. The decision code is identical across difficulties — only the numbers differ, which
// is what makes the strength ordering auditable.

import type { AppliedAction } from '../betting.ts'
import type { Street } from '../types.ts'
import type { BotObservation } from './observation.ts'
import type { BotDecision } from './policy.ts'
import type { DifficultyStrategy, Personality } from './strategyConfig.ts'
import type { PublicContext } from './context.ts'
import { classifyBoard, classifyHand } from './board.ts'
import {
  betPotFraction,
  raisePotFraction,
  raiseToChips,
  passiveContinue,
  checkOrFold,
  clampTo,
} from './sizing.ts'

// Injected numeric estimators keep this module pure and cheap to unit-test (no Monte-Carlo in a
// strategy test): the policy wires them to equity.ts. `equity(samples)` returns the bot's [0,1]
// equity vs the field on the current board; `preflopStrength()` is the cheap Chen value [0,1].
export interface StrategyDeps {
  readonly cfg: DifficultyStrategy
  readonly personality: Personality
  readonly equity: (samples: number) => number
  readonly preflopStrength: () => number
}

// Pick one entry from a sizing menu using the seeded rng (deterministic). When a difficulty does not
// mix, always the first (most predictable) entry.
function pickSizing(menu: readonly number[], mix: boolean, bias: number, rng: () => number): number {
  const base = mix && menu.length > 1 ? menu[Math.floor(rng() * menu.length)] : menu[0]
  return Math.max(0.1, base + bias)
}

function potOdds(obs: BotObservation): number {
  if (obs.toCall <= 0) return 0
  return obs.toCall / (obs.potTotal + obs.toCall)
}

function hasAceBlocker(obs: BotObservation): boolean {
  return obs.holeCards.some((c) => c[0] === 'A')
}

const decide = (action: AppliedAction, note: string): BotDecision => ({ action, note })

// ── Preflop ───────────────────────────────────────────────────────────────────────────

function decidePreflop(obs: BotObservation, ctx: PublicContext, deps: StrategyDeps, rng: () => number): BotDecision {
  const { cfg, personality: p } = deps
  const s = deps.preflopStrength()
  const posKey = cfg.capabilities.usesPosition ? ctx.position : ctx.isBigBlind ? 'bb' : 'co'

  // ── Short-stack / push-fold zone ──────────────────────────────────────────────────────
  if (ctx.effectiveStackBb <= cfg.shortStack.reshoveMaxBb) {
    const sc = cfg.shortStack
    if (obs.toCall > 0) {
      // Facing action while short: jam-or-fold (with a wider CALL only when getting a great price).
      if (s >= sc.reshoveStrength - p.aggressionShift) {
        const jam = raiseToChips(obs, obs.maxRaiseTo) ?? (has(obs, 'all_in') ? { type: 'all_in' as const } : null)
        if (jam) return decide(jam, 'All-in (short reshove)')
      }
      if (s >= sc.callShoveStrength || (potOdds(obs) < 0.25 && s >= sc.callShoveStrength - 0.12)) {
        const c = passiveContinue(obs)
        if (c) return decide(c, 'Call (short, priced in)')
      }
      return decide(checkOrFold(obs), 'Fold (short)')
    }
    if (ctx.effectiveStackBb <= sc.openShoveMaxBb && s >= sc.openShoveStrength - p.enterShift) {
      const jam = raiseToChips(obs, obs.maxRaiseTo) ?? (has(obs, 'all_in') ? { type: 'all_in' as const } : null)
      if (jam) return decide(jam, 'All-in (short open-shove)')
    }
    // Between open-shove and reshove depth: fall through to the normal open logic (it min-raises,
    // which the sizing clamp handles safely at a short stack).
  }

  // ── Facing all-in preflop (call/fold by strength + price) ──────────────────────────────
  if (ctx.facingAllIn) {
    const bar = cfg.shortStack.callShoveStrength - (potOdds(obs) < 0.25 ? 0.12 : 0)
    if (s >= bar) {
      const c = passiveContinue(obs)
      if (c) return decide(c, 'Call (vs all-in)')
    }
    return decide(checkOrFold(obs), 'Fold (vs all-in)')
  }

  // ── Re-raised pot (facing a 3-bet+) ────────────────────────────────────────────────────
  if (ctx.preflop === 'threebet_plus') {
    if (cfg.capabilities.threeBets && s >= cfg.preflop.vs3betReraise - p.aggressionShift) {
      const to = Math.round(obs.currentBet * cfg.sizing.fourBetMult)
      const a = raiseToChips(obs, to)
      if (a) return decide(a, 'Raise (4-bet value)')
    }
    if (s >= cfg.preflop.vs3betCall - p.enterShift) {
      const c = passiveContinue(obs)
      if (c) return decide(c, 'Call (vs 3-bet)')
    }
    return decide(checkOrFold(obs), 'Fold (vs 3-bet)')
  }

  const huWiden = ctx.seatCount <= 2 ? cfg.preflop.headsUpWiden : 0

  // ── Single-raise pot (facing an open) ──────────────────────────────────────────────────
  if (ctx.preflop === 'raised') {
    const reBar = cfg.preflop.vsRaiseReraise[posKey] - p.aggressionShift
    const callBar =
      cfg.preflop.vsRaiseCall[posKey] - p.enterShift - (ctx.isBigBlind ? cfg.preflop.bbDefendBonus : 0) - huWiden

    if (cfg.capabilities.threeBets && s >= reBar) {
      const to = Math.round(obs.currentBet * cfg.sizing.threeBetMult)
      const a = raiseToChips(obs, to)
      if (a) return decide(a, 'Raise (3-bet value)')
    }
    // Bounded, blocker-aware 3-bet bluff (hard/normal only): a hand just below the flat range with
    // an ace blocker, at a low capped frequency. Never a random jam — a small, legal re-raise.
    if (
      cfg.capabilities.threeBets &&
      cfg.capabilities.bluffs &&
      s < callBar &&
      s > callBar - 0.16 &&
      hasAceBlocker(obs) &&
      rng() < cfg.postflop.bluffFreq * p.bluffMult
    ) {
      const to = Math.round(obs.currentBet * cfg.sizing.threeBetMult)
      const a = raiseToChips(obs, to)
      if (a) return decide(a, 'Raise (3-bet bluff)')
    }
    if (s >= callBar) {
      const c = passiveContinue(obs)
      if (c) return decide(c, 'Call (defend vs open)')
    }
    return decide(checkOrFold(obs), 'Fold (vs open)')
  }

  // ── Unopened / limped pot (open decision) ──────────────────────────────────────────────
  const blindVsBlind = (ctx.isSmallBlind || ctx.isBigBlind) && ctx.opponents === 1
  const openBar =
    cfg.preflop.open[posKey] - p.enterShift - (blindVsBlind ? cfg.preflop.blindVsBlindBonus : 0) - huWiden

  if (s >= openBar) {
    const limpers = obs.actionHistory.filter((e) => e.street === 'PREFLOP' && e.type === 'call').length
    const to = Math.round((cfg.sizing.openBb + cfg.sizing.perLimperBb * limpers) * obs.bigBlind)
    const a = raiseToChips(obs, to)
    if (a) return decide(a, 'Raise (open)')
  }
  // EASY over-limps a wide, weak range (a bounded, understandable leak). Only when it can enter
  // cheaply (nothing extra owed beyond the big blind) and the capability is on.
  if (
    !cfg.capabilities.threeBets && // proxy: only the limpy (easy) profile limps
    obs.toCall > 0 &&
    obs.toCall <= obs.bigBlind &&
    s >= cfg.preflop.limpEnter[posKey] - p.enterShift
  ) {
    const c = passiveContinue(obs)
    if (c) return decide(c, 'Call (limp)')
  }
  return decide(checkOrFold(obs), 'Check/Fold (preflop)')
}

// ── Postflop ────────────────────────────────────────────────────────────────────────────

function decidePostflop(obs: BotObservation, ctx: PublicContext, deps: StrategyDeps, rng: () => number): BotDecision {
  const { cfg, personality: p } = deps
  const street = obs.street as Street
  const equity = deps.equity(cfg.equitySamples.postflop)
  const board = classifyBoard(obs.board)
  const hand = classifyHand(obs.holeCards, obs.board)

  const extra = cfg.postflop.multiwayTighten * Math.max(0, ctx.opponents - 1)
  const valueBar = cfg.postflop.valueBet[street] - p.aggressionShift + extra
  const raiseBar = cfg.postflop.raiseValue[street] + extra
  const continueNeeded = potOdds(obs) + cfg.postflop.continueMargin[street] + extra

  const valueFrac = () => pickSizing(cfg.sizing.value, cfg.capabilities.mixesSizing, p.sizingBias, rng)
  const bluffFrac = () => pickSizing(cfg.sizing.bluff, cfg.capabilities.mixesSizing, p.sizingBias, rng)
  const cbetFrac = () => pickSizing(cfg.sizing.cbet, cfg.capabilities.mixesSizing, p.sizingBias, rng)

  // ── No bet to us: check or take the betting lead ───────────────────────────────────────
  if (obs.toCall === 0) {
    if (equity >= valueBar) {
      const a = betPotFraction(obs, valueFrac())
      if (a) return decide(a, 'Value Bet')
    }
    // Protection: a vulnerable made hand on a draw-heavy board bets to deny equity (not thin value).
    if (
      cfg.capabilities.protects &&
      hand.madeTier === 'medium' &&
      board.wetness >= cfg.postflop.protectionWetness &&
      equity >= valueBar - 0.14
    ) {
      const a = betPotFraction(obs, valueFrac())
      if (a) return decide(a, 'Protection Bet')
    }
    // (Delayed) C-bet as the preflop aggressor: fire the flop, or a checked-flop turn, on a
    // favourable (heads-up or dry) board, at a capped frequency.
    if (
      ctx.isPreflopAggressor &&
      (street === 'FLOP' || street === 'TURN') &&
      (ctx.opponents <= 1 || board.wetness < 0.4) &&
      rng() < cfg.postflop.cbetFreq
    ) {
      const a = betPotFraction(obs, cbetFrac())
      if (a) return decide(a, street === 'TURN' ? 'Delayed C-Bet' : 'C-Bet')
    }
    // Semi-bluff a real draw with fold equity.
    if (
      cfg.capabilities.semiBluffs &&
      hand.drawStrength >= cfg.postflop.semiBluffMinDraw &&
      rng() < cfg.postflop.semiBluffFreq * p.bluffMult
    ) {
      const a = betPotFraction(obs, bluffFrac())
      if (a) return decide(a, 'Semi-Bluff')
    }
    // Controlled pure bluff with air, heads-up and in position, capped low.
    if (
      cfg.capabilities.bluffs &&
      hand.madeTier === 'air' &&
      hand.drawStrength < 0.2 &&
      ctx.inPosition &&
      ctx.opponents <= 1 &&
      rng() < cfg.postflop.bluffFreq * p.bluffMult
    ) {
      const a = betPotFraction(obs, bluffFrac())
      if (a) return decide(a, 'Controlled Bluff')
    }
    return decide(checkOrFold(obs), 'Check')
  }

  // ── Facing a bet: raise / call / fold ──────────────────────────────────────────────────
  if (equity >= raiseBar && has(obs, 'raise')) {
    const a = raisePotFraction(obs, valueFrac())
    if (a) return decide(a, 'Raise (value)')
  }
  // Semi-bluff raise / check-raise a strong draw, capped and only when raising is open.
  if (
    cfg.capabilities.semiBluffs &&
    hand.drawStrength >= cfg.postflop.semiBluffMinDraw &&
    has(obs, 'raise') &&
    rng() < cfg.postflop.semiBluffFreq * p.bluffMult * 0.5
  ) {
    const a = raisePotFraction(obs, bluffFrac())
    if (a) return decide(a, 'Check-Raise (semi-bluff)')
  }
  // Continue by equity vs price (a made hand or a priced-in draw calls). Strong draws get a small
  // implied-odds allowance when deep.
  const drawAllowance = hand.drawStrength >= cfg.postflop.semiBluffMinDraw && ctx.spr > 3 ? 0.05 : 0
  if (equity >= continueNeeded - drawAllowance) {
    const c = passiveContinue(obs)
    if (c) return decide(c, 'Call')
  }
  return decide(checkOrFold(obs), 'Fold')
}

function has(obs: BotObservation, type: AppliedAction['type']): boolean {
  return obs.legal.some((a) => a.type === type)
}

// Route a decision by street. Board < 3 cards (preflop) uses the range model; flop+ uses equity +
// classification. The single entry the policies call.
export function decideStrategy(
  obs: BotObservation,
  ctx: PublicContext,
  deps: StrategyDeps,
  rng: () => number,
): BotDecision {
  if (obs.street === 'PREFLOP' || obs.board.length < 3) {
    return decidePreflop(obs, ctx, deps, rng)
  }
  return decidePostflop(obs, ctx, deps, rng)
}
