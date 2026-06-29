// AI policy unit tests — generation, fairness, blocking, finishing, structure,
// determinism, and the hand-decomposition solver. Run:
//   node --test lib/games/tlmn/ai/ai.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseHand, parseCard, DEFAULT_RULES, createDeck, shuffle, beats, parseCombo, toCode,
  type Card,
} from '../engine.ts'
import { dealRound, applyPlay, applyPass, type RoundState } from '../round.ts'
import { buildLegalMoves } from './legalMoves.ts'
import { policyViewFromRound } from './view.ts'
import { chooseAiMove, chooseBotMoveAI } from './index.ts'
import { estimateMinimumTurnsToFinish } from './handAnalysis.ts'
import { unseenCards, chanceOpponentBeats } from './opponentModel.ts'
import { type PolicyView } from './types.ts'

function mk(hands: Record<number, string>, over: Partial<RoundState> = {}): RoundState {
  const seats = Object.keys(hands).map(Number).sort((a, b) => a - b)
  const h: Record<number, Card[]> = {}
  const pc: Record<number, number> = {}
  for (const s of seats) { h[s] = parseHand(hands[s]); pc[s] = 13 - h[s].length }
  return {
    seats, roundNo: 2, rules: DEFAULT_RULES, hands: h, turnSeat: seats[0],
    trick: null, passed: [], playedCount: pc, cutEvents: [],
    mustIncludeThreeSpade: false, status: 'playing', winner: null, instantWin: null, deltas: null, ...over,
  }
}
const cardsOf = (m: { type: string; cards?: Card[] }) => (m.cards ?? []).map(toCode)

// 1) Complete generation of all supported combination types.
test('legal-move generator emits every supported combination type', () => {
  const hand = parseHand('3C 3D 5C 5D 5H 6C 7D 8S 9C 9D 9H 9S')
  const moves = buildLegalMoves(hand, null, DEFAULT_RULES)
  const types = new Set(moves.map(m => m.combinationType))
  for (const t of ['single', 'pair', 'triple', 'straight', 'four']) assert.ok(types.has(t as never), `has ${t}`)
  // canonical-id dedup: no duplicate ids
  assert.equal(new Set(moves.map(m => m.id)).size, moves.length)
})

// 11) Minimum-turn hand decomposition is correct.
test('hand-decomposition finds the true minimum number of plays', () => {
  assert.equal(estimateMinimumTurnsToFinish(parseHand('3C 4D 5S')), 1)          // one straight
  assert.equal(estimateMinimumTurnsToFinish(parseHand('7C 7D 7H 7S')), 1)       // one tứ quý
  assert.equal(estimateMinimumTurnsToFinish(parseHand('3C 3D 4C 4D 5C 5D')), 1) // one đôi thông
  assert.equal(estimateMinimumTurnsToFinish(parseHand('3C 9D')), 2)             // two singles
  assert.equal(estimateMinimumTurnsToFinish(parseHand('7C 7D 7H 7S TC')), 2)    // four + single
})

// 3) Hidden cards are not exposed to the policy.
test('PolicyView carries opponent COUNTS only — never their cards', () => {
  const state = mk({ 0: '3C 4D 5S', 1: 'KC AC QS', 2: 'KD AD QH' }, { turnSeat: 0 })
  const view = policyViewFromRound(state, 0)
  const mine = new Set(view.myHand.map(toCode))
  // The only concrete cards in the view are our own hand + the public table/seen log.
  for (const opp of view.opponents) {
    assert.equal(typeof opp.cardsLeft, 'number')
    assert.ok(!('cards' in opp), 'opponent object exposes no cards')
  }
  // The unseen pool must include the opponents' actual cards (i.e. they are UNSEEN to us).
  const unseen = new Set(unseenCards(view).map(toCode))
  for (const c of [...state.hands[1], ...state.hands[2]]) {
    assert.ok(unseen.has(toCode(c)) || mine.has(toCode(c)), 'opponent card is unseen, not leaked')
  }
})

