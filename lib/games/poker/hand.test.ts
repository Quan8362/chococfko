// Framework-free tests for the STEP-WISE hand controller (hand.ts).
// Run with:  node --test lib/games/poker/hand.test.ts
//
// Strategy: drive the controller ONE action at a time (exactly how the server will) and
// cross-check the resulting settlement against engine.ts `playHand` (the already-proven batch
// orchestrator) for the SAME seed + script. If the step controller and the batch engine agree
// on board, payouts, refund, reveal and pots — and coins conserve — the controller is correct.
// Also covers: legal-action model, turn/idempotency guards, and reload-from-serialized-state.
//
// Maps to: HAND START, STREET ADVANCEMENT, SHOWDOWN/SETTLEMENT, POT-ONELEFT-001,
// ROUND-ALLIN-RUNOUT-001, POT-CONSERVE-001, RELOAD-001, and the "TEST COMPLETE HANDS" list.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { playHand, type HandConfig, type ScriptedAction } from './engine.ts'
import { seededShuffle, deal } from './deck.ts'
import { settleShowdown, type ShowdownResult } from './showdown.ts'
import { isSettlementConserved } from './pot.ts'
import type { Card, Street } from './types.ts'
import {
  initHand,
  applyPlayerAction,
  nextStep,
  enterStreet,
  markComplete,
  legalActionModel,
  handContributions,
  contestingSeats,
  serializeHand,
  deserializeHand,
  potTotal,
  type HandState,
} from './hand.ts'

// Reproduce engine.ts dealing so the controller's board reveals match playHand's board.
function dealForConfig(config: HandConfig) {
  const shuffled = seededShuffle(config.seed)
  const dealt = deal(shuffled, config.seats.length)
  const ordered = config.seats.map((s) => s.seatIndex).sort((a, b) => a - b)
  const holeBySeat = new Map<number, readonly [Card, Card]>()
  ordered.forEach((si, i) => holeBySeat.set(si, dealt.holeBySeat[i]))
  const fullBoard: Card[] = [...dealt.flop, dealt.turn, dealt.river]
  return { holeBySeat, fullBoard }
}

function boardSlice(fullBoard: readonly Card[], street: Exclude<Street, 'PREFLOP' | 'SHOWDOWN'>): Card[] {
  if (street === 'FLOP') return fullBoard.slice(0, 3)
  if (street === 'TURN') return [fullBoard[3]]
  return [fullBoard[4]] // RIVER
}

interface DriveResult {
  showdown: ShowdownResult
  finalState: HandState
  consumed: number
  // optional reload point: serialize/deserialize once we reach this action index, then continue
}

// Drive a full hand through the controller. `reloadAt` (optional) round-trips the state through
// serialize/deserialize after that many player actions, proving a persisted hand resumes cleanly.
function driveHand(config: HandConfig, script: readonly ScriptedAction[], reloadAt?: number): DriveResult {
  const { holeBySeat, fullBoard } = dealForConfig(config)
  let { state } = initHand({
    handNo: 1,
    bigBlind: config.bigBlind,
    smallBlind: config.smallBlind,
    buttonSeat: config.buttonSeat,
    seats: config.seats,
  })
  let cursor = 0
  let guard = 0

  for (;;) {
    if (++guard > 500) throw new Error('driveHand: runaway loop')
    const step = nextStep(state)
    if (step.kind === 'await_action') {
      const scripted = script[cursor]
      if (!scripted) throw new Error(`driveHand: script exhausted, expected seat ${step.seatIndex}`)
      assert.equal(scripted.seatIndex, step.seatIndex, 'controller turn must match the script seat')
      const r = applyPlayerAction(state, scripted.seatIndex, scripted.action)
      assert.ok(r.ok, `action must be legal: ${r.ok ? '' : r.error}`)
      state = r.state
      cursor++
      if (reloadAt !== undefined && cursor === reloadAt) {
        state = deserializeHand(serializeHand(state)) // RELOAD-001 round trip
      }
      continue
    }
    if (step.kind === 'deal') {
      state = enterStreet(state, step.street as Exclude<Street, 'PREFLOP' | 'SHOWDOWN'>, boardSlice(fullBoard, step.street))
      continue
    }
    if (step.kind === 'runout') {
      const next = state.street === 'PREFLOP' ? 'FLOP' : state.street === 'FLOP' ? 'TURN' : 'RIVER'
      state = enterStreet(state, next, boardSlice(fullBoard, next))
      continue
    }
    // showdown or one_left → settle.
    const contesting = contestingSeats(state)
    const board = contesting.length <= 1 ? [] : fullBoard
    const showdown = settleShowdown({
      contribs: handContributions(state),
      board,
      holeBySeat,
      buttonSeat: state.buttonSeat,
      showFirstSeat: state.lastAggressor ?? undefined,
    })
    state = markComplete(state)
    return { showdown, finalState: state, consumed: cursor }
  }
}

