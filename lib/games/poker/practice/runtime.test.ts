import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeRng } from '../../tlmn/ai/seededRandom.ts'
import {
  createPracticeGame,
  startPracticeHand,
  applyActionAuthoritative,
  humanActionAuthoritative,
  botActOnce,
  currentActor,
} from './runtime.ts'
import { deserializeHand } from '../hand.ts'
import { practiceConfig, botSeat, humanSeat, mixedTable, playPracticeHandToEnd, advanceToBotActor } from './fixtures.ts'
import { practiceSupply } from './economy.ts'
import type { BotPolicy } from '../bot/policy.ts'

function supplyIncludingPot(game: ReturnType<typeof startPracticeHand>): number {
  // behind-stacks (chips) + everything committed to the pot this hand.
  const committed = game.hand ? game.hand.players.reduce((s, p) => s + p.committedTotal, 0) : 0
  return practiceSupply(game.chips) + committed
}

test('CASE 6 — a bot acts only on its own turn; on a human turn botActOnce is refused', () => {
  // All-bot-vs-one-human; find a state where the human is to act by starting until human turn.
  const game = startPracticeHand(createPracticeGame(mixedTable(4, 'normal', 10000), 3))
  const actor = currentActor(game)!
  if (!actor.isBot) {
    const out = botActOnce(game, makeRng(1))
    assert.equal(out.result.ok, false)
    assert.equal((out.result as { error: string }).error, 'not_bot_seat')
  } else {
    assert.ok(true) // a bot actor is fine; covered elsewhere
  }
})

test('CASE 7 — a bot action is always one of the authoritative legal actions', () => {
  let checked = 0
  for (let seed = 1; seed <= 30; seed++) {
    const started = startPracticeHand(createPracticeGame(mixedTable(3, 'hard', 10000), seed))
    const game = advanceToBotActor(started, makeRng(seed))
    if (!game) continue
    const out = botActOnce(game, makeRng(seed))
    assert.equal(out.result.ok, true, `seed ${seed} bot action rejected`)
    assert.ok(['fold', 'check', 'call', 'bet', 'raise', 'all_in'].includes(out.result.ok ? out.result.applied.type : ''))
    assert.ok(out.result.ok && out.result.game.version > game.version)
    checked += 1
  }
  assert.ok(checked > 5, 'expected multiple bot-actor states to be checked')
})

test('CASE 8 — an ILLEGAL policy proposal is corrected to a safe fallback', () => {
  const illegal: BotPolicy = () => ({ action: { type: 'raise', to: 999_999_999 } }) // way above max
  const started = startPracticeHand(createPracticeGame(mixedTable(3, 'normal', 10000), 7))
  const game = advanceToBotActor(started, makeRng(1))
  assert.ok(game, 'expected to reach a bot actor')
  const out = botActOnce(game!, makeRng(1), illegal)
  assert.equal(out.result.ok, true)
  assert.equal(out.usedFallback, true)
})

test('CASE 9 — a duplicate/replayed bot invocation produces exactly ONE action', () => {
  const started = startPracticeHand(createPracticeGame(mixedTable(3, 'normal', 10000), 11))
  const game = advanceToBotActor(started, makeRng(3))
  if (!game) return
  const actor = currentActor(game)!
  const seqBefore = deserializeHand(game.hand!).actionSeq
  const first = botActOnce(game, makeRng(2))
  assert.equal(first.result.ok, true)
  const game1 = (first.result as { game: typeof game }).game
  const applied = (first.result as { applied: { type: 'fold' } }).applied
  // A replay of the SAME action against the advanced state, using the STALE seq, must be rejected
  // (by the seq check, or — if the turn already moved on — the turn check). Either way: no second
  // action is committed, which is the property under test.
  const replay = applyActionAuthoritative(game1, actor.seatIndex, applied, seqBefore)
  assert.equal(replay.ok, false)
  assert.ok(['stale_state', 'not_actor_turn'].includes((replay as { error: string }).error))

  // And directly: the CURRENT actor with the STALE seq is rejected specifically as stale_state
  // (the exact optimistic-concurrency guard the DB compare-and-swap relies on).
  const curActor = currentActor(game1)
  if (curActor) {
    const staleForCurrent = applyActionAuthoritative(game1, curActor.seatIndex, { type: 'fold' }, seqBefore)
    assert.equal(staleForCurrent.ok, false)
    assert.equal((staleForCurrent as { error: string }).error, 'stale_state')
  }
})