// 4) Immediate winning move is always selected.
test('always takes an immediate win', () => {
  const m = chooseBotMoveAI(mk({ 0: '9S 9D', 1: 'KC', 2: 'KD AD' }, { turnSeat: 0, playedCount: { 0: 11, 1: 12, 2: 11 } }), 0, { difficulty: 'expert' })
  assert.equal(m.type, 'play')
  assert.equal(m.cards?.length, 2)
})

// 5/6/7) Block an opponent on one card — prefer a multi-card lead over an unsafe single.
test('blocks a one-card opponent with a multi-card lead, not a low single', () => {
  for (const hand of ['4C 4D 6C 9H', '5C 5D 5H 8S', '4C 5D 6S 9H']) {
    const m = chooseBotMoveAI(mk({ 0: hand, 1: 'KC', 2: 'QD JD' }, { turnSeat: 0, playedCount: { 0: 9, 1: 12, 2: 11 } }), 0, { difficulty: 'expert' })
    assert.equal(m.type, 'play')
    assert.ok((m.cards?.length ?? 0) >= 2, `multi-card lead for ${hand}, got ${cardsOf(m)}`)
  }
})

// 8) Bomb is preserved in normal play.
test('preserves a tứ quý in a calm position (sheds the loose card)', () => {
  const m = chooseBotMoveAI(mk({ 0: '7C 7D 7H 7S 3C', 1: 'KC AC 5S 5D', 2: 'KD AD 8S 8D' }, { turnSeat: 0 }), 0, { difficulty: 'expert' })
  assert.equal(m.type, 'play')
  assert.notEqual(parseCombo(m.cards!)!.type, 'four')
})

// 9) Bomb is spent when necessary (chop a single 2 from a dangerous opponent).
test('spends a bomb to chop a single 2 when threatened', () => {
  const state = mk({ 0: '7C 7D 7H 7S', 1: '3D', 2: '5S' },
    { turnSeat: 0, trick: { cards: parseHand('2S'), bySeat: 2 }, playedCount: { 0: 9, 1: 12, 2: 12 } })
  const m = chooseBotMoveAI(state, 0, { difficulty: 'expert' })
  assert.equal(parseCombo(m.cards!)?.type, 'four')
})

// 10) Useful combinations are not broken without reason.
test('does not shatter a triple to follow a single', () => {
  const state = mk({ 0: '5H 9S 9D 9C', 1: 'KS 2S 3D 4D', 2: 'KD AD 7S 7D' },
    { turnSeat: 0, trick: { cards: [parseCard('4S')], bySeat: 1 } })
  const m = chooseBotMoveAI(state, 0, { difficulty: 'expert' })
  assert.deepEqual(cardsOf(m), ['5H'])
})

// 12) Seeded decisions are deterministic.
test('decisions are deterministic for a fixed seed', () => {
  const view = policyViewFromRound(mk({ 0: '3C 3D 6C 9H', 1: 'KC AC 5S 5D', 2: 'KD AD 7S 7D' }, { turnSeat: 0 }), 0)
  const a = chooseAiMove(view, { difficulty: 'expert', seed: 'fixed' }).move
  const b = chooseAiMove(view, { difficulty: 'expert', seed: 'fixed' }).move
  assert.deepEqual(cardsOf(a), cardsOf(b))
})

// 13) Near-equal decisions can vary across seeds (creativity), still legal.
test('different seeds can vary among near-equal leads (and stay legal)', () => {
  const view = policyViewFromRound(mk({ 0: '3C 4C 5C 9D TD JD', 1: 'KC AC 5S 5H 6S 6H', 2: 'KD AD 7S 7H 8S 8H' }, { turnSeat: 0 }), 0)
  const picks = new Set<string>()
  for (let i = 0; i < 12; i++) {
    const m = chooseAiMove(view, { difficulty: 'easy', seed: `s${i}` }).move
    if (m.type === 'play') { assert.ok(beats(parseCombo(m.cards)!, null, DEFAULT_RULES)); picks.add(cardsOf(m).join(',')) }
  }
  assert.ok(picks.size >= 2, 'shows variation across seeds')
})