// Assert the controller's settlement equals the batch engine's, and coins conserve.
function assertMatchesEngine(config: HandConfig, script: readonly ScriptedAction[], reloadAt?: number) {
  const driven = driveHand(config, script, reloadAt)
  const batch = playHand(config, script)
  assert.deepEqual(driven.showdown.payouts, batch.showdown.payouts, 'payouts must match playHand')
  assert.deepEqual(driven.showdown.refund, batch.showdown.refund, 'refund must match playHand')
  assert.deepEqual(driven.showdown.reveal, batch.showdown.reveal, 'reveal must match playHand')
  assert.deepEqual(driven.showdown.winnersByPot, batch.showdown.winnersByPot, 'winnersByPot must match')
  assert.deepEqual(
    driven.showdown.pots.map((p) => p.amount),
    batch.showdown.pots.map((p) => p.amount),
    'pot amounts must match',
  )
  assert.equal(driven.showdown.wentToShowdown, batch.showdown.wentToShowdown)
  assert.ok(
    isSettlementConserved(handContributions(driven.finalState), driven.showdown.payouts, driven.showdown.refund),
    'POT-CONSERVE-001: payouts + refunds == contributions',
  )
  return driven
}

// ── Configs ──────────────────────────────────────────────────────────────────────────
const config3 = (seed: number): HandConfig => ({
  seed,
  bigBlind: 100,
  buttonSeat: 0,
  seats: [
    { seatIndex: 0, stack: 1000 },
    { seatIndex: 1, stack: 1000 },
    { seatIndex: 2, stack: 1000 },
  ],
})

const configHU = (seed: number, sA = 1000, sB = 1000): HandConfig => ({
  seed,
  bigBlind: 100,
  buttonSeat: 0,
  seats: [
    { seatIndex: 0, stack: sA },
    { seatIndex: 1, stack: sB },
  ],
})

const config6 = (seed: number): HandConfig => ({
  seed,
  bigBlind: 100,
  buttonSeat: 0,
  seats: Array.from({ length: 6 }, (_, i) => ({ seatIndex: i, stack: 1000 })),
})

// ── 1. Fold before flop (everyone folds to the BB) ──────────────────────────────────────
test('fold before flop — folds to the BB, BB wins dead blinds, no reveal', () => {
  const script: ScriptedAction[] = [
    { seatIndex: 0, action: { type: 'fold' } },
    { seatIndex: 1, action: { type: 'fold' } },
  ]
  const r = assertMatchesEngine(config3(11), script)
  assert.equal(r.showdown.wentToShowdown, false)
  assert.deepEqual(r.showdown.reveal, [])
})

// ── 2. Check-down showdown (call/call/check then check it down) ──────────────────────────
test('check-down showdown — three-way, board runs to the river with checks', () => {
  const script: ScriptedAction[] = [
    { seatIndex: 0, action: { type: 'call' } },
    { seatIndex: 1, action: { type: 'call' } },
    { seatIndex: 2, action: { type: 'check' } },
    { seatIndex: 1, action: { type: 'check' } },
    { seatIndex: 2, action: { type: 'check' } },
    { seatIndex: 0, action: { type: 'check' } },
    { seatIndex: 1, action: { type: 'check' } },
    { seatIndex: 2, action: { type: 'check' } },
    { seatIndex: 0, action: { type: 'check' } },
    { seatIndex: 1, action: { type: 'check' } },
    { seatIndex: 2, action: { type: 'check' } },
    { seatIndex: 0, action: { type: 'check' } },
  ]
  const r = assertMatchesEngine(config3(4242), script)
  assert.equal(r.finalState.board.length, 5)
  assert.ok(r.showdown.wentToShowdown)
})

// ── 3. Bet and fold (flop bet takes it down) ─────────────────────────────────────────────
test('bet and fold — preflop callers, flop bet wins uncontested', () => {
  const script: ScriptedAction[] = [
    { seatIndex: 0, action: { type: 'call' } },
    { seatIndex: 1, action: { type: 'call' } },
    { seatIndex: 2, action: { type: 'check' } },
    // flop: seat 1 leads, others fold
    { seatIndex: 1, action: { type: 'bet', to: 200 } },
    { seatIndex: 2, action: { type: 'fold' } },
    { seatIndex: 0, action: { type: 'fold' } },
  ]
  const r = assertMatchesEngine(config3(99), script)
  assert.equal(r.showdown.wentToShowdown, false)
})

