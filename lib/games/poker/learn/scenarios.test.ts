import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  startTraining,
  trainingApply,
  suggestedLearnerAction,
  trainingView,
  type TrainingSession,
} from './trainer.ts'
import { TRAINING_SCENARIOS, getTrainingScenario, TRAINING_SCENARIO_IDS } from './scenarios.ts'

// Drive a scenario to completion by always taking the learner's SUGGESTED action (the scripted
// good line). Returns the final session.
function playSuggested(id: string): TrainingSession {
  const scenario = getTrainingScenario(id)
  assert.ok(scenario, `scenario ${id} exists`)
  let session = startTraining(scenario!)
  for (let guard = 0; guard < 50 && !session.settled; guard++) {
    if (session.state.turnSeat !== session.learnerSeat) break
    const suggested = suggestedLearnerAction(session)
    assert.ok(suggested, `learner has a suggested action on turn (${id})`)
    const res = trainingApply(session, suggested!)
    assert.ok(res.ok, `suggested action is legal (${id}): ${res.ok ? '' : res.error}`)
    session = res.session
  }
  return session
}

function totalPayout(session: TrainingSession, seat: number): number {
  return (session.settled?.payouts ?? [])
    .filter((p) => p.seatIndex === seat)
    .reduce((s, p) => s + p.amount, 0)
}

test('every scenario id maps to exactly one scenario, in order', () => {
  assert.equal(TRAINING_SCENARIOS.length, TRAINING_SCENARIO_IDS.length)
  assert.deepEqual(
    TRAINING_SCENARIOS.map((s) => s.id),
    [...TRAINING_SCENARIO_IDS],
  )
})

test('every scenario reaches settlement with the suggested line and conserves chips', () => {
  for (const s of TRAINING_SCENARIOS) {
    const session = playSuggested(s.id)
    assert.ok(session.settled, `${s.id} settled`)
    const started = s.seats.reduce((sum, seat) => sum + seat.stack, 0)
    // Conservation: payouts + refund + surviving stacks == chips that started on the table.
    const payouts = session.settled!.payouts.reduce((sum, p) => sum + p.amount, 0)
    const refund = session.settled!.refund?.amount ?? 0
    const contributed = session.state.round.players.reduce((sum, p) => sum + p.committedTotal, 0)
    assert.equal(payouts + refund, contributed, `${s.id}: pot conserved`)
    assert.ok(started > 0)
  }
})

test('check_vs_call — learner (A-K, pair of aces) wins a checked/called-down pot', () => {
  const session = playSuggested('check_vs_call')
  assert.ok(totalPayout(session, 0) > 0)
  assert.equal(totalPayout(session, 1), 0)
  assert.ok(session.settled!.wentToShowdown)
})

test('bet_vs_raise — learner (set of kings) wins after betting then calling a raise', () => {
  const session = playSuggested('bet_vs_raise')
  assert.ok(totalPayout(session, 0) > 0)
  assert.equal(totalPayout(session, 1), 0)
})

test('fold — folding forfeits the hand; opponent wins uncontested with no reveal', () => {
  const session = playSuggested('fold')
  assert.equal(totalPayout(session, 0), 0)
  assert.ok(totalPayout(session, 1) > 0)
  assert.equal(session.settled!.wentToShowdown, false)
  assert.equal(session.settled!.reveal.length, 0) // POT-ONELEFT-001: winner never shows
})

test('one_pair_kicker — same pair, learner wins on the higher kicker', () => {
  const session = playSuggested('one_pair_kicker')
  assert.ok(totalPayout(session, 0) > 0)
  assert.equal(totalPayout(session, 1), 0)
})

test('board_plays — royal on the board plays for both; pot is split', () => {
  const session = playSuggested('board_plays')
  assert.ok(totalPayout(session, 0) > 0)
  assert.ok(totalPayout(session, 1) > 0)
  assert.equal(totalPayout(session, 0), totalPayout(session, 1))
})

test('split_pot — identical two pair; pot chopped evenly', () => {
  const session = playSuggested('split_pot')
  assert.equal(totalPayout(session, 0), totalPayout(session, 1))
  assert.ok(totalPayout(session, 0) > 0)
})

test('all_in — aces hold; short learner doubles up through the runout', () => {
  const session = playSuggested('all_in')
  assert.ok(totalPayout(session, 0) > 0)
  assert.equal(session.state.board.length, 5) // ran the board out
})

test('main_side_pot — learner wins the main pot, opponent wins the side pot', () => {
  const session = playSuggested('main_side_pot')
  const pots = session.settled!.pots
  assert.ok(pots.length >= 2, 'a side pot was created')
  // main pot (all three eligible) → learner (aces)
  assert.equal(totalPayout(session, 0), 3000)
  // side pot (2000) → seat 1 (kings) beats seat 2 (queens)
  assert.equal(totalPayout(session, 1), 2000)
  assert.equal(totalPayout(session, 2), 0)
})

test('min_raise — the minimum legal raise (100 → 200) is accepted', () => {
  const scenario = getTrainingScenario('min_raise')!
  let session = startTraining(scenario)
  // pre-flop call
  session = (trainingApply(session, { type: 'call' }) as { session: TrainingSession }).session
  // on the flop the opponent has bet 100; the learner's legal minimum raise-to must be 200
  const view = trainingView(session)
  assert.ok(view.legal)
  assert.equal(view.legal!.minRaiseTo, 200)
  const res = trainingApply(session, { type: 'raise', to: 200 })
  assert.ok(res.ok)
})

test('auto_showdown — both all-in pre-flop; no further learner decision is offered', () => {
  const scenario = getTrainingScenario('auto_showdown')!
  const session = startTraining(scenario)
  // Learner still owes the first (all-in) action; take it, then the hand must settle on its own.
  const res = trainingApply(session, { type: 'all_in' })
  assert.ok(res.ok)
  assert.ok(res.session.settled, 'hand auto-ran to showdown with no more prompts')
  assert.equal(res.session.state.board.length, 5)
})

test('privacy — before showdown, opponents’ hole cards never appear in the view', () => {
  const scenario = getTrainingScenario('check_vs_call')!
  const session = startTraining(scenario)
  const view = trainingView(session)
  const learner = view.seats.find((s) => s.isLearner)!
  const opp = view.seats.find((s) => !s.isLearner)!
  assert.ok(learner.cards, 'learner always sees own cards')
  assert.equal(opp.cards, null, 'opponent cards are face-down pre-showdown')
})
