// ─────────────────────────────────────────────────────────────────────────────
// TLMN QA ACCEPTANCE SUITE  (added by automated QA pass)
//
// Requirement-traceable, fully OFFLINE and DETERMINISTIC verification of the
// server-authoritative Tiến Lên Miền Nam logic. NO network / Supabase / browser /
// production writes — it exercises the SAME modules the server actions wrap:
//   • round.ts   → applyPlay / applyPass / applyTimeout / dealRound / cardCounts
//   • engine.ts  → parseCombo / beats / explainBeat / legalMoves / settleRound
//   • sim/*      → runGame (the project's own deterministic match driver)
//
// `app/games/tlmn/actions.ts::playCards` does exactly:
//     game.turn_seat !== mySeat → 'not_your_turn'
//     applyPlay(roundFromDb(game,hands), mySeat, cards) → persist diff
// so asserting applyPlay/applyPass here asserts the real validation chain.
//
// Run:  node --test lib/games/tlmn/qa-acceptance.test.ts
// Each test name is prefixed with the spec requirement it covers ([R#]).
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseHand, parseCombo, beats, legalMoves, isRoundOneOpening,
  createDeck, shuffle, strength, R3, R2, SUIT_SPADE,
  DEFAULT_RULES, type Card, type Combo,
} from './engine.ts'
import {
  dealRound, applyPlay, applyPass, cardCounts, type RoundState,
} from './round.ts'
import { makeRng } from './ai/seededRandom.ts'
import { runGame } from './sim/simulator.ts'
import { makePolicy } from './sim/policies.ts'

// ── helpers ────────────────────────────────────────────────────────────────────
function mkState(p: Partial<RoundState>): RoundState {
  return {
    seats: [0, 1], roundNo: 2, rules: DEFAULT_RULES,
    hands: { 0: [], 1: [] }, turnSeat: 0, trick: null, passed: [],
    playedCount: { 0: 0, 1: 0 }, cutEvents: [], mustIncludeThreeSpade: false,
    status: 'playing', winner: null, instantWin: null, deltas: null, ...p,
  }
}
const has3Spade = (cards: Card[]) => cards.some(c => c.rank === R3 && c.suit === SUIT_SPADE)
const sum = (r: Record<number, number>) => Object.values(r).reduce((a, b) => a + b, 0)

// A deterministic, guaranteed-terminating auto-player used to drive full matches
// through the REAL reducers. Leader plays its largest legal combo (variety); a
// follower plays the smallest legal beating move ~60% of the time (seeded) else
// passes. The leader always plays ⇒ total cards strictly decrease ⇒ termination.
function autoMove(state: RoundState, seat: number, rng: () => number): { type: 'play'; cards: Card[] } | { type: 'pass' } {
  const table = state.trick ? parseCombo(state.trick.cards) : null
  let moves = legalMoves(state.hands[seat], table, state.rules)
  if (state.mustIncludeThreeSpade && !table) moves = moves.filter(m => has3Spade(m.cards))
  if (moves.length === 0) return { type: 'pass' }
  if (table) {
    if (rng() < 0.4) return { type: 'pass' }
    const m = moves.slice().sort((a, b) => strength(a.high) - strength(b.high) || a.count - b.count)[0]
    return { type: 'play', cards: m.cards }
  }
  const m = moves.slice().sort((a, b) => b.count - a.count || strength(a.high) - strength(b.high))[0]
  return { type: 'play', cards: m.cards }
}

function playFullMatch(seed: string, playerCount = 4): RoundState {
  const rng = makeRng(seed)
  const seats = Array.from({ length: playerCount }, (_, i) => i)
  let state = dealRound({ seats, roundNo: 2, rules: DEFAULT_RULES, deck: shuffle(createDeck(), rng), previousWinner: 0 })
  let guard = 0
  while (state.status === 'playing' && guard++ < 2000) {
    const mv = autoMove(state, state.turnSeat, rng)
    const res = mv.type === 'play' ? applyPlay(state, state.turnSeat, mv.cards) : applyPass(state, state.turnSeat)
    assert.ok(res.ok, `driver produced a legal action (turn ${guard}); got ${res.ok ? '' : (res as { error: string }).error}`)
    if (res.ok) state = res.state
  }
  return state
}

// ═══════════════════════════════════════════════════════════════════════════════
// MULTIPLAYER FLOW (round lifecycle through the authoritative reducers)
// ═══════════════════════════════════════════════════════════════════════════════

