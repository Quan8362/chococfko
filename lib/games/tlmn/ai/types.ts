// ─────────────────────────────────────────────────────────────────────────────
// Shared AI types: legal moves, features, decision context, danger levels.
//
// Pure types only. The AI policy receives a PolicyView — the bot's OWN hand plus
// PUBLIC state — and never the secret opponent hands. This boundary is the
// fairness guarantee (see opponentModel.ts + the ai.fairness.test.ts proof).
// ─────────────────────────────────────────────────────────────────────────────
import { type Card, type ComboType, type Rules } from '../engine.ts'

// A canonicalised legal candidate. `id` is a stable key (sorted card codes) so the
// same physical move dedups across straights/runs with equivalent representatives.
export interface LegalMove {
  id: string
  cards: Card[]
  combinationType: ComboType
  primaryRank: number   // rank index of the high card (comparison basis)
  cardCount: number
  isBomb: boolean
  beatsCurrentPlay: boolean
}

// A pass is modelled as a distinct decision, never a fake move.
export type Decision =
  | { kind: 'play'; move: LegalMove }
  | { kind: 'pass' }

export type DangerLevel = 'normal' | 'caution' | 'critical' | 'endgame'

// PUBLIC, per-opponent knowledge the bot is allowed to use. Mirrors what a human at
// the table can see — counts and the public play history, never hidden cards.
export interface OpponentPublic {
  seat: number
  cardsLeft: number
  actsBeforeMeNext: boolean // will this opponent act before my next turn?
  passedThisTrick: boolean
}

// What the bot policy is allowed to see. NO opponent hands. The simulator/server
// builds this from public state + the caller's own hand.
export interface PolicyView {
  mySeat: number
  myHand: Card[]
  table: LegalMove | null          // current trick combo to beat (null = leading)
  trickBySeat: number | null
  mustIncludeThreeSpade: boolean
  rules: Rules
  opponents: OpponentPublic[]
  // Public play log: every card that has left a hand this game (rank+suit visible).
  seenCards: Card[]
  // Cards each seat has played count (public).
  playedCounts: Record<number, number>
}

// Structured per-move features → multiplied by weights to produce a score.
export interface MoveFeatures {
  cardsRemoved: number
  remainingCardCount: number
  estimatedTurnsToFinish: number
  remainingSingles: number
  remainingPairs: number
  remainingTriples: number
  remainingStraights: number
  remainingBombs: number
  breaksPair: boolean
  breaksTriple: boolean
  breaksStraight: boolean
  breaksBomb: boolean
  keepsControlProbability: number
  dangerousOpponentCardCount: number
  dangerousOpponentActsNext: boolean
  allowsImmediateOpponentWinRisk: number
  immediateWin: boolean
  forcedWinEstimate: number
  usesTwo: boolean
  usesBomb: boolean
  highCardStrength: number
}

export interface ScoredDecision {
  decision: Decision
  score: number
  features: MoveFeatures | null    // null for a pass
  breakdown: Array<{ term: string; contribution: number }>
}