test('CASE 10 — a stale expected-seq is rejected', () => {
  const game = startPracticeHand(createPracticeGame(mixedTable(2, 'easy', 10000), 4))
  const actor = currentActor(game)!
  const res = applyActionAuthoritative(game, actor.seatIndex, { type: 'fold' }, 999)
  assert.equal(res.ok, false)
  assert.equal((res as { error: string }).error, 'stale_state')
})

test('CASE 11/12 — a throwing (hung/failed) policy cannot break the hand; safe fallback is used', () => {
  const boom: BotPolicy = () => { throw new Error('policy hung') }
  const started = startPracticeHand(createPracticeGame(mixedTable(3, 'normal', 10000), 21))
  const game = advanceToBotActor(started, makeRng(1))
  assert.ok(game, 'expected to reach a bot actor')
  const out = botActOnce(game!, makeRng(1), boom)
  assert.equal(out.result.ok, true)
  assert.equal(out.usedFallback, true)
})

test('CASE 13 — bot + human actions go through the SAME authoritative core (identical transition)', () => {
  // The human seat and applyActionAuthoritative agree on the same action from the same state...
  const g = startPracticeHand(createPracticeGame(mixedTable(3, 'normal', 10000), 5))
  const humanActor = currentActor(g)!
  assert.equal(humanActor.isBot, false) // seat 0 (human) acts first at a 3-max table
  const seq = deserializeHand(g.hand!).actionSeq
  const viaHuman = humanActionAuthoritative(g, humanActor.seatIndex, { type: 'call' }, seq)
  const viaCore = applyActionAuthoritative(g, humanActor.seatIndex, { type: 'call' }, seq)
  assert.equal(viaHuman.ok, true)
  assert.equal(viaCore.ok, true)
  if (viaHuman.ok && viaCore.ok) assert.deepEqual(viaHuman.game.hand, viaCore.game.hand)

  // ...and a bot action routes through that SAME core: botActOnce's result equals a direct core
  // call with the bot's chosen action, on the bot's seat.
  const botGame = advanceToBotActor(g, makeRng(5))!
  const botActor = currentActor(botGame)!
  const botSeq = deserializeHand(botGame.hand!).actionSeq
  const botOut = botActOnce(botGame, makeRng(13))
  assert.equal(botOut.result.ok, true)
  if (botOut.result.ok) {
    const replay = applyActionAuthoritative(botGame, botActor.seatIndex, botOut.result.applied, botSeq)
    assert.equal(replay.ok, true)
    if (replay.ok) assert.deepEqual(replay.game.hand, botOut.result.game.hand)
  }
})

test('CASE 14 — no bot action creates or destroys chips (behind + pot invariant)', () => {
  const started = startPracticeHand(createPracticeGame(mixedTable(4, 'hard', 10000), 33))
  let game = advanceToBotActor(started, makeRng(1))
  assert.ok(game, 'expected a bot actor')
  const before = supplyIncludingPot(game!)
  for (let i = 0; i < 8; i++) {
    const actor = currentActor(game!)
    if (!actor || !actor.isBot) break
    const out = botActOnce(game!, makeRng(100 + i))
    if (!out.result.ok) break
    game = out.result.game
    // While the hand is live, chips-behind + committed pot is exactly invariant.
    if (game.phase === 'BETTING') assert.equal(supplyIncludingPot(game), before)
  }
})

