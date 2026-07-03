import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPracticeGame, startPracticeHand } from './runtime.ts'
import { toClientView, assertClientViewPrivacy } from './view.ts'
import { mixedTable } from './fixtures.ts'
import { SERVER_ONLY_GAME_KEYS } from './types.ts'

test('the client view carries the explicit practice + no-real-reward disclosure', () => {
  const game = startPracticeHand(createPracticeGame(mixedTable(3, 'normal', 10000), 1))
  const view = toClientView(game, 0)
  assert.equal(view.kind, 'practice')
  assert.equal(view.practice, true)
  assert.equal(view.noRealReward, true)
  const bots = view.seats.filter((s) => s.isBot)
  assert.ok(bots.length >= 1)
  for (const b of bots) assert.ok(b.difficulty) // bots are labelled with their difficulty
})

test('a human viewer sees ONLY their own hole cards; never an opponent’s', () => {
  const game = startPracticeHand(createPracticeGame(mixedTable(4, 'normal', 10000), 777))
  const view = toClientView(game, 0) // seat 0 is the human
  const own = game.holeBySeat[0]
  assert.deepEqual(view.ownHole, own)
  const json = JSON.stringify(view)
  for (const [seat, cards] of Object.entries(game.holeBySeat)) {
    if (Number(seat) === 0) continue
    for (const c of cards) assert.ok(!json.includes(`"${c}"`), `foreign card ${c} leaked to viewer`)
  }
})

test('the client view never contains server-only secrets (deck/seed/holeBySeat)', () => {
  const game = startPracticeHand(createPracticeGame(mixedTable(3, 'normal', 10000), 5))
  const view = toClientView(game, 0)
  const keys = Object.keys(view)
  for (const secret of SERVER_ONLY_GAME_KEYS) assert.ok(!keys.includes(secret))
  assert.ok(!JSON.stringify(view).includes(String(game.seed)))
})

test('assertClientViewPrivacy throws if a foreign card is present', () => {
  const game = startPracticeHand(createPracticeGame(mixedTable(3, 'normal', 10000), 9))
  const view = toClientView(game, 0)
  // Tamper: inject a foreign card into a copy and expect the guard to reject it.
  const foreignSeat = Object.keys(game.holeBySeat).map(Number).find((s) => s !== 0)!
  const tampered = { ...view, board: [...view.board, game.holeBySeat[foreignSeat][0]] }
  assert.throws(() => assertClientViewPrivacy(tampered, game, 0), /foreign hole card/)
})
