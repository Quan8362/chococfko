// ─────────────────────────────────────────────────────────────────────────────
// Feature extraction — turns a (state, candidate move) into a structured vector.
// moveScoring multiplies these by BotStrategyWeights. Keeping features pure and
// explicit makes every decision explainable and the optimizer's job well-defined.
// ─────────────────────────────────────────────────────────────────────────────
import { type Card, RANKS, R2, strength } from '../engine.ts'
import { type LegalMove, type MoveFeatures, type PolicyView } from './types.ts'
import { analyzeHand, estimateMinimumTurnsToFinish } from './handAnalysis.ts'
import { keepsControlProbability, chanceOpponentBeats } from './opponentModel.ts'
import { assessDanger } from './dangerAnalysis.ts'

const R_KING = RANKS.indexOf('K')

function removeCards(hand: Card[], cards: Card[]): Card[] {
  const out = hand.slice()
  for (const c of cards) {
    const i = out.findIndex(h => h.rank === c.rank && h.suit === c.suit)
    if (i >= 0) out.splice(i, 1)
  }
  return out
}

function rankCount(hand: Card[], rank: number): number {
  return hand.reduce((n, c) => (c.rank === rank ? n + 1 : n), 0)
}

export function extractFeatures(view: PolicyView, move: LegalMove): MoveFeatures {
  const remaining = removeCards(view.myHand, move.cards)
  const danger = assessDanger(view)
  const analysis = analyzeHand(remaining)

  // Fragmentation: did this move peel cards out of a larger same-rank group, or
  // consume material that was part of a pair/bomb? (Straights inherently borrow one
  // card per rank — flagged only when they split a pair or a four.)
  let breaksPair = false, breaksTriple = false, breaksBomb = false
  const breaksStraightFlag = false
  if (move.combinationType === 'single' || move.combinationType === 'pair' || move.combinationType === 'triple') {
    const had = move.cardCount + rankCount(remaining, move.primaryRank)
    if (had === 4) breaksBomb = true
    else if (had === 3 && move.cardCount < 3) breaksTriple = true
    else if (had === 2 && move.cardCount < 2) breaksPair = true
  } else if (move.combinationType === 'straight') {
    for (const c of move.cards) {
      const left = rankCount(remaining, c.rank)
      if (left + 1 === 4) breaksBomb = true
      else if (left >= 1) breaksPair = true // left a partner behind → split a pair
    }
  }

  const keepsControl = keepsControlProbability(view, move)
  const minOpp = danger.minOpponentCards
  const risk =
    minOpp <= 1 ? chanceOpponentBeats(view, move) :
    minOpp <= 2 ? 0.5 * chanceOpponentBeats(view, move) : 0

  const immediateWin = remaining.length === 0
  // Forced-win pressure depends on the RESULTING hand's finishability (how few plays
  // remain), NOT on this move's own strength — otherwise it perversely rewards
  // dumping a bomb / high pair just to leave a tidy hand. Control is scored separately.
  const forcedWinEstimate = immediateWin
    ? 1
    : (analysis.minTurns <= 1 ? 0.5 : analysis.minTurns <= 2 ? 0.2 : 0)

  return {
    cardsRemoved: move.cardCount,
    remainingCardCount: remaining.length,
    estimatedTurnsToFinish: estimateMinimumTurnsToFinish(remaining),
    remainingSingles: analysis.singles,
    remainingPairs: analysis.pairs,
    remainingTriples: analysis.triples,
    remainingStraights: analysis.straights,
    remainingBombs: analysis.bombs,
    breaksPair,
    breaksTriple,
    breaksStraight: breaksStraightFlag,
    breaksBomb,
    keepsControlProbability: keepsControl,
    dangerousOpponentCardCount: minOpp === Infinity ? 99 : minOpp,
    dangerousOpponentActsNext: danger.dangerousOpponentActsNext,
    allowsImmediateOpponentWinRisk: risk,
    immediateWin,
    forcedWinEstimate,
    usesTwo: move.cards.some(c => c.rank === R2),
    usesBomb: move.isBomb,
    highCardStrength: move.cards.reduce((m, c) => (c.rank >= R_KING ? m + strength(c) : m), 0),
  }
}