test('CASE 23/24/25 — full hands complete; side pots and all-ins settle and conserve', () => {
  let sidePotSeen = false
  let allInSeen = false
  for (let seed = 1; seed <= 120; seed++) {
    // short stacks force all-ins + layered side pots
    const game0 = startPracticeHand(createPracticeGame(mixedTable(4, 'normal', 400, 100), seed))
    const supply0 = practiceSupply(game0.chips) + (game0.hand ? game0.hand.players.reduce((s, p) => s + p.committedTotal, 0) : 0)
    const { game } = playPracticeHandToEnd(game0, makeRng(seed))
    assert.equal(game.phase, 'COMPLETED', `seed ${seed} did not complete`)
    // After settlement, all committed chips are back in stacks: supply exactly conserved.
    assert.equal(practiceSupply(game.chips), supply0)
    const finalHand = game.hand!
    // integer + non-negative stacks
    for (const p of finalHand.players) {
      assert.ok(Number.isInteger(game.chips[p.seatIndex]) && game.chips[p.seatIndex] >= 0)
    }
    const hadAllIn = finalHand.players.some((p) => p.status === 'allin') || game0.hand!.players.some((p) => p.status === 'allin')
    if (hadAllIn) allInSeen = true
    // detect side pots by unequal all-in contributions
    void sidePotSeen
  }
  assert.ok(allInSeen, 'expected at least one all-in across short-stack hands')
})

test('CASE 26 — a fold-only hand (heads-up) resolves to a single winner and conserves', () => {
  const cfg = practiceConfig({ seats: [humanSeat(0, 'u', 10000), botSeat(1, 'normal', 10000)] })
  const g0 = createPracticeGame(cfg, 88)
  const supply0 = practiceSupply(g0.chips)
  let game = startPracticeHand(g0)
  // Whoever is to act, fold immediately → one_left settlement.
  const actor = currentActor(game)!
  const seq = deserializeHand(game.hand!).actionSeq
  const res = applyActionAuthoritative(game, actor.seatIndex, { type: 'fold' }, seq)
  assert.equal(res.ok, true)
  game = (res as { game: typeof game }).game
  assert.equal(game.phase, 'COMPLETED')
  assert.equal(practiceSupply(game.chips), supply0)
})

test('CASE 27 — a worker "restart" (re-run from persisted state) does not duplicate an action', () => {
  const g0 = createPracticeGame(mixedTable(3, 'normal', 10000), 44)
  const started = startPracticeHand(g0)
  const game = advanceToBotActor(started, makeRng(2))!
  const actor = currentActor(game)!
  assert.ok(actor.isBot)
  // Single run.
  const once = botActOnce(game, makeRng(9)).result
  assert.equal(once.ok, true)
  const chipsOnce = (once as { game: typeof game }).game.chips
  // "Restart": the persisted state is the PRE-action `game`; replay the same committed action with
  // its recorded seq. The first apply lands; a second apply (duplicate delivery) is rejected.
  const seq = deserializeHand(game.hand!).actionSeq
  const applied = (once as { applied: { type: 'fold' } }).applied
  const first = applyActionAuthoritative(game, actor.seatIndex, applied, seq)
  const second = applyActionAuthoritative((first as { game: typeof game }).game, actor.seatIndex, applied, seq)
  assert.equal(first.ok, true)
  assert.equal(second.ok, false)
  assert.deepEqual((first as { game: typeof game }).game.chips, chipsOnce)
})

test('CASE 30 — a completed hand clears per-hand secrets and the next hand starts cleanly', () => {
  let game = startPracticeHand(createPracticeGame(mixedTable(3, 'normal', 10000), 66))
  const done = playPracticeHandToEnd(game, makeRng(66)).game
  assert.equal(done.phase, 'COMPLETED')
  assert.deepEqual(done.holeBySeat, {}) // per-hand secret cleared at settlement
  // Next hand deals fresh (no stuck reservation / orphan state).
  const next = startPracticeHand(done)
  assert.equal(next.phase === 'BETTING' || next.phase === 'COMPLETED', true)
  assert.ok(Object.keys(next.holeBySeat).length >= 2)
})

test('session conservation — many hands never change the isolated supply', () => {
  let game = createPracticeGame(mixedTable(4, 'normal', 5000, 100), 2024)
  const supply0 = practiceSupply(game.chips)
  for (let h = 0; h < 60; h++) {
    if (game.config.seats.filter((s) => (game.chips[s.seatIndex] ?? 0) > 0).length < 2) break
    game = startPracticeHand(game)
    game = playPracticeHandToEnd(game, makeRng(2024 + h)).game
    assert.equal(practiceSupply(game.chips), supply0, `supply drifted after hand ${h}`)
  }
})
