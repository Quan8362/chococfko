// ─────────────────────────────────────────────────────────────────────────────
// Baseline + AI simulation policies.
//
// Several distinct opponent styles so a candidate is never evaluated only against
// copies of itself. Every policy uses the SHARED legal-move generator (no private
// rules) and only its own hand + public state. The AI policies wrap chooseBotMoveAI.
// ─────────────────────────────────────────────────────────────────────────────
import { R2, parseCombo } from '../engine.ts'
import { type RoundState } from '../round.ts'
import { buildLegalMoves } from '../ai/legalMoves.ts'
import { type LegalMove } from '../ai/types.ts'
import { type BotStrategyWeights, POLICY_EXPERT } from '../ai/weights.ts'
import { type BotDifficulty } from '../ai/policy.ts'
import { chooseBotMoveAI } from '../ai/index.ts'
import { chooseBotMove as legacyBot } from '../bot.ts'
import { seededChoice } from '../ai/seededRandom.ts'
import { type SimPolicy, type BotMove } from './simulator.ts'

export type SimulationPolicyName =
  | 'randomLegal' | 'lowestLegal' | 'greedyCardReduction'
  | 'combinationPreserver' | 'defensive' | 'currentProduction'
  | 'aggressiveControl' | 'bombConserver' | 'bombAggressor'
  | 'singleCardBlocker' | 'highCardConserver' | 'endgameSpecialist'
  | 'aiNormal' | 'aiHard' | 'aiExpert' | 'expertV1' | 'candidateTrained'

function movesFor(state: RoundState, seat: number): LegalMove[] {
  const table = state.trick ? parseCombo(state.trick.cards) : null
  return buildLegalMoves(state.hands[seat], table, state.rules, state.mustIncludeThreeSpade)
}
const canPass = (state: RoundState): boolean => state.trick !== null
const isPremium = (m: LegalMove): boolean => m.isBomb || m.cards.some(c => c.rank === R2)

// randomLegal — uniform over all legal decisions (incl. pass when following).
function randomLegal(state: RoundState, seat: number, rng: () => number): BotMove {
  const moves = movesFor(state, seat)
  const pool: BotMove[] = moves.map(m => ({ type: 'play', cards: m.cards }))
  if (canPass(state)) pool.push({ type: 'pass' })
  return seededChoice(pool, rng) ?? { type: 'pass' }
}

// lowestLegal — always the lowest legal move (by high card, then fewest cards).
function lowestLegal(state: RoundState, seat: number): BotMove {
  const moves = movesFor(state, seat)
  if (moves.length === 0) return { type: 'pass' }
  const m = moves.slice().sort((a, b) => a.primaryRank - b.primaryRank || a.cardCount - b.cardCount)[0]
  return { type: 'play', cards: m.cards }
}

// greedyCardReduction — dump the most cards per turn (ties → lowest).
function greedyCardReduction(state: RoundState, seat: number): BotMove {
  const moves = movesFor(state, seat)
  if (moves.length === 0) return { type: 'pass' }
  const m = moves.slice().sort((a, b) => b.cardCount - a.cardCount || a.primaryRank - b.primaryRank)[0]
  return { type: 'play', cards: m.cards }
}

// combinationPreserver — avoid fragmenting groups; lead complete groups / isolated lows.
function combinationPreserver(state: RoundState, seat: number): BotMove {
  const moves = movesFor(state, seat)
  if (moves.length === 0) return { type: 'pass' }
  const handCount = (rank: number) => state.hands[seat].filter(c => c.rank === rank).length
  const breakScore = (m: LegalMove): number => {
    if (m.combinationType === 'single' || m.combinationType === 'pair' || m.combinationType === 'triple') {
      const had = handCount(m.primaryRank)
      return had > m.cardCount ? (had - m.cardCount) : 0 // leftover same-rank cards = fragmentation
    }
    return 0
  }
  const m = moves.slice().sort((a, b) =>
    breakScore(a) - breakScore(b) || a.primaryRank - b.primaryRank || b.cardCount - a.cardCount)[0]
  return { type: 'play', cards: m.cards }
}

