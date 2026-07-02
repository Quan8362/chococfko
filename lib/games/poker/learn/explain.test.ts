import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  explainWhyNot,
  explainMinRaise,
  callIsAllIn,
  explainShowdown,
  HELP_TOPICS,
} from './explain.ts'
import type { LegalActionModel } from '../hand.ts'
import { startTraining, trainingApply, suggestedLearnerAction, type TrainingSession } from './trainer.ts'
import { getTrainingScenario } from './scenarios.ts'

function model(over: Partial<LegalActionModel>): LegalActionModel {
  return {
    seatIndex: 0,
    allowed: ['fold', 'call', 'raise'],
    callAmount: 200,
    minOpeningBet: 100,
    minRaiseTo: 400,
    maxRaiseTo: 1000,
    currentStreetContribution: 0,
    totalContribution: 0,
    remainingStack: 1000,
    pot: 500,
    street: 'FLOP',
    actionSeq: 3,
    ...over,
  }
}

test('why can I not check — because a bet is owed (ACTION-CHECK-001)', () => {
  const e = explainWhyNot(model({ allowed: ['fold', 'call', 'raise'], callAmount: 200 }), 'check')
  assert.equal(e.code, 'check_blocked_by_bet')
  assert.equal(e.ruleId, 'ACTION-CHECK-001')
  assert.equal(e.params.callAmount, 200)
})

test('why can I not raise — capped (not reopened) vs no chips behind', () => {
  const noChips = explainWhyNot(model({ allowed: ['fold', 'call'], callAmount: 1000, remainingStack: 800 }), 'raise')
  assert.equal(noChips.code, 'raise_no_chips')
  const capped = explainWhyNot(model({ allowed: ['fold', 'call'], callAmount: 100, remainingStack: 1000 }), 'raise')
  assert.equal(capped.code, 'raise_not_reopened')
  assert.equal(capped.ruleId, 'RAISE-REOPEN-001')
})

test('all-in is my only way to call — calling costs the whole stack (ALLIN-CALLSHORT-001)', () => {
  const m = model({ allowed: ['fold', 'call'], callAmount: 900, remainingStack: 700 })
  assert.equal(callIsAllIn(m), true)
  const e = explainWhyNot(m, 'call')
  assert.equal(e.code, 'call_would_be_all_in')
  assert.equal(e.ruleId, 'ALLIN-CALLSHORT-001')
})

test('minimum raise explanation reports the smallest legal raise-to and its increment', () => {
  const e = explainMinRaise(model({ callAmount: 100, currentStreetContribution: 0, minRaiseTo: 200 }))
  assert.equal(e.ruleId, 'RAISE-MIN-001')
  assert.equal(e.minRaiseTo, 200)
  assert.equal(e.callTotal, 100)
  assert.equal(e.increment, 100)
})

test('help topics cover every spec question and each cites a rule id', () => {
  const keys = HELP_TOPICS.map((h) => h.key)
  for (const need of ['why_no_check', 'why_no_raise', 'min_raise', 'call_all_in', 'bet_returned', 'won_main_pot', 'won_side_pot', 'pot_split', 'board_played', 'auto_folded', 'sitting_out']) {
    assert.ok(keys.includes(need as (typeof keys)[number]), `topic ${need} present`)
  }
  for (const h of HELP_TOPICS) assert.ok(h.ruleId.length > 0)
})

// ── Post-hand explanation, driven by real settlements ──────────────────────────────────────────
function playSuggested(id: string): TrainingSession {
  let s = startTraining(getTrainingScenario(id)!)
  for (let g = 0; g < 50 && !s.settled; g++) {
    if (s.state.turnSeat !== s.learnerSeat) break
    s = (trainingApply(s, suggestedLearnerAction(s)!) as { session: TrainingSession }).session
  }
  return s
}

test('post-hand: one pair + kicker names the category and the deciding kicker', () => {
  const s = playSuggested('one_pair_kicker')
  const ex = explainShowdown(s.settled!, s.state.board)
  assert.equal(ex.wentToShowdown, true)
  assert.equal(ex.pots[0].categoryLabel, 'pair')
  assert.equal(ex.pots[0].kickerRank, 'A') // learner A-K → pair of kings, ace kicker
  assert.equal(ex.pots[0].boardPlays, false)
})

test('post-hand: board plays → split pot flagged, best five all from the board', () => {
  const s = playSuggested('board_plays')
  const ex = explainShowdown(s.settled!, s.state.board)
  assert.equal(ex.pots[0].split, true)
  assert.equal(ex.pots[0].boardPlays, true)
})

test('post-hand: main + side pot reported as two pots (main first, side second)', () => {
  const s = playSuggested('main_side_pot')
  const ex = explainShowdown(s.settled!, s.state.board)
  assert.ok(ex.pots.length >= 2)
  assert.equal(ex.pots[0].kind, 'main')
  assert.equal(ex.pots[1].kind, 'side')
})

test('post-hand: a fold win never reveals cards (reveal-safe)', () => {
  const s = playSuggested('fold')
  const ex = explainShowdown(s.settled!, s.state.board)
  assert.equal(ex.wentToShowdown, false)
  assert.equal(ex.reveal.length, 0)
})
