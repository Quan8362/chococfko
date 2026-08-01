import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatCapabilities, hasConsolationBracket } from './format-capabilities.ts'
import type { EventFormat } from './types.ts'

const ALL: EventFormat[] = ['round_robin', 'knockout', 'group_knockout']

test('round_robin is a pure standings format with no bracket, podium or third place', () => {
  const c = formatCapabilities('round_robin')
  assert.equal(c.hasGroupStage, true)
  assert.equal(c.needsGroupAssignment, true)
  assert.equal(c.needsStandings, true)
  assert.equal(c.hasKnockout, false)
  assert.equal(c.needsBracket, false)
  assert.equal(c.hasChampionshipBracket, false)
  assert.equal(c.canHaveConsolationBracket, false)
  assert.equal(c.hasThirdPlaceOption, false)
  assert.equal(c.hasPodium, false)
})

test('knockout is a pure bracket format with no group stage or standings', () => {
  const c = formatCapabilities('knockout')
  assert.equal(c.hasGroupStage, false)
  assert.equal(c.needsGroupAssignment, false)
  assert.equal(c.needsStandings, false)
  assert.equal(c.hasKnockout, true)
  assert.equal(c.needsBracket, true)
  assert.equal(c.hasChampionshipBracket, true)
  assert.equal(c.canHaveConsolationBracket, false)
  assert.equal(c.hasThirdPlaceOption, true)
  assert.equal(c.hasPodium, true)
})

test('group_knockout has both a group stage and a knockout, and may carry a consolation branch', () => {
  const c = formatCapabilities('group_knockout')
  assert.equal(c.hasGroupStage, true)
  assert.equal(c.needsGroupAssignment, true)
  assert.equal(c.needsStandings, true)
  assert.equal(c.hasKnockout, true)
  assert.equal(c.needsBracket, true)
  assert.equal(c.hasChampionshipBracket, true)
  assert.equal(c.canHaveConsolationBracket, true)
  assert.equal(c.hasThirdPlaceOption, true)
  assert.equal(c.hasPodium, true)
})

test('a championship bracket exists iff there is a knockout', () => {
  for (const f of ALL) {
    const c = formatCapabilities(f)
    assert.equal(c.hasChampionshipBracket, c.hasKnockout)
  }
})

test('needsBracket and hasPodium track the presence of a knockout', () => {
  for (const f of ALL) {
    const c = formatCapabilities(f)
    assert.equal(c.needsBracket, c.hasKnockout)
    assert.equal(c.hasPodium, c.hasKnockout)
  }
})

test('only group_knockout with a positive consolation quota actually has a consolation bracket', () => {
  assert.equal(hasConsolationBracket('group_knockout', 1), true)
  assert.equal(hasConsolationBracket('group_knockout', 2), true)
  // Zero qualifiers → no consolation branch, even though the format supports one.
  assert.equal(hasConsolationBracket('group_knockout', 0), false)
  // Formats that cannot carry a consolation branch never do, whatever the number.
  assert.equal(hasConsolationBracket('knockout', 2), false)
  assert.equal(hasConsolationBracket('round_robin', 2), false)
})

test('capability records are frozen (shared, must never be mutated by a consumer)', () => {
  const c = formatCapabilities('round_robin')
  assert.throws(() => {
    // @ts-expect-error intentional mutation attempt on a readonly, frozen record
    c.needsBracket = true
  })
})
