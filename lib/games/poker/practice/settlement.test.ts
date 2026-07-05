// ── Poker PRACTICE settlement-result + human-turn regression tests (pure) ──────────────────
//
// Covers the 27F-A2 remediation:
//   • DEF-02 — the settled hand carries a PUBLIC-safe result (winner / pot / awards / legal reveal).
//   • DEF-03 — chip conservation is proven from the settled result itself (awards + refund == pot),
//     across fold-wins, showdowns, all-ins, side pots and consecutive hands, with no negative or
//     fractional stack and no double/missing award.
//   • DEF-04 — a freshly created HUMAN-turn hand stays BETTING on the human until the human acts;
//     the bot runner NEVER acts for the human.
//   • DEF-06 — an illegal Check is never in the viewer's authoritative legal-action set.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeRng } from '../../tlmn/ai/seededRandom.ts'
import {
  createPracticeGame,
  startPracticeHand,
  runBotsUntilHumanOrEnd,
  humanActionAuthoritative,
  applyActionAuthoritative,
  currentActor,
} from './runtime.ts'
import { toClientView } from './view.ts'
import { practiceSupply } from './economy.ts'
import { practiceConfig, humanSeat, botSeat, mixedTable, playPracticeHandToEnd } from './fixtures.ts'
import { deserializeHand } from '../hand.ts'

// The settled result must exactly account for every chip contested: the chips awarded to winners
// plus any uncalled-bet refund equals the total pot (POT-CONSERVE-001), and every award is a
// positive integer for a real seat.
function assertResultConserves(result: NonNullable<ReturnType<typeof toClientView>['result']>): void {
  const awarded = result.awards.reduce((s, a) => s + a.amount, 0)
  const refunded = result.refund ? result.refund.amount : 0
  assert.equal(awarded + refunded, result.potTotal, 'awards + refund must equal the pot')
  for (const a of result.awards) {
    assert.ok(Number.isInteger(a.amount) && a.amount > 0, 'each award is a positive integer')
  }
  // No seat is awarded twice.
  const seats = result.awards.map((a) => a.seatIndex)
  assert.equal(new Set(seats).size, seats.length, 'no seat awarded twice')
  assert.ok(result.winners.length >= 1, 'a settled hand has at least one winner')
}

test('DEF-02 — a fold-win records a PUBLIC-safe uncontested result (winner, pot, no reveal)', () => {
  const cfg = practiceConfig({ seats: [humanSeat(0, 'u', 10000), botSeat(1, 'normal', 10000)] })
  let game = startPracticeHand(createPracticeGame(cfg, 88))
  const actor = currentActor(game)!
  const seq = deserializeHand(game.hand!).actionSeq
  const res = applyActionAuthoritative(game, actor.seatIndex, { type: 'fold' }, seq)
  assert.equal(res.ok, true)
  game = (res as { game: typeof game }).game
  assert.equal(game.phase, 'COMPLETED')

  const view = toClientView(game, 0)
  assert.ok(view.result, 'COMPLETED view exposes a settled result')
  assert.equal(view.result!.wentToShowdown, false)
  assert.deepEqual(view.result!.reveal, []) // an uncontested winner never shows cards
  assertResultConserves(view.result!)
})

test('DEF-02 — a hand that reaches showdown reveals ONLY legal contenders with a hand label', () => {
  let sawShowdown = false
  for (let seed = 1; seed <= 200 && !sawShowdown; seed++) {
    const g0 = startPracticeHand(createPracticeGame(mixedTable(2, 'normal', 10000), seed))
    const done = playPracticeHandToEnd(g0, makeRng(seed)).game
    if (done.phase !== 'COMPLETED' || !done.lastResult?.wentToShowdown) continue
    sawShowdown = true
    const view = toClientView(done, 0)
    const r = view.result!
    assert.ok(r.board.length >= 3, 'a showdown reveals the community board')
    assert.ok(r.reveal.length >= 1, 'at least one contender shows')
    for (const rev of r.reveal) {
      assert.equal(rev.cards.length, 2)
      assert.ok(typeof rev.handLabel === 'string' && rev.handLabel.length > 0, 'reveal carries a hand label')
    }
    assertResultConserves(r)
  }
  assert.ok(sawShowdown, 'expected at least one showdown across 200 heads-up seeds')
})

