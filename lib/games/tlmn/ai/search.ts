// ─────────────────────────────────────────────────────────────────────────────
// Bounded endgame search — Monte Carlo determinization (imperfect-information).
//
// Used only in critical/endgame states (index.ts gates this). The bot does NOT see
// real opponent hands: it SAMPLES plausible opponent hands from the unseen pool
// (consistent with public counts), reconstructs a full RoundState, and rolls the
// game out with the heuristic policy for every seat. Averaging the win indicator
// across determinizations estimates each candidate's win probability. A strict
// node/determinization budget bounds cost; the heuristic is always the fallback.
// ─────────────────────────────────────────────────────────────────────────────
import { type Card } from '../engine.ts'
import { type RoundState, applyPlay, applyPass } from '../round.ts'
import { type Decision, type PolicyView } from './types.ts'
import { type BotStrategyWeights } from './weights.ts'
import { unseenCards } from './opponentModel.ts'
import { policyViewFromRound } from './view.ts'
import { heuristicDecision, legalDecisions } from './policy.ts'

export interface SearchBudget {
  determinizations: number // independent opponent-hand samples
  maxRolloutSteps: number  // safety cap per rollout
  maxNodes: number         // global cap across the whole search call
}

export const DEFAULT_BUDGET: SearchBudget = { determinizations: 16, maxRolloutSteps: 200, maxNodes: 40000 }

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// Sample one full RoundState consistent with the public view: our real hand + a
// random legal assignment of unseen cards to opponents matching their counts.
function determinize(view: PolicyView, rng: () => number): RoundState {
  const pool = shuffle(unseenCards(view), rng)
  const hands: Record<number, Card[]> = { [view.mySeat]: view.myHand.slice() }
  let idx = 0
  for (const opp of view.opponents) {
    hands[opp.seat] = pool.slice(idx, idx + opp.cardsLeft)
    idx += opp.cardsLeft
  }
  const seats = [view.mySeat, ...view.opponents.map(o => o.seat)].sort((a, b) => a - b)
  const passed = view.opponents.filter(o => o.passedThisTrick).map(o => o.seat)
  const playedCount: Record<number, number> = {}
  for (const s of seats) playedCount[s] = view.playedCounts[s] ?? 0

  return {
    seats,
    roundNo: 2,
    rules: view.rules,
    hands,
    turnSeat: view.mySeat,
    trick: view.table ? { cards: view.table.cards.slice(), bySeat: view.trickBySeat ?? view.mySeat } : null,
    passed,
    playedCount,
    cutEvents: [],
    mustIncludeThreeSpade: view.mustIncludeThreeSpade,
    status: 'playing',
    winner: null,
    instantWin: null,
    deltas: null,
  }
}

// Roll a determinized state to the end with the heuristic policy for every seat.
// Returns win (mySeat is the first out) and immediateLoss (an opponent went out
// BEFORE mySeat got another turn — i.e. our move directly permitted the loss).
function rollout(
  state: RoundState, mySeat: number, weights: BotStrategyWeights,
  rng: () => number, budget: SearchBudget, nodes: { n: number },
): { win: number; immediateLoss: number } {
  let st = state
  let steps = 0
  let myTurnSeen = false
  while (st.status === 'playing' && steps++ < budget.maxRolloutSteps && nodes.n < budget.maxNodes) {
    nodes.n++
    const seat = st.turnSeat
    if (seat === mySeat) myTurnSeen = true
    const view = policyViewFromRound(st, seat)
    const decision = heuristicDecision(view, weights, rng, 'normal').decision
    const res = decision.kind === 'play'
      ? applyPlay(st, seat, decision.move.cards)
      : applyPass(st, seat)
    if (!res.ok) {
      const legal = legalDecisions(view)
      const alt = legal.find(d => d.kind === 'play')
      const r2 = alt && alt.kind === 'play' ? applyPlay(st, seat, alt.move.cards) : applyPass(st, seat)
      if (!r2.ok) break
      st = r2.state
      continue
    }
    st = res.state
  }
  const win = st.status === 'ended' && st.winner === mySeat ? 1 : 0
  // Immediate loss: an opponent won and we never acted again after our first move.
  const immediateLoss = st.status === 'ended' && st.winner !== mySeat && !myTurnSeen ? 1 : 0
  return { win, immediateLoss }
}

export interface SearchEval { decision: Decision; expectedWin: number; immediateOppWin: number }
export interface SearchResult {
  decision: Decision
  expectedWin: number
  evaluated: SearchEval[]
}

/**
 * Estimate each candidate decision's win probability via determinized rollouts and
 * return the best. Returns null if there is nothing to search (≤1 option) so the
 * caller falls back to the heuristic.
 */
export function endgameSearch(
  view: PolicyView,
  weights: BotStrategyWeights,
  rng: () => number,
  budget: SearchBudget = DEFAULT_BUDGET,
  candidateSubset?: Decision[],
): SearchResult | null {
  const candidates = candidateSubset ?? legalDecisions(view)
  if (candidates.length <= 1) return null

  const nodes = { n: 0 }
  const samples = Array.from({ length: budget.determinizations }, () => determinize(view, rng))

  let best: SearchEval | null = null
  const evaluated: SearchEval[] = []

  for (const cand of candidates) {
    let wins = 0
    let immediate = 0
    let runs = 0
    for (const sample of samples) {
      if (nodes.n >= budget.maxNodes) break
      // round.ts reducers return fresh states, so re-using the same starting sample
      // object across candidates is safe; apply the candidate first.
      const first = cand.kind === 'play'
        ? applyPlay(sample, view.mySeat, cand.move.cards)
        : applyPass(sample, view.mySeat)
      if (!first.ok) continue
      runs++
      if (first.state.status === 'ended') { if (first.state.winner === view.mySeat) wins++; continue }
      const r = rollout(first.state, view.mySeat, weights, rng, budget, nodes)
      wins += r.win
      immediate += r.immediateLoss
    }
    const evalEntry: SearchEval = {
      decision: cand,
      expectedWin: runs > 0 ? wins / runs : 0,
      immediateOppWin: runs > 0 ? immediate / runs : 1,
    }
    evaluated.push(evalEntry)
    if (!best || evalEntry.expectedWin > best.expectedWin) best = evalEntry
  }

  if (!best) return null
  return { decision: best.decision, expectedWin: best.expectedWin, evaluated }
}
