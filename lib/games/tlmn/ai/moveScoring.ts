// ─────────────────────────────────────────────────────────────────────────────
// Move scoring — features × weights, with a full per-term breakdown.
//
// Play and pass are scored on the SAME base axis (estimated turns to finish), so
// the policy can compare "play X" against "pass" directly. The endgame priority
// order from the spec is encoded by the relative weight magnitudes:
//   1 win now  >  2 prevent loss  >  3 forced win  >  4 control  >  5 deny opp
//   >  6 structure  >  7 conserve strong cards.
// ─────────────────────────────────────────────────────────────────────────────
import { RANKS } from '../engine.ts'
import { type LegalMove, type MoveFeatures, type PolicyView, type ScoredDecision } from './types.ts'
import { type BotStrategyWeights } from './weights.ts'
import { extractFeatures } from './moveFeatures.ts'
import { analyzeHand, estimateMinimumTurnsToFinish } from './handAnalysis.ts'
import { assessDanger } from './dangerAnalysis.ts'
import { chanceOpponentBeats } from './opponentModel.ts'

const R_KING = RANKS.indexOf('K')

type Term = { term: string; contribution: number }

function push(out: Term[], term: string, contribution: number): void {
  if (contribution !== 0) out.push({ term, contribution })
}

export function scoreMove(
  view: PolicyView,
  move: LegalMove,
  weights: BotStrategyWeights,
  precomputed?: MoveFeatures,
): { score: number; features: MoveFeatures; breakdown: Term[] } {
  const f = precomputed ?? extractFeatures(view, move)
  const leading = view.table === null
  const minOpp = f.dangerousOpponentCardCount
  const b: Term[] = []

  // Shared base: fewer remaining turns is better (comparable to pass).
  push(b, 'reduceTurnsToFinish', -weights.reduceTurnsToFinish * f.estimatedTurnsToFinish)

  // 1) Win now.
  if (f.immediateWin) push(b, 'immediateWin', weights.immediateWin)
  // 3) Forced-win pressure (kept below win/prevent by construction).
  push(b, 'forcedWin', 0.25 * weights.immediateWin * f.forcedWinEstimate)

  // 2) Prevent immediate loss + block dangerous opponents.
  if (minOpp <= 1) {
    push(b, 'blockOneCardOpponent', weights.blockOneCardOpponent * f.keepsControlProbability * (move.cardCount >= 2 ? 1 : 0.25))
    push(b, 'preventImmediateLoss', -weights.preventImmediateLoss * f.allowsImmediateOpponentWinRisk)
    if (leading && move.combinationType === 'single')
      push(b, 'unsafeSingleLead', -weights.unsafeSingleLeadPenalty)
  } else if (minOpp <= 2) {
    push(b, 'blockTwoCardOpponent', weights.blockTwoCardOpponent * f.keepsControlProbability * (move.cardCount >= 2 ? 1 : 0.3))
    push(b, 'preventImmediateLoss', -weights.preventImmediateLoss * 0.5 * f.allowsImmediateOpponentWinRisk)
  }

  // 4) Control.
  push(b, leading ? 'maintainControl' : 'regainControl',
    (leading ? weights.maintainControl : weights.regainControl) * f.keepsControlProbability)
  if (f.dangerousOpponentActsNext)
    push(b, 'seatOrderDanger', -weights.seatOrderDanger * chanceOpponentBeats(view, move))

  // 5) Deny the table to opponents (prefer leads they likely cannot answer).
  if (leading) push(b, 'opponentMatchProbability', -weights.opponentMatchProbability * chanceOpponentBeats(view, move))

  // Progress.
  push(b, 'cardsRemoved', weights.cardsRemoved * f.cardsRemoved)
  if (leading && move.combinationType === 'single' && move.primaryRank < R_KING)
    push(b, 'removeWeakSingles', weights.removeWeakSingles)

  // 6) Structure preservation (penalise fragmenting useful groups).
  if (f.breaksPair) push(b, 'breakPair', -weights.preservePair)
  if (f.breaksTriple) push(b, 'breakTriple', -weights.preserveTriple)
  if (f.breaksStraight) push(b, 'breakStraight', -weights.preserveStraight)
  if (f.breaksBomb) push(b, 'breakBomb', -weights.preserveBomb)
  if (f.breaksPair || f.breaksTriple || f.breaksStraight || f.breaksBomb)
    push(b, 'breakCombination', -weights.breakCombinationPenalty)
  push(b, 'futureFlexibility', weights.futureFlexibility * (f.remainingPairs + f.remainingTriples + f.remainingStraights + 2 * f.remainingBombs))

  // 7) Conserve strong cards.
  push(b, 'highCardCost', -weights.highCardCost * (f.highCardStrength / 4))
  if (f.usesTwo && !f.immediateWin && minOpp > 2) push(b, 'wasteTwo', -weights.wasteTwoPenalty)
  if (f.usesBomb && !f.immediateWin && minOpp > 2) push(b, 'preserveBomb', -weights.preserveBomb)

  const score = b.reduce((acc, t) => acc + t.contribution, 0)
  return { score, features: f, breakdown: b }
}

// Pass is scored on the same base axis (we keep the whole hand for later) plus the
// risk of ceding the trick to a dangerous opponent. Only legal while following.
export function scorePass(view: PolicyView, weights: BotStrategyWeights): ScoredDecision {
  const turns = estimateMinimumTurnsToFinish(view.myHand)
  const a = analyzeHand(view.myHand)
  const danger = assessDanger(view)
  const b: Term[] = []
  push(b, 'reduceTurnsToFinish', -weights.reduceTurnsToFinish * turns)
  push(b, 'conserveOptions', weights.futureFlexibility * (a.pairs + a.triples + a.straights + 2 * a.bombs))
  // Conserving premiums has value — passing spends nothing.
  push(b, 'conservePremiums', 0.15 * weights.preserveBomb)
  // But ceding the trick to a low opponent risks an immediate loss.
  if (danger.minOpponentCards <= 1) push(b, 'cedeTrickRisk', -weights.preventImmediateLoss * 0.8)
  else if (danger.minOpponentCards <= 2) push(b, 'cedeTrickRisk', -weights.blockTwoCardOpponent)
  const score = b.reduce((acc, t) => acc + t.contribution, 0)
  return { decision: { kind: 'pass' }, score, features: null, breakdown: b }
}
