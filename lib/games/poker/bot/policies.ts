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

import type { BotObservation } from './observation.ts'
import type { BotPolicy, BotDifficulty } from './policy.ts'
import { safeFallbackDecision } from './policy.ts'
import { estimateEquity, preflopStrength } from './equity.ts'
import { derivePublicContext } from './context.ts'
import { decideStrategy, type StrategyDeps } from './strategy.ts'
import {
  strategyFor,
  DEFAULT_PERSONALITY,
  PERSONALITIES,
  type Personality,
  type PersonalityId,
} from './strategyConfig.ts'

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

// ── Config-driven skill policies (easy / normal / hard) ───────────────────────────────────
//
// The three skill policies share ONE decision interpreter (strategy.ts) driven by the versioned
// per-difficulty config (strategyConfig.ts). A policy's only job is to assemble the fairness-bounded
// inputs — the cached public context, the injected equity/preflop-strength estimators (which spend
// the difficulty's Monte-Carlo budget with the bounded early-stop), and an optional personality
// overlay — and hand them to `decideStrategy`. The result is always a canonical, legal AppliedAction
// (re-validated by `decideSafely` before it reaches the engine).
//
// Difficulty (what a bot is capable of + how tight/aggressive) and personality (a bounded style
// overlay) are ORTHOGONAL: personality is off by default (`balanced`) and never widens a capability.
function makeSkillPolicy(
  difficulty: Exclude<BotDifficulty, 'simulation'>,
  personality: Personality = DEFAULT_PERSONALITY,
): BotPolicy {
  const cfg = strategyFor(difficulty)
  return (obs, rng) => {
    if (obs.legal.length === 0) return safeFallbackDecision(obs)
    const ctx = derivePublicContext(obs)
    const opponents = Math.max(1, obs.opponentsInHand)
    const deps: StrategyDeps = {
      cfg,
      personality,
      // Postflop equity: spend the difficulty's sample budget with the bounded early-stop. Uses the
      // SAME seeded rng as the policy, so a session replay is bit-for-bit identical.
      equity: (samples) =>
        estimateEquity(obs.holeCards, obs.board, opponents, samples, rng, {
          earlyStop: cfg.equityEarlyStop,
        }).equity,
      preflopStrength: () => preflopStrength(obs.holeCards),
    }
    return decideStrategy(obs, ctx, deps, rng)
  }
}

// ── easy: loose-passive beginner ─────────────────────────────────────────────────────────
// Raises its strong hands (fixes the 27C-A "PFR ~1%" passivity leak) but over-limps and over-calls,
// ignores position beyond a wider big-blind defence, never 3-bets, never bluffs. Bounded weaknesses,
// no chip-dumping and no random all-ins.
export const easyPolicy: BotPolicy = makeSkillPolicy('easy')

// ── normal: solid tight-aggressive ───────────────────────────────────────────────────────
// Position-aware ranges, equity vs pot-odds, value betting, capped semi-bluffs and positional
// bluffs, multiple legal sizings, sensible folding.
export const normalPolicy: BotPolicy = makeSkillPolicy('normal')

// ── hard: strongest approved legal-information strategy ───────────────────────────────────
// Tighter-aggressive, more equity samples, blocker-aware 3-bet bluffs, draw-based semi-bluffs,
// texture-aware c-bets / protection, varied sizing, public-action reading, river discipline. Still
// heuristic and beatable — NOT a solver, no GTO claim.
export const hardPolicy: BotPolicy = makeSkillPolicy('hard')

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

// Build a skill policy with an explicit PERSONALITY overlay (internal / simulation use only —
// personalities are not exposed publicly and never widen a difficulty's capabilities). Difficulty
// and personality remain independent axes.
export function policyWithPersonality(
  difficulty: Exclude<BotDifficulty, 'simulation'>,
  personalityId: PersonalityId,
): BotPolicy {
  return makeSkillPolicy(difficulty, PERSONALITIES[personalityId])
}
