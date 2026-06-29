// ─────────────────────────────────────────────────────────────────────────────
// Production-integration replays.
//
// Mirrors the deployed runBotTurn path WITHOUT Supabase: build a RoundState, derive
// the PUBLIC PolicyView (policyViewFromRound — the same fairness boundary the server
// uses), let the AI choose (chooseAiMove, same difficulty='expert' the server passes),
// then COMMIT through the authoritative engine validator (applyPlay / applyPass) — the
// identical guarded path a human move takes. For each replay we capture the public
// state, the bot hand, the legal candidates, the selected move + score explanation,
// the submitted card IDs, the validator result, and the resulting state.
// ─────────────────────────────────────────────────────────────────────────────
import { type Card, type Combo, DEFAULT_RULES, parseHand, parseCombo, toCode } from '../engine.ts'
import { type RoundState, applyPlay, applyPass } from '../round.ts'
import { type BotStrategyWeights } from '../ai/weights.ts'
import { buildLegalMoves } from '../ai/legalMoves.ts'
import { chooseAiMove, policyViewFromRound } from '../ai/index.ts'

function mk(hands: Record<number, string>, over: Partial<RoundState> = {}): RoundState {
  const seats = Object.keys(hands).map(Number).sort((a, b) => a - b)
  const h: Record<number, Card[]> = {}
  const playedCount: Record<number, number> = {}
  for (const s of seats) { h[s] = parseHand(hands[s]); playedCount[s] = 13 - h[s].length }
  return {
    seats, roundNo: 2, rules: DEFAULT_RULES, hands: h, turnSeat: seats[0],
    trick: null, passed: [], playedCount, cutEvents: [],
    mustIncludeThreeSpade: false, status: 'playing', winner: null,
    instantWin: null, deltas: null, ...over,
  }
}

export interface ReplayCase { name: string; state: RoundState; seat: number; expect: string }

export const REPLAY_CASES: ReplayCase[] = [
  { name: 'plays a pair', expect: 'pair lead', seat: 0,
    state: mk({ 0: '8C 8D 4S KH', 1: 'QC QD 5S 5D', 2: 'JD JH 6S 6D' }, { turnSeat: 0 }) },
  { name: 'plays a triple (sám cô)', expect: 'triple lead', seat: 0,
    state: mk({ 0: '9C 9D 9H 4S', 1: 'KC AC 5S 5D', 2: 'KD AD 6S 6D' }, { turnSeat: 0 }) },
  { name: 'plays a straight (sảnh)', expect: 'straight', seat: 0,
    state: mk({ 0: '5C 6D 7S 8H KD', 1: 'KC AC 9S 9D', 2: 'AD QD TS TH' }, { turnSeat: 0 }) },
  { name: 'uses four of a kind to chop a single 2', expect: 'four (chặt)', seat: 0,
    state: mk({ 0: '7C 7D 7H 7S', 1: '3D', 2: '5S' },
      { turnSeat: 0, trick: { cards: parseHand('2S'), bySeat: 2 }, passed: [] }) },
  { name: 'blocks a one-card opponent with a hard lead', expect: 'multi/2 lead (no low single)', seat: 0,
    state: mk({ 0: '4C 4D 6C 9H', 1: 'KC', 2: 'KD AD' }, { turnSeat: 0, playedCount: { 0: 9, 1: 12, 2: 11 } }) },
  { name: 'converts an immediate win', expect: 'empties the hand', seat: 0,
    state: mk({ 0: '9S 9D', 1: 'KC', 2: 'KD AD' }, { turnSeat: 0, playedCount: { 0: 11, 1: 12, 2: 11 } }) },
  { name: 'passes for strategic reasons (conserve a lone 2)', expect: 'pass', seat: 0,
    state: mk({ 0: '2S 4C 5D 6H 7S 8C', 1: '9C TC JC QC KC AC', 2: '9D TD JD QD KD AD' },
      { turnSeat: 0, trick: { cards: parseHand('AH'), bySeat: 1 }, passed: [], playedCount: { 0: 7, 1: 7, 2: 7 } }) },
]

export interface ReplayResult {
  name: string
  expect: string
  publicState: { mySeat: number; table: string | null; opponents: Array<{ seat: number; cardsLeft: number; actsNext: boolean; passed: boolean }> }
  botHand: string[]
  legalCandidates: string[]
  selectedMove: string
  moveType: string | null
  scoreExplanation: string
  usedSearch: boolean
  submittedCardIds: string[]
  validatorResult: 'ok' | string
  resultingHandSize: number
  roundEnded: boolean
}

export function runReplay(c: ReplayCase, opts: { difficulty?: 'expert' | 'hard'; weights?: BotStrategyWeights } = {}): ReplayResult {
  const difficulty = opts.difficulty ?? 'expert'
  // PUBLIC view only — exactly what the server hands the bot.
  const view = policyViewFromRound(c.state, c.seat)
  const seed = `${c.seat}|${view.myHand.map(toCode).sort().join('')}|${view.table ? view.table.cards.map(toCode).sort().join('') : '-'}`
  const ai = chooseAiMove(view, { difficulty, weights: opts.weights, seed })
  const move = ai.move

  // Commit through the authoritative validator — the same guarded path a human uses.
  const res = move.type === 'play' ? applyPlay(c.state, c.seat, move.cards) : applyPass(c.state, c.seat)

  const tableCombo: Combo | null = c.state.trick ? parseCombo(c.state.trick.cards) : null
  const legal = buildLegalMoves(c.state.hands[c.seat], tableCombo, c.state.rules, c.state.mustIncludeThreeSpade)
  const moveType = move.type === 'play' ? (parseCombo(move.cards)?.type ?? null) : null

  return {
    name: c.name,
    expect: c.expect,
    publicState: {
      mySeat: view.mySeat,
      table: tableCombo ? tableCombo.cards.map(toCode).join(' ') : null,
      opponents: view.opponents.map(o => ({ seat: o.seat, cardsLeft: o.cardsLeft, actsNext: o.actsBeforeMeNext, passed: o.passedThisTrick })),
    },
    botHand: c.state.hands[c.seat].map(toCode),
    legalCandidates: legal.map(m => m.cards.map(toCode).join('') + `[${m.combinationType}]`),
    selectedMove: move.type === 'play' ? move.cards.map(toCode).join(' ') : 'PASS',
    moveType,
    scoreExplanation: ai.explanation.text,
    usedSearch: ai.usedSearch,
    submittedCardIds: move.type === 'play' ? move.cards.map(toCode) : [],
    validatorResult: res.ok ? 'ok' : res.error,
    resultingHandSize: res.ok ? res.state.hands[c.seat].length : c.state.hands[c.seat].length,
    roundEnded: res.ok ? res.state.status !== 'playing' : false,
  }
}

export function runAllReplays(opts: { difficulty?: 'expert' | 'hard'; weights?: BotStrategyWeights } = {}): ReplayResult[] {
  return REPLAY_CASES.map(c => runReplay(c, opts))
}