// defensive — conserve 2s/bombs; pass cheaply unless threatened or out is reachable.
function defensive(state: RoundState, seat: number): BotMove {
  const moves = movesFor(state, seat)
  if (moves.length === 0) return { type: 'pass' }
  const others = state.seats.filter(s => s !== seat)
  const minOpp = others.length ? Math.min(...others.map(s => state.hands[s].length)) : Infinity
  const goOut = moves.filter(m => m.cardCount === state.hands[seat].length)
  if (goOut.length) return { type: 'play', cards: goOut.sort((a, b) => a.primaryRank - b.primaryRank)[0].cards }
  const nonPrem = moves.filter(m => !isPremium(m))
  if (!canPass(state)) {
    const pool = nonPrem.length ? nonPrem : moves
    return { type: 'play', cards: pool.sort((a, b) => a.primaryRank - b.primaryRank || a.cardCount - b.cardCount)[0].cards }
  }
  if (nonPrem.length) return { type: 'play', cards: nonPrem.sort((a, b) => a.primaryRank - b.primaryRank)[0].cards }
  if (minOpp <= 2) return { type: 'play', cards: moves.sort((a, b) => a.primaryRank - b.primaryRank)[0].cards }
  return { type: 'pass' }
}

const minOpp = (state: RoundState, seat: number): number => {
  const others = state.seats.filter(s => s !== seat)
  return others.length ? Math.min(...others.map(s => state.hands[s].length)) : Infinity
}

// aggressiveControl — seize/keep the lead with the biggest non-bomb shapes; when
// following, answer with the lowest sufficient beat. Conserves bombs for chops.
function aggressiveControl(state: RoundState, seat: number): BotMove {
  const moves = movesFor(state, seat)
  if (moves.length === 0) return { type: 'pass' }
  const goOut = moves.filter(m => m.cardCount === state.hands[seat].length)
  if (goOut.length) return { type: 'play', cards: goOut[0].cards }
  if (!canPass(state)) {
    const nonBomb = moves.filter(m => !m.isBomb)
    const pool = nonBomb.length ? nonBomb : moves
    const m = pool.slice().sort((a, b) => b.cardCount - a.cardCount || a.primaryRank - b.primaryRank)[0]
    return { type: 'play', cards: m.cards }
  }
  const nonBomb = moves.filter(m => !m.isBomb)
  const pool = nonBomb.length ? nonBomb : moves
  return { type: 'play', cards: pool.slice().sort((a, b) => a.primaryRank - b.primaryRank)[0].cards }
}

// bombConserver — never spend a bomb unless it finishes or is the only legal move.
function bombConserver(state: RoundState, seat: number): BotMove {
  const moves = movesFor(state, seat)
  if (moves.length === 0) return { type: 'pass' }
  const goOut = moves.filter(m => m.cardCount === state.hands[seat].length)
  if (goOut.length) return { type: 'play', cards: goOut.sort((a, b) => a.primaryRank - b.primaryRank)[0].cards }
  const nonBomb = moves.filter(m => !m.isBomb)
  if (nonBomb.length === 0) return canPass(state) ? { type: 'pass' } : { type: 'play', cards: moves[0].cards }
  return { type: 'play', cards: nonBomb.slice().sort((a, b) => a.primaryRank - b.primaryRank || a.cardCount - b.cardCount)[0].cards }
}

// bombAggressor — chop with a bomb whenever following lets one, else lowest lead.
function bombAggressor(state: RoundState, seat: number): BotMove {
  const moves = movesFor(state, seat)
  if (moves.length === 0) return { type: 'pass' }
  if (canPass(state)) {
    const bomb = moves.filter(m => m.isBomb)
    if (bomb.length && minOpp(state, seat) <= 4) return { type: 'play', cards: bomb.sort((a, b) => a.primaryRank - b.primaryRank)[0].cards }
  }
  return { type: 'play', cards: moves.slice().sort((a, b) => a.primaryRank - b.primaryRank || a.cardCount - b.cardCount)[0].cards }
}

// singleCardBlocker — when an opponent is low (≤2) and we lead, lead a hard combo
// (multi-card, else the highest single) so they cannot cheaply win; else lowest.
function singleCardBlocker(state: RoundState, seat: number): BotMove {
  const moves = movesFor(state, seat)
  if (moves.length === 0) return { type: 'pass' }
  const goOut = moves.filter(m => m.cardCount === state.hands[seat].length)
  if (goOut.length) return { type: 'play', cards: goOut[0].cards }
  if (!canPass(state) && minOpp(state, seat) <= 2) {
    const multi = moves.filter(m => m.cardCount >= 2)
    if (multi.length) return { type: 'play', cards: multi.sort((a, b) => b.primaryRank - a.primaryRank)[0].cards }
    return { type: 'play', cards: moves.sort((a, b) => b.primaryRank - a.primaryRank)[0].cards }
  }
  const nonPrem = moves.filter(m => !isPremium(m))
  const pool = nonPrem.length ? nonPrem : moves
  if (canPass(state) && !nonPrem.length && minOpp(state, seat) > 2) return { type: 'pass' }
  return { type: 'play', cards: pool.sort((a, b) => a.primaryRank - b.primaryRank)[0].cards }
}