// ── 4. Heads-up hand (raise / call, play to showdown) ────────────────────────────────────
test('heads-up hand — SB(button) raises, BB calls, checked to showdown', () => {
  const script: ScriptedAction[] = [
    { seatIndex: 0, action: { type: 'raise', to: 300 } }, // SB/button first to act preflop
    { seatIndex: 1, action: { type: 'call' } },
    // flop: BB (seat 1) first postflop
    { seatIndex: 1, action: { type: 'check' } },
    { seatIndex: 0, action: { type: 'check' } },
    { seatIndex: 1, action: { type: 'check' } },
    { seatIndex: 0, action: { type: 'check' } },
    { seatIndex: 1, action: { type: 'check' } },
    { seatIndex: 0, action: { type: 'check' } },
  ]
  assertMatchesEngine(configHU(7), script)
})

// ── 5. Six-player hand (mixed folds + calls to showdown) ─────────────────────────────────
test('six-player hand — UTG raises, two call, rest fold, checked down', () => {
  const script: ScriptedAction[] = [
    { seatIndex: 3, action: { type: 'raise', to: 300 } }, // UTG = seat left of BB(2)
    { seatIndex: 4, action: { type: 'fold' } },
    { seatIndex: 5, action: { type: 'call' } },
    { seatIndex: 0, action: { type: 'fold' } },
    { seatIndex: 1, action: { type: 'fold' } },
    { seatIndex: 2, action: { type: 'call' } },
    // flop: first active left of button(0) = seat 2
    { seatIndex: 2, action: { type: 'check' } },
    { seatIndex: 3, action: { type: 'check' } },
    { seatIndex: 5, action: { type: 'check' } },
    // turn
    { seatIndex: 2, action: { type: 'check' } },
    { seatIndex: 3, action: { type: 'check' } },
    { seatIndex: 5, action: { type: 'check' } },
    // river
    { seatIndex: 2, action: { type: 'check' } },
    { seatIndex: 3, action: { type: 'check' } },
    { seatIndex: 5, action: { type: 'check' } },
  ]
  assertMatchesEngine(config6(2026), script)
})

// ── 6. All-in pre-flop (heads-up shove + call → runout) ──────────────────────────────────
test('all-in pre-flop — heads-up shove and call run the board out', () => {
  const script: ScriptedAction[] = [
    { seatIndex: 0, action: { type: 'all_in' } },
    { seatIndex: 1, action: { type: 'all_in' } },
  ]
  const r = assertMatchesEngine(configHU(7), script)
  assert.equal(r.finalState.board.length, 5)
  assert.ok(r.showdown.wentToShowdown)
})

// ── 7 & 8 & 9 & 10. Multiple all-ins → multiple side pots, different stacks ───────────────
test('multiple all-ins — three stacks of different sizes build layered side pots', () => {
  // Seats with distinct stacks so all-ins create a main pot + side pots.
  const config: HandConfig = {
    seed: 555,
    bigBlind: 100,
    buttonSeat: 0,
    seats: [
      { seatIndex: 0, stack: 300 }, // shortest
      { seatIndex: 1, stack: 600 }, // medium
      { seatIndex: 2, stack: 1200 }, // largest
    ],
  }
  // UTG(button 0) shoves 300; seat1 shoves 600; seat2 calls 600.
  const script: ScriptedAction[] = [
    { seatIndex: 0, action: { type: 'all_in' } }, // to 300
    { seatIndex: 1, action: { type: 'all_in' } }, // to 600
    { seatIndex: 2, action: { type: 'call' } }, // calls 600
  ]
  const r = assertMatchesEngine(config, script)
  assert.ok(r.showdown.pots.length >= 2, 'distinct stacks must produce at least a main + one side pot')
  assert.ok(r.showdown.wentToShowdown)
})

// ── 11. Uncalled-bet refund (overbet shove, everyone folds) ──────────────────────────────
test('uncalled-bet refund — a shove that everyone folds to refunds the uncalled excess', () => {
  const script: ScriptedAction[] = [
    { seatIndex: 0, action: { type: 'raise', to: 500 } },
    { seatIndex: 1, action: { type: 'fold' } },
    { seatIndex: 2, action: { type: 'fold' } },
  ]
  const r = assertMatchesEngine(config3(33), script)
  // Seat 0 committed 500 but only 100 (BB) was called by the dead blinds; excess refunded.
  assert.ok(r.showdown.refund && r.showdown.refund.seatIndex === 0, 'aggressor gets the uncalled refund')
})

// ── 12. Split pot / different winners across pots — structural cross-check ────────────────
// We can't force specific cards, but the controller must agree with the batch engine on
// however the pots split for a given deal, across many seeds (covers split + different winners).
test('split pot & different winners across pots — controller agrees with engine over many seeds', () => {
  const script: ScriptedAction[] = [
    { seatIndex: 0, action: { type: 'all_in' } },
    { seatIndex: 1, action: { type: 'all_in' } },
  ]
  for (let seed = 1; seed <= 40; seed++) {
    assertMatchesEngine(configHU(seed), script)
  }
})

