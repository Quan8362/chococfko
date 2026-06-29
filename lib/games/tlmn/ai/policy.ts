// ─────────────────────────────────────────────────────────────────────────────
// Heuristic policy — the one-ply decision brain (no look-ahead).
//
// Generates ALL legal candidates, scores each (+ pass when following), and picks
// the best, with seeded "creative" variation among NEAR-EQUAL moves so the bot is
// not repetitive yet never plays a clearly inferior move. Difficulty tunes the
// candidate breadth, deliberate mistakes, and tie-break variance. This module is
// pure and search-free so search.ts can use it for rollouts without recursion.
// ─────────────────────────────────────────────────────────────────────────────
import { type Decision, type PolicyView, type ScoredDecision } from './types.ts'
import { type BotStrategyWeights } from './weights.ts'
import { buildLegalMoves, tableToMove } from './legalMoves.ts'
import { tableComboFromView } from './view.ts'
import { scoreMove, scorePass } from './moveScoring.ts'
import { assessDanger } from './dangerAnalysis.ts'
import { seededChoice, seededWeightedChoice } from './seededRandom.ts'

export type BotDifficulty = 'easy' | 'normal' | 'hard' | 'expert'

export interface DifficultyConfig {
  candidateCap: number      // max candidates scored (easy = shallow)
  mistakeRate: number       // chance of an intentional sub-optimal pick (easy only)
  nearEqualMargin: number   // moves within this of the best may be chosen for variety
  useSearch: boolean        // allow the endgame search layer (handled in index.ts)
}

export const DIFFICULTY: Record<BotDifficulty, DifficultyConfig> = {
  easy: { candidateCap: 6, mistakeRate: 0.18, nearEqualMargin: 200, useSearch: false },
  normal: { candidateCap: 48, mistakeRate: 0, nearEqualMargin: 40, useSearch: false },
  hard: { candidateCap: 128, mistakeRate: 0, nearEqualMargin: 30, useSearch: false },
  expert: { candidateCap: 256, mistakeRate: 0, nearEqualMargin: 18, useSearch: true },
}

export function legalDecisions(view: PolicyView): Decision[] {
  const table = tableComboFromView(view)
  const moves = buildLegalMoves(view.myHand, table, view.rules, view.mustIncludeThreeSpade)
  const out: Decision[] = moves.map(m => ({ kind: 'play', move: m } as Decision))
  if (view.table !== null) out.push({ kind: 'pass' })
  return out
}

/** Score every legal decision (play candidates + pass when following). */
export function scoreAll(
  view: PolicyView,
  weights: BotStrategyWeights,
  cap = Infinity,
): ScoredDecision[] {
  const table = tableComboFromView(view)
  let moves = buildLegalMoves(view.myHand, table, view.rules, view.mustIncludeThreeSpade)
  if (moves.length > cap) {
    // Keep a representative spread: lowest by primary rank + the multi-card options.
    moves = moves.slice().sort((a, b) => a.primaryRank - b.primaryRank || a.cardCount - b.cardCount).slice(0, cap)
  }
  const scored: ScoredDecision[] = moves.map(m => {
    const r = scoreMove(view, m, weights)
    return { decision: { kind: 'play', move: m }, score: r.score, features: r.features, breakdown: r.breakdown }
  })
  if (view.table !== null) scored.push(scorePass(view, weights))
  return scored
}

/** Pure heuristic decision (no look-ahead). Deterministic given the seed. */
export function heuristicDecision(
  view: PolicyView,
  weights: BotStrategyWeights,
  rng: () => number,
  difficulty: BotDifficulty = 'hard',
): ScoredDecision {
  const cfg = DIFFICULTY[difficulty]
  const scored = scoreAll(view, weights, cfg.candidateCap)
  if (scored.length === 0) {
    // No legal play and (when leading) no pass — should be unreachable; pass as a guard.
    return scorePass(view, weights)
  }

  scored.sort((a, b) => b.score - a.score || decisionKey(a).localeCompare(decisionKey(b)))

  // ── Following backbone (proven, prevents card-hoarding) ──────────────────────
  // When following, SHED: play the best-scored non-premium beat rather than pass.
  // Only when every legal beat is a premium (2/bomb) do we consider passing — and
  // then only to conserve in a calm position; in danger / endgame we spend it.
  if (view.table !== null) {
    const plays = scored.filter(s => s.decision.kind === 'play')
    const nonPremiumPlays = plays.filter(s => s.features != null && !s.features.usesTwo && !s.features.usesBomb)
    const danger = assessDanger(view)
    if (nonPremiumPlays.length > 0) {
      return varyAmongNearEqual(nonPremiumPlays, cfg, rng)
    }
    // Only premium beats remain.
    const calm = danger.minOpponentCards > 2 && view.myHand.length > 4
    if (calm) {
      const pass = scored.find(s => s.decision.kind === 'pass')
      if (pass) return pass
    }
    // Danger / endgame: spend the cheapest premium beat (best-scored play).
    if (plays.length > 0) return varyAmongNearEqual(plays, cfg, rng)
    const pass = scored.find(s => s.decision.kind === 'pass')
    if (pass) return pass
  }

  return varyAmongNearEqual(scored, cfg, rng)
}

// Pick the best decision, with seeded "creative" variation among NEAR-EQUAL options
// (never a clearly inferior move) and rare deliberate mistakes for easy bots.
function varyAmongNearEqual(list: ScoredDecision[], cfg: DifficultyConfig, rng: () => number): ScoredDecision {
  const scored = list.slice().sort((a, b) => b.score - a.score || decisionKey(a).localeCompare(decisionKey(b)))
  const best = scored[0]
  if (cfg.mistakeRate > 0 && rng() < cfg.mistakeRate && scored.length > 1) {
    const blunder = seededChoice(scored.slice(1), rng)
    if (blunder) return blunder
  }
  const nearEqual = scored.filter(s => best.score - s.score <= cfg.nearEqualMargin)
  if (nearEqual.length > 1) {
    const minScore = Math.min(...nearEqual.map(s => s.score))
    const pick = seededWeightedChoice(nearEqual.map(s => ({ item: s, weight: s.score - minScore + 1 })), rng)
    if (pick) return pick
  }
  return best
}

function decisionKey(s: ScoredDecision): string {
  return s.decision.kind === 'pass' ? 'pass' : s.decision.move.id
}

// Re-export so callers can resolve the table combo consistently.
export { tableToMove }