// highCardConserver — hoard 2s/high cards; dump lowest, pass on premium when calm.
function highCardConserver(state: RoundState, seat: number): BotMove {
  const moves = movesFor(state, seat)
  if (moves.length === 0) return { type: 'pass' }
  const goOut = moves.filter(m => m.cardCount === state.hands[seat].length)
  if (goOut.length) return { type: 'play', cards: goOut.sort((a, b) => a.primaryRank - b.primaryRank)[0].cards }
  const cheap = moves.filter(m => !isPremium(m) && m.primaryRank < R2)
  if (cheap.length) return { type: 'play', cards: cheap.sort((a, b) => a.primaryRank - b.primaryRank)[0].cards }
  if (canPass(state)) return { type: 'pass' }
  return { type: 'play', cards: moves.sort((a, b) => a.primaryRank - b.primaryRank)[0].cards }
}

// endgameSpecialist — calm early (lowest singles), but in the endgame (any opponent
// ≤3 or own hand ≤5) shed the most cards per turn and spend premiums to finish.
function endgameSpecialist(state: RoundState, seat: number): BotMove {
  const moves = movesFor(state, seat)
  if (moves.length === 0) return { type: 'pass' }
  const goOut = moves.filter(m => m.cardCount === state.hands[seat].length)
  if (goOut.length) return { type: 'play', cards: goOut.sort((a, b) => a.primaryRank - b.primaryRank)[0].cards }
  const endgame = minOpp(state, seat) <= 3 || state.hands[seat].length <= 5
  if (endgame) return { type: 'play', cards: moves.slice().sort((a, b) => b.cardCount - a.cardCount || a.primaryRank - b.primaryRank)[0].cards }
  const nonPrem = moves.filter(m => !isPremium(m))
  if (nonPrem.length) return { type: 'play', cards: nonPrem.sort((a, b) => a.primaryRank - b.primaryRank)[0].cards }
  return canPass(state) ? { type: 'pass' } : { type: 'play', cards: moves.sort((a, b) => a.primaryRank - b.primaryRank)[0].cards }
}

// ── Policy registry ──────────────────────────────────────────────────────────
export function makePolicy(
  name: SimulationPolicyName,
  opts: { difficulty?: BotDifficulty; weights?: BotStrategyWeights } = {},
): SimPolicy {
  switch (name) {
    case 'randomLegal': return { name, decide: (s, seat, rng) => randomLegal(s, seat, rng) }
    case 'lowestLegal': return { name, decide: (s, seat) => lowestLegal(s, seat) }
    case 'greedyCardReduction': return { name, decide: (s, seat) => greedyCardReduction(s, seat) }
    case 'combinationPreserver': return { name, decide: (s, seat) => combinationPreserver(s, seat) }
    case 'defensive': return { name, decide: (s, seat) => defensive(s, seat) }
    case 'currentProduction': return { name, decide: (s, seat) => legacyBot(s, seat) }
    case 'aggressiveControl': return { name, decide: (s, seat) => aggressiveControl(s, seat) }
    case 'bombConserver': return { name, decide: (s, seat) => bombConserver(s, seat) }
    case 'bombAggressor': return { name, decide: (s, seat) => bombAggressor(s, seat) }
    case 'singleCardBlocker': return { name, decide: (s, seat) => singleCardBlocker(s, seat) }
    case 'highCardConserver': return { name, decide: (s, seat) => highCardConserver(s, seat) }
    case 'endgameSpecialist': return { name, decide: (s, seat) => endgameSpecialist(s, seat) }
    case 'aiNormal': return aiPolicy('aiNormal', 'normal', opts.weights)
    case 'aiHard': return aiPolicy('aiHard', 'hard', opts.weights)
    case 'aiExpert': return aiPolicy('aiExpert', 'expert', opts.weights)
    case 'expertV1': return aiPolicy('expertV1', 'expert', opts.weights ?? POLICY_EXPERT.weights)
    case 'candidateTrained': return aiPolicy('candidateTrained', opts.difficulty ?? 'hard', opts.weights)
  }
}

function aiPolicy(name: string, difficulty: BotDifficulty, weights?: BotStrategyWeights): SimPolicy {
  return {
    name,
    decide: (state, seat, _rng, seen) => chooseBotMoveAI(
      state, seat,
      { difficulty, weights, seed: `${name}|${seat}|${seen.length}|${state.turnSeat}|${state.hands[seat].map(c => c.rank * 4 + c.suit).join('')}` },
      seen,
    ),
  }
}