// ── 13. Settlement retry (pure idempotency: a completed hand accepts no further action) ───
test('settlement retry guard — a completed hand rejects further actions (idempotency seam)', () => {
  const script: ScriptedAction[] = [
    { seatIndex: 0, action: { type: 'fold' } },
    { seatIndex: 1, action: { type: 'fold' } },
  ]
  const { finalState } = driveHand(config3(11), script)
  assert.equal(finalState.complete, true)
  const retry = applyPlayerAction(finalState, finalState.bbSeat, { type: 'check' })
  assert.equal(retry.ok, false)
  assert.equal(retry.ok === false && retry.error, 'hand_complete')
})

// ── 14. Reload persisted hand state mid-hand, then continue to the same settlement ───────
test('reload persisted hand — serialize/deserialize mid-hand resumes to the identical result', () => {
  const script: ScriptedAction[] = [
    { seatIndex: 0, action: { type: 'call' } },
    { seatIndex: 1, action: { type: 'call' } },
    { seatIndex: 2, action: { type: 'check' } },
    { seatIndex: 1, action: { type: 'bet', to: 200 } },
    { seatIndex: 2, action: { type: 'call' } },
    { seatIndex: 0, action: { type: 'fold' } },
    { seatIndex: 1, action: { type: 'check' } },
    { seatIndex: 2, action: { type: 'check' } },
    { seatIndex: 1, action: { type: 'check' } },
    { seatIndex: 2, action: { type: 'check' } },
  ]
  // Reload after 4 actions (mid-flop) — must reach the SAME settlement as no reload.
  const withReload = driveHand(config3(8181), script, 4)
  const noReload = driveHand(config3(8181), script)
  assert.deepEqual(withReload.showdown.payouts, noReload.showdown.payouts)
  assert.deepEqual(withReload.showdown.reveal, noReload.showdown.reveal)
})

// ── Player leaving during a hand maps to a fold at the engine layer ──────────────────────
test('player leaving during a hand — modeled as a fold, hand proceeds correctly', () => {
  // Seat 1 "leaves" (folds) mid-hand; the rest play on.
  const script: ScriptedAction[] = [
    { seatIndex: 0, action: { type: 'call' } },
    { seatIndex: 1, action: { type: 'fold' } }, // leaver forfeits the hand
    { seatIndex: 2, action: { type: 'check' } },
    { seatIndex: 2, action: { type: 'check' } },
    { seatIndex: 0, action: { type: 'check' } },
    { seatIndex: 2, action: { type: 'check' } },
    { seatIndex: 0, action: { type: 'check' } },
    { seatIndex: 2, action: { type: 'check' } },
    { seatIndex: 0, action: { type: 'check' } },
  ]
  assertMatchesEngine(config3(606), script)
})

// ── Legal-action model: the server's authoritative numbers for the current actor ─────────
test('legal-action model — preflop UTG sees the correct call/raise/all-in numbers', () => {
  const { state } = initHand({ handNo: 1, bigBlind: 100, buttonSeat: 0, seats: config3(1).seats })
  const model = legalActionModel(state)
  assert.ok(model)
  assert.equal(model!.seatIndex, 0) // 3-handed: button(0) is UTG and first to act preflop
  assert.equal(model!.callAmount, 100) // owes the big blind
  assert.equal(model!.minRaiseTo, 200) // currentBet(100) + lastFullRaise(100)
  assert.equal(model!.maxRaiseTo, 1000) // No-Limit: whole stack
  assert.ok(model!.allowed.includes('fold'))
  assert.ok(model!.allowed.includes('call'))
  assert.ok(model!.allowed.includes('raise'))
  assert.ok(model!.allowed.includes('all_in'))
  assert.equal(model!.pot, 150) // SB 50 + BB 100
})

// ── Turn guard: out-of-turn intent is rejected (server validates the actor) ──────────────
test('turn guard — an action from the wrong seat is rejected', () => {
  const { state } = initHand({ handNo: 1, bigBlind: 100, buttonSeat: 0, seats: config3(1).seats })
  const wrong = applyPlayerAction(state, 2, { type: 'call' }) // seat 0 is to act
  assert.equal(wrong.ok, false)
  assert.equal(wrong.ok === false && wrong.error, 'not_your_turn')
})

// ── potTotal accounting stays exact through a betting street ─────────────────────────────
test('potTotal — equals the sum of all committed chips at any point', () => {
  const { state } = initHand({ handNo: 1, bigBlind: 100, buttonSeat: 0, seats: config3(1).seats })
  assert.equal(potTotal(state), 150) // SB 50 + BB 100
  const r = applyPlayerAction(state, 0, { type: 'call' }) // UTG calls the BB
  assert.ok(r.ok)
  assert.equal(potTotal((r as { ok: true; state: HandState }).state), 250)
})