test('DEF-03 — every completed hand conserves chips from its own result; all-ins & side pots included', () => {
  let sawAllIn = false
  let sawShowdown = false
  let sawUncontested = false
  for (let seed = 1; seed <= 150; seed++) {
    // short stacks + uneven blinds force all-ins and layered side pots
    const g0 = startPracticeHand(createPracticeGame(mixedTable(4, 'normal', 400, 100), seed))
    const supply0 = practiceSupply(g0.chips) + (g0.hand ? g0.hand.players.reduce((s, p) => s + p.committedTotal, 0) : 0)
    const done = playPracticeHandToEnd(g0, makeRng(seed)).game
    assert.equal(done.phase, 'COMPLETED', `seed ${seed} did not complete`)

    // Whole-supply conservation (behind-stacks return to exactly the starting supply)...
    assert.equal(practiceSupply(done.chips), supply0, `seed ${seed} supply drifted`)
    for (const [, v] of Object.entries(done.chips)) {
      assert.ok(Number.isInteger(v) && v >= 0, `seed ${seed} produced a bad stack ${v}`)
    }
    // ...and the settled RESULT independently accounts for the pot.
    const r = done.lastResult!
    assertResultConserves(r)

    if (r.wentToShowdown) sawShowdown = true
    else sawUncontested = true
    if (done.hand!.players.some((p) => p.status === 'allin')) sawAllIn = true
  }
  assert.ok(sawShowdown, 'expected showdowns')
  assert.ok(sawUncontested, 'expected fold-wins')
  assert.ok(sawAllIn, 'expected all-ins under short stacks')
})

test('DEF-03 — a split pot (odd chip) is fully allocated with no chip created or destroyed', () => {
  let sawSplit = false
  for (let seed = 1; seed <= 800 && !sawSplit; seed++) {
    const g0 = startPracticeHand(createPracticeGame(mixedTable(2, 'normal', 10000), seed))
    const done = playPracticeHandToEnd(g0, makeRng(seed)).game
    const r = done.lastResult
    if (!r || r.winners.length < 2) continue
    sawSplit = true
    assertResultConserves(r) // awards (incl. any odd-chip seat) + refund == pot, all integer
  }
  // Splits are rare; only assert conservation IF one occurred (documented, not a hard requirement).
  if (!sawSplit) console.log('[settlement.test] no split pot in 800 heads-up seeds (expected-rare)')
})

test('DEF-03 — consecutive hands never change the isolated supply and each result conserves', () => {
  let game = createPracticeGame(mixedTable(3, 'normal', 5000, 100), 2024)
  const supply0 = practiceSupply(game.chips)
  for (let h = 0; h < 40; h++) {
    if (game.config.seats.filter((s) => (game.chips[s.seatIndex] ?? 0) > 0).length < 2) break
    game = startPracticeHand(game)
    game = playPracticeHandToEnd(game, makeRng(2024 + h)).game
    assert.equal(practiceSupply(game.chips), supply0, `supply drifted after hand ${h}`)
    assertResultConserves(game.lastResult!)
  }
})

test('DEF-04 — a fresh HUMAN-turn hand waits on the human; the bot runner never acts for it', () => {
  // Find a start state (across seeds) where, after the bots have run, it is the HUMAN's turn.
  let found = false
  for (let seed = 1; seed <= 60 && !found; seed++) {
    let game = startPracticeHand(createPracticeGame(mixedTable(3, 'normal', 10000), seed))
    game = runBotsUntilHumanOrEnd(game, makeRng(seed)).game
    const actor = currentActor(game)
    if (game.phase !== 'BETTING' || !actor || actor.isBot) continue
    found = true

    // The bot runner must be a NO-OP here — it must not act for the human.
    const again = runBotsUntilHumanOrEnd(game, makeRng(seed + 1))
    assert.equal(again.botActions, 0, 'bots must not act on a human turn')
    assert.equal(again.game.phase, 'BETTING', 'the hand stays live')
    assert.equal(again.game.version, game.version, 'no state advanced')
    assert.equal(deserializeHand(again.game.hand!).turnSeat, actor.seatIndex, 'still the human to act')

    // And running it many more times still never advances (idempotent wait).
    let g = game
    for (let i = 0; i < 5; i++) g = runBotsUntilHumanOrEnd(g, makeRng(seed + 10 + i)).game
    assert.equal(g.version, game.version, 'repeated bot passes never act for the human')

    // Only an explicit HUMAN action advances the hand.
    const seq = deserializeHand(game.hand!).actionSeq
    const acted = humanActionAuthoritative(game, actor.seatIndex, { type: 'fold' }, seq)
    assert.equal(acted.ok, true, 'the human action is what advances the hand')
  }
  assert.ok(found, 'expected at least one human-turn start state across seeds')
})

