// Run with: node --test lib/tournaments/domain/round-robin.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateRoundRobin } from './round-robin.ts'
import { isTournamentDomainError } from './errors.ts'
import type { Competitor } from './types.ts'

const comps = (n: number): Competitor[] =>
  Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, name: `C${i + 1}` }))

function pairSet(matches: { competitorAId: string; competitorBId: string }[]): Set<string> {
  return new Set(matches.map((m) => [m.competitorAId, m.competitorBId].sort().join('|')))
}

for (const n of [2, 3, 4, 5, 6, 7, 8]) {
  test(`round-robin ${n}: total = n(n-1)/2, every pair once, no self/reverse dup`, () => {
    const matches = generateRoundRobin({ groupId: 'G', competitors: comps(n) })
    assert.equal(matches.length, (n * (n - 1)) / 2)
    // no self-match
    assert.ok(matches.every((m) => m.competitorAId !== m.competitorBId))
    // each unordered pair exactly once (Set size equals count → no reversed/duplicate pairs)
    assert.equal(pairSet(matches).size, matches.length)
    // every competitor plays exactly n-1 matches
    const played = new Map<string, number>()
    for (const m of matches) {
      played.set(m.competitorAId, (played.get(m.competitorAId) ?? 0) + 1)
      played.set(m.competitorBId, (played.get(m.competitorBId) ?? 0) + 1)
    }
    for (const c of comps(n)) assert.equal(played.get(c.id), n - 1)
  })
}

test('round-robin: odd count emits NO competitor-vs-BYE match', () => {
  const matches = generateRoundRobin({ groupId: 'G', competitors: comps(5) })
  assert.ok(matches.every((m) => m.competitorAId !== '' && m.competitorBId !== ''))
  assert.ok(!JSON.stringify(matches).toLowerCase().includes('bye'))
})

test('round-robin: deterministic — same input twice → identical output', () => {
  const a = generateRoundRobin({ groupId: 'G', competitors: comps(6) })
  const b = generateRoundRobin({ groupId: 'G', competitors: comps(6) })
  assert.deepEqual(a, b)
})

test('round-robin: does not mutate input array', () => {
  const roster = comps(4)
  const snapshot = JSON.stringify(roster)
  generateRoundRobin({ groupId: 'G', competitors: roster })
  assert.equal(JSON.stringify(roster), snapshot)
})

test('round-robin: round/match numbers present and 1-based', () => {
  const matches = generateRoundRobin({ groupId: 'G', competitors: comps(4) })
  assert.ok(matches.every((m) => m.roundNumber >= 1 && m.matchNumber >= 1))
  assert.equal(matches[matches.length - 1].matchNumber, matches.length)
})

test('round-robin: generationKey is stable per sorted pair & unique', () => {
  const matches = generateRoundRobin({ groupId: 'G', competitors: comps(4) })
  const keys = matches.map((m) => m.generationKey)
  assert.equal(new Set(keys).size, keys.length)
  // reversing the roster must yield the SAME set of keys (reversal-proof)
  const rev = generateRoundRobin({ groupId: 'G', competitors: [...comps(4)].reverse() })
  assert.deepEqual(new Set(matches.map((m) => m.generationKey)), new Set(rev.map((m) => m.generationKey)))
})

test('round-robin: different groupId → different keys', () => {
  const a = generateRoundRobin({ groupId: 'A', competitors: comps(3) })
  const b = generateRoundRobin({ groupId: 'B', competitors: comps(3) })
  assert.equal(new Set([...a, ...b].map((m) => m.generationKey)).size, a.length + b.length)
})

test('round-robin: 0 and 1 competitor → no matches', () => {
  assert.equal(generateRoundRobin({ groupId: 'G', competitors: [] }).length, 0)
  assert.equal(generateRoundRobin({ groupId: 'G', competitors: comps(1) }).length, 0)
})

test('round-robin: duplicate competitor id throws DUPLICATE_COMPETITOR', () => {
  try {
    generateRoundRobin({ groupId: 'G', competitors: [{ id: 'x', name: 'X' }, { id: 'x', name: 'X2' }] })
    assert.fail('expected throw')
  } catch (e) {
    assert.ok(isTournamentDomainError(e) && e.code === 'DUPLICATE_COMPETITOR')
  }
})
