// Run with: node --test lib/tournaments/domain/progression.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKnockout, type KnockoutEntrant } from './knockout.ts'
import { progressKnockout } from './progression.ts'
import { isTournamentDomainError } from './errors.ts'

const players = (n: number): KnockoutEntrant[] =>
  Array.from({ length: n }, (_, i) => ({ kind: 'competitor', competitorId: `c${i + 1}` }))

test('progression: semifinal winner → final slot; loser → third place', () => {
  const bracket = generateKnockout({ bracket: 'championship', entrants: players(4), thirdPlaceEnabled: true })
  const sf1 = bracket.rounds[0][0] // round1 m1
  const res = progressKnockout({ bracket, completedMatchKey: sf1.matchKey, winnerId: 'c1', loserId: 'c4' })
  assert.equal(res.winnerId, 'c1')
  assert.equal(res.loserId, 'c4')
  // one patch to the final (winner), one to third place (loser)
  const finalPatch = res.patches.find((p) => p.matchKey === 'ko:championship:r2:m1')
  const thirdPatch = res.patches.find((p) => p.matchKey === 'ko:championship:third')
  assert.ok(finalPatch && finalPatch.competitorId === 'c1')
  assert.ok(thirdPatch && thirdPatch.competitorId === 'c4')
})

test('progression: final completion has no downstream patches', () => {
  const bracket = generateKnockout({ bracket: 'championship', entrants: players(4), thirdPlaceEnabled: false })
  const final = bracket.rounds[bracket.rounds.length - 1][0]
  const res = progressKnockout({ bracket, completedMatchKey: final.matchKey, winnerId: 'c1', loserId: 'c2' })
  assert.equal(res.patches.length, 0)
})

test('progression: bye advance routes winner forward, no loser patch', () => {
  const bracket = generateKnockout({ bracket: 'championship', entrants: players(3), thirdPlaceEnabled: false })
  const byeMatch = bracket.rounds[0].find((m) => m.isBye)!
  const res = progressKnockout({ bracket, completedMatchKey: byeMatch.matchKey, winnerId: 'c1', loserId: null })
  assert.equal(res.loserId, null)
  assert.ok(res.patches.every((p) => p.competitorId === 'c1'))
  assert.ok(res.patches.length >= 1)
})

test('progression: does not mutate the bracket', () => {
  const bracket = generateKnockout({ bracket: 'championship', entrants: players(4), thirdPlaceEnabled: true })
  const snap = JSON.stringify(bracket)
  progressKnockout({ bracket, completedMatchKey: bracket.rounds[0][0].matchKey, winnerId: 'c1', loserId: 'c4' })
  assert.equal(JSON.stringify(bracket), snap)
})

test('progression: unknown match key → UNKNOWN_MATCH', () => {
  const bracket = generateKnockout({ bracket: 'championship', entrants: players(4), thirdPlaceEnabled: false })
  try { progressKnockout({ bracket, completedMatchKey: 'nope', winnerId: 'c1' }); assert.fail() }
  catch (e) { assert.ok(isTournamentDomainError(e) && e.code === 'UNKNOWN_MATCH') }
})