test('DEF-06 — the viewer legal model is present only on the human turn, and Check is absent when illegal', () => {
  let game = startPracticeHand(createPracticeGame(mixedTable(2, 'normal', 10000), 42))
  game = runBotsUntilHumanOrEnd(game, makeRng(99)).game
  const actor = currentActor(game)
  assert.ok(actor && !actor.isBot, 'setup: human to act')

  const view = toClientView(game, 0)
  assert.ok(view.legal, 'the viewer receives an authoritative legal model on their turn')
  assert.equal(view.legal!.seatIndex, 0)

  // Preflop, heads-up, the SB/button (human) faces the big blind → Check is ILLEGAL and must be
  // absent, while Call/Fold/Raise/All-in are offered. The client renders strictly from this set.
  if (view.legal!.callAmount > 0) {
    assert.ok(!view.legal!.allowed.includes('check'), 'Check must not be offered when facing a bet')
    assert.ok(view.legal!.allowed.includes('call'))
    assert.ok(view.legal!.allowed.includes('fold'))
  }

  // A non-viewer projection (spectator) never carries a legal model.
  const spectator = toClientView(game, null)
  assert.equal(spectator.legal, null)
})

test('DEF-02/07 — the COMPLETED view shows POST-payout stacks (winnings included, supply intact)', () => {
  // A fold-win: seat 0 (human) folds heads-up → the bot wins the pot. The COMPLETED view must show
  // the bot's stack INCLUDING its award, so the displayed stacks still sum to the starting supply.
  const cfg = practiceConfig({ seats: [humanSeat(0, 'u', 10000), botSeat(1, 'normal', 10000)] })
  let game = startPracticeHand(createPracticeGame(cfg, 88))
  const actor = currentActor(game)!
  const seq = deserializeHand(game.hand!).actionSeq
  const res = applyActionAuthoritative(game, actor.seatIndex, { type: 'fold' }, seq)
  assert.equal(res.ok, true)
  game = (res as { game: typeof game }).game
  assert.equal(game.phase, 'COMPLETED')

  const view = toClientView(game, 0)
  const shown = view.seats.reduce((s, seat) => s + seat.stack, 0)
  assert.equal(shown, 20000, 'displayed final stacks include the winnings and sum to the supply')
  // And each displayed stack matches the authoritative post-payout chips.
  for (const seat of view.seats) assert.equal(seat.stack, game.chips[seat.seatIndex])
})

test('a showdown COMPLETED view also shows post-payout stacks summing to the supply', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const g0 = startPracticeHand(createPracticeGame(mixedTable(2, 'normal', 10000), seed))
    const done = playPracticeHandToEnd(g0, makeRng(seed)).game
    if (done.phase !== 'COMPLETED' || !done.lastResult?.wentToShowdown) continue
    const view = toClientView(done, 0)
    const shown = view.seats.reduce((s, seat) => s + seat.stack, 0)
    assert.equal(shown, 20000, `seed ${seed}: displayed stacks must include winnings`)
    return
  }
  assert.fail('no showdown found to verify post-payout display')
})

test('the client view surfaces the public pot and matches the committed total', () => {
  let game = startPracticeHand(createPracticeGame(mixedTable(3, 'normal', 10000), 7))
  game = runBotsUntilHumanOrEnd(game, makeRng(7)).game
  const view = toClientView(game, 0)
  const committed = game.hand!.players.reduce((s, p) => s + p.committedTotal, 0)
  assert.equal(view.pot, committed, 'view.pot mirrors the total committed this hand')
  assert.equal(view.bigBlind, 100)
  assert.equal(view.smallBlind, 50)
})