// [R10] First player & opening-card rule: round 1 lead must hold & play 3♠.
test('[R10] round-1 deal selects the 3♠ holder as leader and forces a 3♠ opening', () => {
  // Deterministically find a seed whose round-1 leader holds 3♠ (true for any deal
  // where 3♠ is dealt — always, with 4 full seats).
  const state = dealRound({ seats: [0, 1, 2, 3], roundNo: 1, rules: DEFAULT_RULES, deck: shuffle(createDeck(), makeRng('r1')) })
  assert.equal(state.mustIncludeThreeSpade, true)
  assert.ok(has3Spade(state.hands[state.turnSeat]), 'the chosen leader holds the 3♠')

  const leader = state.turnSeat
  // An opening that omits 3♠ is rejected…
  const nonThreeSpade = state.hands[leader].find(c => !(c.rank === R3 && c.suit === SUIT_SPADE))!
  const bad = applyPlay(state, leader, [nonThreeSpade])
  assert.equal(bad.ok, false)
  assert.equal((bad as { error: string }).error, 'must_include_three_spade')
  // …and the 3♠ single is accepted.
  const ok = applyPlay(state, leader, parseHand('3S'))
  assert.equal(ok.ok, true)
  assert.ok(isRoundOneOpening(parseCombo(parseHand('3S'))!))
})

// [R11] A legal lead is accepted and the turn advances to the next seat.
test('[R11] legal lead accepted; turn advances to the next seat', () => {
  const s = mkState({ seats: [0, 1], turnSeat: 0, hands: { 0: parseHand('5S 6S 7S'), 1: parseHand('9H 10H JH') } })
  const res = applyPlay(s, 0, parseHand('5S'))
  assert.equal(res.ok, true)
  if (res.ok) {
    assert.equal(res.state.turnSeat, 1, 'turn passes to seat 1')
    assert.equal(res.state.trick?.bySeat, 0)
  }
})

// [R13] The opponent can respond with a stronger same-type combo; a weaker one is rejected.
test('[R13] stronger response beats the table; weaker same-type is rejected', () => {
  const s = mkState({
    seats: [0, 1], turnSeat: 0,
    trick: { cards: parseHand('KS KC'), bySeat: 1 }, // table = pair of Kings
    hands: { 0: parseHand('4S 4C 2S 2C'), 1: [] },
  })
  // weaker pair (4s) cannot beat pair of Kings
  const weak = applyPlay(s, 0, parseHand('4S 4C'))
  assert.equal(weak.ok, false, 'a weaker pair cannot beat a stronger pair')
  // a pair of 2s (heo) does beat the pair of Kings
  const strong = applyPlay(s, 0, parseHand('2S 2C'))
  assert.equal(strong.ok, true)
})

// [R15] Passing works while following; the leader cannot pass.
test('[R15] follower may pass; leader cannot pass', () => {
  const following = mkState({ seats: [0, 1], turnSeat: 0, trick: { cards: parseHand('9H'), bySeat: 1 }, hands: { 0: parseHand('4S'), 1: parseHand('5S') } })
  assert.equal(applyPass(following, 0).ok, true)

  const leading = mkState({ seats: [0, 1], turnSeat: 0, trick: null, hands: { 0: parseHand('4S'), 1: parseHand('5S') } })
  const r = applyPass(leading, 0)
  assert.equal(r.ok, false)
  assert.equal((r as { error: string }).error, 'cannot_pass_leading')
})

// [R16][R17] Table resets after everyone else passes; leadership returns to the trick owner.
test('[R16][R17] all-others-pass clears the table and returns the lead to the trick owner', () => {
  // seat 0 owns the table (played 9♥); seats 1 then 2 pass.
  let s = mkState({
    seats: [0, 1, 2], turnSeat: 1, trick: { cards: parseHand('9H'), bySeat: 0 },
    hands: { 0: parseHand('AH'), 1: parseHand('4S'), 2: parseHand('5S') },
    playedCount: { 0: 1, 1: 0, 2: 0 },
  })
  let r = applyPass(s, 1); assert.ok(r.ok); if (r.ok) s = r.state
  assert.equal(s.turnSeat, 2, 'turn moves to the next non-passed seat')
  r = applyPass(s, 2); assert.ok(r.ok); if (r.ok) s = r.state
  assert.equal(s.trick, null, 'table cleared after all others passed')
  assert.equal(s.passed.length, 0, 'pass flags reset')
  assert.equal(s.turnSeat, 0, 'lead returns to the trick owner')
})

