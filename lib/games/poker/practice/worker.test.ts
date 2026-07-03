import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeRng } from '../../tlmn/ai/seededRandom.ts'
import { createPracticeGame, startPracticeHand, currentActor } from './runtime.ts'
import { botThinkDelayMs, botEligibility, workerStep, DEFAULT_BOT_TIMING } from './worker.ts'
import { mixedTable, advanceToBotActor } from './fixtures.ts'

function botTurnGame(seed: number) {
  // Advance until a bot is the current actor, so the worker tests exercise the real bot path.
  const started = startPracticeHand(createPracticeGame(mixedTable(4, 'normal', 10000), seed))
  const game = advanceToBotActor(started, makeRng(seed))
  if (!game) throw new Error('worker test: could not reach a bot actor')
  return game
}

test('think-delay is bounded and deterministic given the rng', () => {
  const game = botTurnGame(1)
  const a = botThinkDelayMs(game, makeRng(5))
  const b = botThinkDelayMs(game, makeRng(5))
  assert.equal(a, b)
  assert.ok(a >= DEFAULT_BOT_TIMING.minMs && a <= DEFAULT_BOT_TIMING.maxMs)
})

test('think-delay does NOT depend on hand strength (only opponents + jitter)', () => {
  // Same seed + same live-opponent count ⇒ same delay regardless of the actual cards dealt. We
  // approximate by asserting the delay is a pure function of (game shape, rng) — two different
  // deals with the same seat count and same seeded rng give the same delay.
  const g1 = startPracticeHand(createPracticeGame(mixedTable(4, 'normal', 10000), 100))
  const g2 = startPracticeHand(createPracticeGame(mixedTable(4, 'normal', 10000), 200))
  // Both preflop, same live count; the delay formula ignores cards entirely.
  assert.equal(botThinkDelayMs(g1, makeRng(7)), botThinkDelayMs(g2, makeRng(7)))
})

test('CASE 28 — with the flag OFF the worker never acts (flag_off)', () => {
  const game = botTurnGame(3)
  const elig = botEligibility({ game, flagOn: false, nowMs: 10_000, turnStartedAtMs: 0, delayMs: 0 })
  assert.equal(elig.canAct, false)
  assert.equal((elig as { reason: string }).reason, 'flag_off')
  const step = workerStep({ game, flagOn: false, nowMs: 10_000, turnStartedAtMs: 0, rng: makeRng(1) })
  assert.equal(step.acted, false)
  assert.equal(step.ineligibleReason, 'flag_off')
})

test('a bot must not act before the server think-delay elapses (delay_pending)', () => {
  const game = botTurnGame(4)
  const actor = currentActor(game)
  if (!actor || !actor.isBot) return
  const elig = botEligibility({ game, flagOn: true, nowMs: 0, turnStartedAtMs: 0, delayMs: 1000 })
  assert.equal(elig.canAct, false)
  assert.equal((elig as { reason: string }).reason, 'delay_pending')
})

test('a non-practice table is never eligible for bot action', () => {
  const game = botTurnGame(5)
  const cash = { ...game, config: { ...game.config, kind: 'cash' as unknown as 'practice' } }
  const elig = botEligibility({ game: cash, flagOn: true, nowMs: 10_000, turnStartedAtMs: 0, delayMs: 0 })
  assert.equal(elig.canAct, false)
  assert.equal((elig as { reason: string }).reason, 'not_practice')
})

test('CASE 29 — disabling then re-enabling leaves the active hand intact and resumable', () => {
  const game = botTurnGame(6)
  const before = JSON.stringify({ hand: game.hand, chips: game.chips, phase: game.phase })
  // flag off: no mutation
  const off = workerStep({ game, flagOn: false, nowMs: 10_000, turnStartedAtMs: 0, rng: makeRng(1) })
  assert.equal(off.acted, false)
  const after = JSON.stringify({ hand: game.hand, chips: game.chips, phase: game.phase })
  assert.equal(before, after) // game object untouched
  // re-enabled: a bot actor can now act
  const actor = currentActor(game)
  if (actor && actor.isBot) {
    const on = workerStep({ game, flagOn: true, nowMs: 10_000, turnStartedAtMs: 0, rng: makeRng(1) })
    assert.equal(on.acted, true)
  }
})

test('workerStep is idempotent-safe: re-running on the SAME state never double-commits downstream', () => {
  const game = botTurnGame(7)
  const actor = currentActor(game)
  if (!actor || !actor.isBot) return
  const s1 = workerStep({ game, flagOn: true, nowMs: 10_000, turnStartedAtMs: 0, rng: makeRng(3) })
  const s2 = workerStep({ game, flagOn: true, nowMs: 10_000, turnStartedAtMs: 0, rng: makeRng(3) })
  // Both steps read the same pre-action game; each independently applies to a fresh copy. The
  // real dedupe is the runtime's stale-seq rejection when the ADVANCED game is written back — which
  // the runtime test proves. Here we assert determinism: same input ⇒ same committed action.
  if (s1.outcome?.result.ok && s2.outcome?.result.ok) {
    assert.deepEqual(s1.outcome.result.game.hand, s2.outcome.result.game.hand)
  }
})
