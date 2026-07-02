import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ONBOARDING_STEPS,
  ONBOARDING_STEP_COUNT,
  ONBOARDING_VERSION,
  initialProgress,
  advance,
  back,
  pauseAt,
  skip,
  dontShowAgain,
  restart,
  complete,
  shouldAutoShow,
  currentStepKey,
  isLastStep,
  mergeProgress,
} from './onboarding.ts'

test('there are exactly ten unique steps covering the spec flow', () => {
  assert.equal(ONBOARDING_STEP_COUNT, 10)
  assert.equal(new Set(ONBOARDING_STEPS).size, 10)
  assert.deepEqual(
    [...ONBOARDING_STEPS],
    ['choose_table', 'buy_in', 'hole_cards', 'community_area', 'current_actor', 'action_buttons', 'call_amount', 'raise_to', 'pot', 'showdown'],
  )
})

test('a fresh tour auto-shows and starts at step one', () => {
  const p = initialProgress(1000)
  assert.equal(p.stepIndex, 0)
  assert.equal(shouldAutoShow(p), true)
  assert.equal(currentStepKey(p), 'choose_table')
})

test('advancing walks the steps and completes past the last one', () => {
  let p = initialProgress()
  for (let i = 0; i < ONBOARDING_STEP_COUNT - 1; i++) p = advance(p)
  assert.equal(isLastStep(p), true)
  assert.equal(p.completed, false)
  p = advance(p) // step past the last
  assert.equal(p.completed, true)
  assert.equal(shouldAutoShow(p), false) // completed → never auto-shows again
})

test('back never underflows below the first step', () => {
  let p = initialProgress()
  p = back(p)
  assert.equal(p.stepIndex, 0)
})

test('skip keeps the tour resumable; do-not-show-again opts out permanently', () => {
  let p = advance(advance(initialProgress())) // on step 3
  p = pauseAt(p, 2)
  p = skip(p)
  assert.equal(shouldAutoShow(p), true) // still eligible
  assert.equal(p.stepIndex, 2) // resumes where left
  const opted = dontShowAgain(p)
  assert.equal(shouldAutoShow(opted), false)
})

test('restart re-enables the tour from the beginning', () => {
  const opted = dontShowAgain(complete(initialProgress()))
  const r = restart()
  assert.equal(r.stepIndex, 0)
  assert.equal(r.completed, false)
  assert.equal(r.dismissed, false)
  assert.equal(shouldAutoShow(r), true)
  void opted
})

test('mergeProgress rejects malformed / stale blobs and clamps the step index', () => {
  assert.equal(mergeProgress(null).stepIndex, 0)
  assert.equal(mergeProgress('nonsense').completed, false)
  assert.equal(mergeProgress({ version: ONBOARDING_VERSION + 99, stepIndex: 4 }).stepIndex, 0) // stale version → reset
  const ok = mergeProgress({ version: ONBOARDING_VERSION, stepIndex: 99, completed: true, dismissed: false, updatedAt: 5 })
  assert.equal(ok.stepIndex, ONBOARDING_STEP_COUNT - 1) // clamped
  assert.equal(ok.completed, true)
})
