// Run with: node --test lib/tournaments/domain/knockout.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKnockout, type KnockoutEntrant } from './knockout.ts'
import { isTournamentDomainError } from './errors.ts'
import type { KnockoutBracket, KnockoutMatch } from './types.ts'

const players = (n: number): KnockoutEntrant[] =>
  Array.from({ length: n }, (_, i) => ({ kind: 'competitor', competitorId: `c${i + 1}` }))

const flat = (b: KnockoutBracket): KnockoutMatch[] => {
  const out = b.rounds.flat()
  if (b.thirdPlaceMatch) out.push(b.thirdPlaceMatch)
  return out
}

const CASES: Array<[number, number, number]> = [
  // entrants, expected size, expected byes
  [2, 2, 0], [3, 4, 1], [4, 4, 0], [5, 8, 3], [6, 8, 2], [8, 8, 0], [10, 16, 6], [16, 16, 0],
]

for (const [n, size, byes] of CASES) {
  test(`knockout ${n}: size=${size}, byes=${byes}`, () => {
    const b = generateKnockout({ bracket: 'championship', entrants: players(n), thirdPlaceEnabled: false })
    assert.equal(b.size, size)
    assert.equal(b.byes, byes)
    assert.equal(b.rounds[0].length, size / 2) // first round matches
    // total main-bracket matches = size - 1
    assert.equal(b.rounds.reduce((s, r) => s + r.length, 0), size - 1)
    // exactly `byes` first-round matches are auto-advance byes; none have TWO bye slots
    const firstByes = b.rounds[0].filter((m) => m.isBye).length
    assert.equal(firstByes, byes)
    assert.ok(b.rounds[0].every((m) => !(m.slotA.from === 'bye' && m.slotB.from === 'bye')))
  })
}

test('knockout: no 0–0 score used for a bye (bye is a slot kind)', () => {
  const b = generateKnockout({ bracket: 'championship', entrants: players(6), thirdPlaceEnabled: false })
  const byeMatches = b.rounds[0].filter((m) => m.isBye)
  assert.ok(byeMatches.length > 0)
  assert.ok(byeMatches.every((m) => m.slotA.from === 'bye' || m.slotB.from === 'bye'))
})

test('knockout: entrants never contain a fake bye competitor', () => {
  const b = generateKnockout({ bracket: 'championship', entrants: players(5), thirdPlaceEnabled: false })
  const entrantIds = b.rounds[0].flatMap((m) =>
    [m.slotA, m.slotB].filter((s) => s.from === 'entrant').map((s) => JSON.stringify(s)))
  assert.ok(!entrantIds.join('').toLowerCase().includes('bye'))
})

test('knockout: later rounds are winner-fed placeholders', () => {
  const b = generateKnockout({ bracket: 'championship', entrants: players(8), thirdPlaceEnabled: false })
  const r2 = b.rounds[1]
  assert.ok(r2.every((m) => m.slotA.from === 'winner' && m.slotB.from === 'winner'))
  // final references the two semifinal winners
  const final = b.rounds[b.rounds.length - 1][0]
  assert.equal(final.roundLabel, 'final')
})

test('knockout: round labels for size 16', () => {
  const b = generateKnockout({ bracket: 'championship', entrants: players(16), thirdPlaceEnabled: false })
  assert.deepEqual(b.rounds.map((r) => r[0].roundLabel), ['round_of_16', 'quarterfinal', 'semifinal', 'final'])
})

test('knockout: third place enabled → present (losers of semifinals)', () => {
  const b = generateKnockout({ bracket: 'championship', entrants: players(4), thirdPlaceEnabled: true })
  assert.ok(b.thirdPlaceMatch)
  assert.equal(b.thirdPlaceMatch!.roundLabel, 'third_place')
  assert.equal(b.thirdPlaceMatch!.slotA.from, 'loser')
  assert.equal(b.thirdPlaceMatch!.slotB.from, 'loser')
})

test('knockout: third place disabled → null; size 2 never has third place', () => {
  assert.equal(generateKnockout({ bracket: 'championship', entrants: players(4), thirdPlaceEnabled: false }).thirdPlaceMatch, null)
  assert.equal(generateKnockout({ bracket: 'championship', entrants: players(2), thirdPlaceEnabled: true }).thirdPlaceMatch, null)
})

test('knockout: generation keys unique across bracket (+third)', () => {
  const b = generateKnockout({ bracket: 'championship', entrants: players(8), thirdPlaceEnabled: true })
  const keys = flat(b).map((m) => m.generationKey)
  assert.equal(new Set(keys).size, keys.length)
})

test('knockout: championship & consolation keys never collide', () => {
  const champ = generateKnockout({ bracket: 'championship', entrants: players(4), thirdPlaceEnabled: true })
  const conso = generateKnockout({ bracket: 'consolation', entrants: players(4), thirdPlaceEnabled: true })
  const all = [...flat(champ), ...flat(conso)].map((m) => m.generationKey)
  assert.equal(new Set(all).size, all.length)
})

test('knockout: group_rank token entrants reused for group+knockout', () => {
  const entrants: KnockoutEntrant[] = [
    { kind: 'group_rank', groupId: 'A', rank: 1 },
    { kind: 'group_rank', groupId: 'B', rank: 2 },
    { kind: 'group_rank', groupId: 'B', rank: 1 },
    { kind: 'group_rank', groupId: 'A', rank: 2 },
  ]
  const b = generateKnockout({ bracket: 'championship', entrants, thirdPlaceEnabled: false })
  assert.equal(b.size, 4)
  assert.equal(b.rounds[0][0].slotA.from, 'entrant')
})

test('knockout: deterministic + non-mutating', () => {
  const entrants = players(6)
  const snap = JSON.stringify(entrants)
  const a = generateKnockout({ bracket: 'championship', entrants, thirdPlaceEnabled: true })
  const b = generateKnockout({ bracket: 'championship', entrants, thirdPlaceEnabled: true })
  assert.deepEqual(a, b)
  assert.equal(JSON.stringify(entrants), snap)
})

test('knockout: <2 entrants → NOT_ENOUGH_COMPETITORS', () => {
  try { generateKnockout({ bracket: 'championship', entrants: players(1), thirdPlaceEnabled: false }); assert.fail() }
  catch (e) { assert.ok(isTournamentDomainError(e) && e.code === 'NOT_ENOUGH_COMPETITORS') }
})

test('knockout: duplicate entrant → DUPLICATE_COMPETITOR', () => {
  const dup: KnockoutEntrant[] = [
    { kind: 'competitor', competitorId: 'x' },
    { kind: 'competitor', competitorId: 'x' },
  ]
  try { generateKnockout({ bracket: 'championship', entrants: dup, thirdPlaceEnabled: false }); assert.fail() }
  catch (e) { assert.ok(isTournamentDomainError(e) && e.code === 'DUPLICATE_COMPETITOR') }
})