// [R18][R19][R21] Playing the final card ends the round; winner detected; settlement is zero-sum.
test('[R18][R19][R21] last card ends the round, sets the winner, settles zero-sum', () => {
  const s = mkState({
    seats: [0, 1], turnSeat: 0, trick: null,
    hands: { 0: parseHand('5S'), 1: parseHand('4S 4C 6H') },
    playedCount: { 0: 12, 1: 10 },
  })
  const res = applyPlay(s, 0, parseHand('5S'))
  assert.ok(res.ok)
  if (res.ok) {
    assert.equal(res.state.status, 'ended')
    assert.equal(res.state.winner, 0, 'first player out is the winner')
    assert.ok(res.state.deltas, 'settlement computed')
    assert.equal(sum(res.state.deltas!), 0, 'round settlement is zero-sum')
    assert.ok(res.state.deltas![0] > 0, 'winner nets positive')
    assert.ok(res.state.deltas![1] < 0, 'loser nets negative')
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// SERVER-SIDE RULE ENFORCEMENT (negative paths the happy-path sim never triggers)
// ═══════════════════════════════════════════════════════════════════════════════

// [R-turn] A player cannot act outside their turn.
test('[R-turn] acting out of turn is rejected (not_your_turn)', () => {
  const s = mkState({ seats: [0, 1], turnSeat: 0, hands: { 0: parseHand('5S'), 1: parseHand('6S') } })
  const r = applyPlay(s, 1, parseHand('6S'))
  assert.equal(r.ok, false)
  assert.equal((r as { error: string }).error, 'not_your_turn')
})

// [R-owns] A player cannot play cards they do not hold.
test('[R-owns] playing un-held cards is rejected (cards_not_held)', () => {
  const s = mkState({ seats: [0, 1], turnSeat: 0, hands: { 0: parseHand('5S'), 1: parseHand('6S') } })
  const r = applyPlay(s, 0, parseHand('AH')) // not in hand
  assert.equal(r.ok, false)
  assert.equal((r as { error: string }).error, 'cards_not_held')
})

// [R-combo] An invalid combination cannot be played.
test('[R-combo] an invalid combination is rejected (invalid_combo)', () => {
  const s = mkState({ seats: [0, 1], turnSeat: 0, hands: { 0: parseHand('3S 5H'), 1: parseHand('6S') } })
  const r = applyPlay(s, 0, parseHand('3S 5H')) // not a pair / not a run
  assert.equal(r.ok, false)
  assert.equal((r as { error: string }).error, 'invalid_combo')
})

// [R-type] A different combination type cannot beat the table when prohibited (non-bomb).
test('[R-type] a pair cannot beat a single (different type, not a bomb)', () => {
  const s = mkState({
    seats: [0, 1], turnSeat: 0, trick: { cards: parseHand('7H'), bySeat: 1 },
    hands: { 0: parseHand('8S 8C 9H'), 1: [] },
  })
  assert.equal(applyPlay(s, 0, parseHand('8S 8C')).ok, false, 'pair over a single is illegal')
  assert.equal(applyPlay(s, 0, parseHand('9H')).ok, true, 'a higher single is the legal follow')
})

// [R-bomb] Bomb / chặt: a tứ quý cuts a single 2 and records a chặt (đền 'heo') event.
test('[R-bomb] tứ quý cuts a single 2 and logs a chặt event', () => {
  const s = mkState({
    seats: [0, 1], turnSeat: 0, trick: { cards: parseHand('2H'), bySeat: 1 },
    hands: { 0: parseHand('5S 5C 5D 5H 3C'), 1: parseHand('7H 8H') },
    playedCount: { 0: 8, 1: 6 },
  })
  const r = applyPlay(s, 0, parseHand('5S 5C 5D 5H'))
  assert.equal(r.ok, true, 'four-of-a-kind beats a single 2')
  if (r.ok) {
    assert.equal(r.state.cutEvents.length, 1)
    assert.equal(r.state.cutEvents[0].kind, 'heo', 'cutting a 2 is a heo cut')
    assert.equal(r.state.cutEvents[0].cutter, 0)
  }
})

// [R-double] The same action cannot be submitted twice (turn already advanced).
test('[R-double] a replayed identical play is rejected after the turn advances', () => {
  const s = mkState({ seats: [0, 1], turnSeat: 0, hands: { 0: parseHand('5S 6S'), 1: parseHand('9H 10H') } })
  const first = applyPlay(s, 0, parseHand('5S'))
  assert.ok(first.ok)
  if (first.ok) {
    // Server re-derives state from the DB; the persisted turn has moved to seat 1.
    const replay = applyPlay(first.state, 0, parseHand('5S'))
    assert.equal(replay.ok, false, 'the duplicate submission is rejected')
    assert.equal((replay as { error: string }).error, 'not_your_turn')
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// CARD PRIVACY (no opponent cards in the public projection / broadcast shape)
// ═══════════════════════════════════════════════════════════════════════════════

// [R9] The public projection exposes ONLY card counts — never opponents' cards.
test('[R9] cardCounts exposes counts only; no card objects leak in the public shape', () => {
  const s = mkState({
    seats: [0, 1, 2, 3], turnSeat: 0,
    hands: { 0: parseHand('3S 4S 5S'), 1: parseHand('6H 7H 8H 9H'), 2: parseHand('KS KC'), 3: parseHand('2S') },
  })
  const counts = cardCounts(s)
  assert.deepEqual(counts, { 0: 3, 1: 4, 2: 2, 3: 1 })
  for (const v of Object.values(counts)) assert.equal(typeof v, 'number')
  // The serialized public projection must not contain rank/suit data of any seat.
  const serialized = JSON.stringify(counts)
  assert.equal(/"rank"|"suit"/.test(serialized), false, 'no card fields in the public projection')
})

// ═══════════════════════════════════════════════════════════════════════════════
// FULL DETERMINISTIC MATCHES (lifecycle + determinism + no-freeze) — reuses runGame
// ═══════════════════════════════════════════════════════════════════════════════

// [R18][R-driver] A full 4-player match driven through the REAL reducers terminates,
// detects a winner with an empty hand, and settles zero-sum.
test('[R18] driven 4-player match terminates, winner empties hand, settlement zero-sum', () => {
  const end = playFullMatch('qa-4p-001', 4)
  assert.equal(end.status, 'ended')
  assert.ok(end.winner !== null)
  assert.equal(end.hands[end.winner!].length, 0, 'winner has no cards left')
  assert.ok(end.deltas, 'deltas computed')
  assert.equal(sum(end.deltas!), 0, 'zero-sum settlement')
  assert.ok(end.deltas![end.winner!] > 0, 'winner nets positive')
})

// [R-2mode] A 2-player match also completes cleanly (the "two mode" path).
test('[R-2mode] driven 2-player match terminates with a winner', () => {
  const end = playFullMatch('qa-2p-001', 2)
  assert.equal(end.status, 'ended')
  assert.ok(end.winner !== null)
  assert.equal(end.hands[end.winner!].length, 0)
  assert.equal(sum(end.deltas!), 0)
})

// [R-determinism] The same seed reproduces the identical match (stable, unattended-safe).
test('[R-determinism] identical seed → identical match outcome', () => {
  const a = playFullMatch('qa-det', 4)
  const b = playFullMatch('qa-det', 4)
  assert.equal(a.winner, b.winner)
  assert.deepEqual(a.deltas, b.deltas)
  assert.deepEqual(cardCounts(a), cardCounts(b))
})

// ═══════════════════════════════════════════════════════════════════════════════
// BOT MODE (reuses the project's own AI policies via runGame)
// ═══════════════════════════════════════════════════════════════════════════════

// [R-bot] Every AI difficulty completes full matches with ZERO illegal moves and no freeze.
test('[R-bot] aiNormal/aiHard/aiExpert finish full matches, no illegal moves, no infinite loop', () => {
  for (const name of ['aiNormal', 'aiHard', 'aiExpert'] as const) {
    for (const seed of ['bot-1', 'bot-2', 'bot-3']) {
      const res = runGame({
        seed: `${name}-${seed}`,
        policies: [makePolicy(name), makePolicy('defensive'), makePolicy('lowestLegal'), makePolicy('greedyCardReduction')],
        maxTurns: 600,
      })
      assert.equal(res.illegalMoveCount, 0, `${name}/${seed}: no illegal bot moves`)
      assert.ok(res.winnerSeat !== null, `${name}/${seed}: match produced a winner`)
      assert.equal(res.finishOrder.length, 4)
      assert.ok(res.turns < 600, `${name}/${seed}: terminated before the safety cap (no freeze)`)
      assert.equal(res.finalCardCounts[res.winnerSeat!], 0, 'winner finished with 0 cards')
    }
  }
})

// [R-bot-2p] Bots also complete a 2-player match (bot-vs-bot two-mode).
test('[R-bot-2p] two-player bot match completes legally', () => {
  const res = runGame({ seed: 'bot-2p', policies: [makePolicy('aiHard'), makePolicy('aiExpert')], playerCount: 2, maxTurns: 400 })
  assert.equal(res.illegalMoveCount, 0)
  assert.ok(res.winnerSeat !== null)
  assert.ok(res.turns < 400)
})
