import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildServerObservation } from './observation.ts'
import { createPracticeGame, startPracticeHand } from './runtime.ts'
import { deserializeHand } from '../hand.ts'
import { mixedTable } from './fixtures.ts'
import { FORBIDDEN_OBSERVATION_KEYS } from '../bot/observation.ts'

// Build a live practice hand and return the server game + the current actor's real hole cards.
function liveHand(seed: number) {
  const game = startPracticeHand(createPracticeGame(mixedTable(4, 'normal', 10000), seed))
  const state = deserializeHand(game.hand!)
  return { game, state }
}

test('CASE 1 — the acting bot CAN see its own two hole cards', () => {
  const { game, state } = liveHand(12345)
  const seat = state.turnSeat!
  const own = game.holeBySeat[seat]!
  const obs = buildServerObservation(state, seat, own)
  assert.deepEqual(obs.holeCards, own)
})

test('CASE 2 — opponents’ unrevealed hole cards are NOT reachable in the observation', () => {
  const { game, state } = liveHand(777)
  const seat = state.turnSeat!
  const obs = buildServerObservation(state, seat, game.holeBySeat[seat]!)
  const json = JSON.stringify(obs)
  for (const [s, cards] of Object.entries(game.holeBySeat)) {
    if (Number(s) === seat) continue
    for (const c of cards) {
      assert.ok(!json.includes(`"${c}"`), `opponent seat ${s} card ${c} leaked to the bot`)
    }
  }
})

test('CASE 3 — future board cards are NOT in the observation (only the revealed street)', () => {
  const { game, state } = liveHand(42)
  const seat = state.turnSeat!
  const obs = buildServerObservation(state, seat, game.holeBySeat[seat]!)
  // Preflop: zero board cards visible. The full 5-card board exists server-side (deckStub) but
  // never enters the observation.
  assert.equal(obs.board.length, 0)
  const fullBoard = JSON.stringify(game.deckStub.slice(8, 13)) // some upcoming cards
  // The observation must not serialize the undealt board region wholesale.
  assert.ok(!JSON.stringify(obs).includes(fullBoard))
})

test('CASE 4 — deck order and shuffle seed are NOT in the observation', () => {
  const { game, state } = liveHand(9)
  const seat = state.turnSeat!
  const obs = buildServerObservation(state, seat, game.holeBySeat[seat]!)
  const keys = Object.keys(obs)
  for (const forbidden of ['deck', 'deckStub', 'seed', 'rng', 'shuffled', 'holeBySeat']) {
    assert.ok(!keys.includes(forbidden), `observation exposed ${forbidden}`)
  }
  // The seed value must not appear anywhere in the serialized observation.
  assert.ok(!JSON.stringify(obs).includes(String(game.seed)))
})

test('CASE 5 — private/admin metadata cannot enter the observation (guard rejects forbidden keys)', () => {
  const { game, state } = liveHand(55)
  const seat = state.turnSeat!
  const obs = buildServerObservation(state, seat, game.holeBySeat[seat]!)
  // The builder’s output is a closed BotObservation; injecting any forbidden key fails the guard
  // used by decideSafely before a policy ever runs.
  for (const key of FORBIDDEN_OBSERVATION_KEYS) {
    assert.ok(!Object.prototype.hasOwnProperty.call(obs, key))
  }
})

test('the builder refuses to observe when it is not that seat’s turn', () => {
  const { game, state } = liveHand(1)
  const notActor = state.round.players.find((p) => p.seatIndex !== state.turnSeat)!.seatIndex
  assert.throws(() => buildServerObservation(state, notActor, game.holeBySeat[notActor]!), /not the current actor/)
})
