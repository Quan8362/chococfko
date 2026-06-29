// ─────────────────────────────────────────────────────────────────────────────
// AI orchestrator + production adapter.
//
// chooseAiMove() combines the heuristic policy with the bounded endgame search,
// gated by difficulty + danger. chooseBotMoveAI() is the RoundState→Decision bridge
// the server (runBotTurn) and simulator call; it returns the same BotMove shape as
// the legacy bot.ts so it is a drop-in. The bot only ever receives a PolicyView
// (public info) — see view.ts / ai.fairness.test.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { type Card, toCode } from '../engine.ts'
import { type RoundState } from '../round.ts'
import { type Decision, type PolicyView, type ScoredDecision } from './types.ts'
import { type BotStrategyWeights, activeWeights } from './weights.ts'
import { makeRng, hashSeed } from './seededRandom.ts'
import { heuristicDecision, scoreAll, DIFFICULTY, type BotDifficulty } from './policy.ts'
import { endgameSearch, type SearchBudget, DEFAULT_BUDGET } from './search.ts'
import { assessDanger } from './dangerAnalysis.ts'
import { policyViewFromRound } from './view.ts'
import { explainDecision, type DecisionExplanation } from './explanation.ts'

export type BotMove = { type: 'play'; cards: Card[] } | { type: 'pass' }

export interface AiOptions {
  difficulty?: BotDifficulty
  weights?: BotStrategyWeights
  seed?: string | number
  budget?: SearchBudget
}

export interface AiDecision {
  decision: Decision
  move: BotMove
  usedSearch: boolean
  explanation: DecisionExplanation
}

function toBotMove(d: Decision): BotMove {
  return d.kind === 'play' ? { type: 'play', cards: d.move.cards } : { type: 'pass' }
}

function defaultSeed(view: PolicyView): string {
  const hand = view.myHand.map(toCode).sort().join('')
  const table = view.table ? view.table.cards.map(toCode).sort().join('') : '-'
  return `${view.mySeat}|${hand}|${table}`
}

// The endgame search overrides the heuristic only when a candidate's estimated win
// probability clearly exceeds the heuristic's pick. Below this margin the structured
// heuristic (more reliable than noisy rollouts in near-decided positions) is kept.
const SEARCH_OVERRIDE_MARGIN = 0.10
const SEARCH_TOPK = 5

/** Decide a move from a PUBLIC view. Deterministic given the seed. */
export function chooseAiMove(view: PolicyView, options: AiOptions = {}): AiDecision {
  const difficulty = options.difficulty ?? 'expert'
  const weights = options.weights ?? activeWeights()
  const baseSeed = options.seed ?? defaultSeed(view)
  const rngHeur = makeRng(baseSeed)
  const cfg = DIFFICULTY[difficulty]
  const danger = assessDanger(view)

  // Heuristic is always computed — it is the default and the search baseline.
  const all: ScoredDecision[] = scoreAll(view, weights, cfg.candidateCap)
  const heuristic = heuristicDecision(view, weights, rngHeur, difficulty)
  let chosen: Decision = heuristic.decision
  let usedSearch = false

  // Endgame search REFINES the heuristic's top-K. It overrides ONLY in CRITICAL
  // (acute) danger, ONLY into a move that does NOT raise the immediate-loss chance
  // vs the heuristic pick, and ONLY when it improves win probability by a clear
  // margin. In calm / merely-endgame positions the heuristic (which encodes
  // preservation + conservation) is authoritative — search never gambles them away.
  const wantSearch = cfg.useSearch && danger.level === 'critical'
  if (wantSearch) {
    const ranked = all.slice().sort((a, b) => b.score - a.score)
    const topK = ranked.slice(0, SEARCH_TOPK).map(s => s.decision)
    if (topK.length > 1) {
      const rngSearch = makeRng(hashSeed(String(baseSeed)) ^ 0x9e3779b9)
      const sr = endgameSearch(view, weights, rngSearch, options.budget ?? DEFAULT_BUDGET, topK)
      if (sr) {
        const evHeur = sr.evaluated.find(e => sameDecision(e.decision, heuristic.decision))
        const heurEw = evHeur?.expectedWin ?? 0
        const heurImmediate = evHeur?.immediateOppWin ?? 1
        // Best win among candidates that are NO WORSE on immediate loss than heuristic.
        const safe = sr.evaluated.filter(e => e.immediateOppWin <= heurImmediate + 1e-9)
        const evBest = safe.sort((a, b) => b.expectedWin - a.expectedWin)[0]
        if (evBest && evBest.expectedWin - heurEw >= SEARCH_OVERRIDE_MARGIN) {
          chosen = evBest.decision
          usedSearch = true
        }
      }
    }
  }

  const chosenScored = all.find(s => sameDecision(s.decision, chosen)) ?? all[0] ?? { decision: chosen, score: 0, features: null, breakdown: [] }
  const explanation = explainDecision(chosenScored, all)

  return { decision: chosen, move: toBotMove(chosen), usedSearch, explanation }
}

function sameDecision(a: Decision, b: Decision): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'pass' || b.kind === 'pass') return true
  return a.move.id === (b as { move: { id: string } }).move.id
}

/**
 * Production / simulator bridge. Builds the PUBLIC view from RoundState (own hand +
 * opponent COUNTS only) and returns a BotMove. `seenCards` lets the simulator feed
 * the full public play log for stronger card-counting; production passes the trick.
 */
export function chooseBotMoveAI(
  state: RoundState,
  seat: number,
  options: AiOptions = {},
  seenCards?: Card[],
): BotMove {
  const view = policyViewFromRound(state, seat, seenCards)
  return chooseAiMove(view, options).move
}

export { policyViewFromRound, assessDanger }
export type { BotDifficulty }