// 14) Multi-card moves travel intact through generation→selection→validation→update.
test('multi-card move passes through the engine and removes exactly its cards', () => {
  const state = mk({ 0: '5C 5D 5H 8S', 1: 'KC AC QS', 2: 'KD AD QH' }, { turnSeat: 0 })
  const m = chooseBotMoveAI(state, 0, { difficulty: 'hard' })
  assert.equal(m.type, 'play')
  const before = state.hands[0].length
  const res = applyPlay(state, 0, m.cards!)
  assert.ok(res.ok)
  if (res.ok) assert.equal(res.state.hands[0].length, before - m.cards!.length)
})

// 15) Zero illegal moves over a randomized batch (AI drives every seat).
test('AI never makes an illegal move across randomized self-play', () => {
  for (let trial = 0; trial < 25; trial++) {
    const deck = shuffle(createDeck(), () => ((trial * 2654435761) % 2 ** 31) / 2 ** 31 || 0.5)
    let st = dealRound({ seats: [0, 1, 2, 3], roundNo: 2, rules: DEFAULT_RULES, deck, previousWinner: 0 })
    let guard = 0
    while (st.status === 'playing' && guard++ < 500) {
      const seat = st.turnSeat
      const m = chooseBotMoveAI(st, seat, { difficulty: 'hard', seed: `${trial}-${guard}` })
      if (m.type === 'pass') {
        const r = applyPass(st, seat)
        assert.ok(r.ok, 'pass legal')
        st = r.state
        continue
      }
      const combo = parseCombo(m.cards)
      const table = st.trick ? parseCombo(st.trick.cards) : null
      assert.ok(combo && beats(combo, table, DEFAULT_RULES), `legal play trial ${trial}`)
      const res = applyPlay(st, seat, m.cards)
      assert.ok(res.ok, `engine accepts AI move: ${(res as { error?: string }).error}`)
      st = res.state
    }
    assert.equal(st.status, 'ended')
  }
})

// 16) Decision-time budget. This is the HEAVIEST case: a full 13-card hand with a
// one-card opponent → critical danger → the endgame rollout search runs. Measured
// ~40–100ms here (JIT-dependent), which straddled the old 60ms cap and made the test
// flaky. The real production budget is the per-turn bot think delay (BOT_*_DELAY_MS,
// i.e. seconds), so the cap only needs to catch a pathological blow-up, not enforce a
// micro-target. 400ms is ~comfortably under the server budget yet still a real guard.
test('a single AI decision stays within the time budget', () => {
  const view = policyViewFromRound(mk({ 0: '3C 4C 5C 6D 7D 8H 9S TS JC QC KD AD 2H', 1: 'KC', 2: 'KD AD' }, { turnSeat: 0, playedCount: { 0: 0, 1: 12, 2: 11 } }), 0)
  const t0 = performance.now()
  chooseAiMove(view, { difficulty: 'expert', seed: 'perf' })
  assert.ok(performance.now() - t0 < 400, 'single worst-case decision under 400ms (server budget is seconds)')
})

// chanceOpponentBeats: a one-card opponent can NEVER beat a pair (the danger fix).
test('opponent model: a 1-card opponent cannot beat a pair', () => {
  const view: PolicyView = policyViewFromRound(mk({ 0: '6C 6D 9H', 1: 'KC', 2: 'KD AD' }, { turnSeat: 0, playedCount: { 0: 10, 1: 12, 2: 11 } }), 0)
  const pair = buildLegalMoves(view.myHand, null, DEFAULT_RULES).find(m => m.combinationType === 'pair')!
  // only the 1-card opponent matters here; restrict the view to it
  const onlyOne: PolicyView = { ...view, opponents: view.opponents.filter(o => o.cardsLeft === 1) }
  assert.equal(chanceOpponentBeats(onlyOne, pair), 0)
})
