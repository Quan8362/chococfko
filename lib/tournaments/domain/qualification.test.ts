// Run with: node --test lib/tournaments/domain/qualification.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { qualifyGroup } from './qualification.ts'
import { calculateStandings } from './standings.ts'
import type { Competitor, MatchInput } from './types.ts'

const roster = (...ids: string[]): Competitor[] => ids.map((id) => ({ id, name: id }))
const M = (a: string, b: string, sa: number, sb: number, status: MatchInput['status'] = 'completed'): MatchInput =>
  ({ competitorAId: a, competitorBId: b, status, games: [{ gameNumber: 1, scoreA: sa, scoreB: sb }] })

// Strict ranking a > b > c > d (no ties).
function strict4() {
  return calculateStandings({
    competitors: roster('a', 'b', 'c', 'd'),
    matches: [
      M('a', 'b', 21, 0), M('a', 'c', 21, 0), M('a', 'd', 21, 0),
      M('b', 'c', 21, 0), M('b', 'd', 21, 0), M('c', 'd', 21, 0),
    ],
  })
}

// {a,b} tied at positions 1-2, then c, then d.
function tieTop() {
  return calculateStandings({
    competitors: roster('a', 'b', 'c', 'd'),
    matches: [M('a', 'c', 21, 0), M('a', 'd', 21, 0), M('b', 'c', 21, 0), M('b', 'd', 21, 0), M('c', 'd', 21, 0)],
  })
}

test('qualification A: championship=1, consolation=2 → [1] champ, [2,3] conso', () => {
  const r = qualifyGroup({ standings: strict4(), winnerQualifiers: 1, consolationQualifiers: 2 })
  assert.equal(r.status, 'ok')
  if (r.status !== 'ok') return
  assert.deepEqual(r.championship, ['a'])
  assert.deepEqual(r.consolation, ['b', 'c'])
})

test('qualification B: championship=2, consolation=2 → [1,2] champ, [3,4] conso', () => {
  const r = qualifyGroup({ standings: strict4(), winnerQualifiers: 2, consolationQualifiers: 2 })
  assert.equal(r.status, 'ok')
  if (r.status !== 'ok') return
  assert.deepEqual(r.championship, ['a', 'b'])
  assert.deepEqual(r.consolation, ['c', 'd'])
})

test('qualification: no competitor appears in both branches', () => {
  const r = qualifyGroup({ standings: strict4(), winnerQualifiers: 2, consolationQualifiers: 2 })
  if (r.status !== 'ok') { assert.fail('expected ok'); return }
  const overlap = r.championship.filter((id) => r.consolation.includes(id))
  assert.equal(overlap.length, 0)
})

test('qualification: unresolved tie straddling championship cut → blocked_by_tie', () => {
  const r = qualifyGroup({ standings: tieTop(), winnerQualifiers: 1, consolationQualifiers: 2 })
  assert.equal(r.status, 'blocked_by_tie')
  if (r.status !== 'blocked_by_tie') return
  assert.equal(r.ties[0].impact, 'championship_boundary')
  assert.deepEqual([...r.ties[0].competitorIds].sort(), ['a', 'b'])
})

test('qualification: manual resolvedOrder breaks the tie → ok', () => {
  const r = qualifyGroup({
    standings: tieTop(), winnerQualifiers: 1, consolationQualifiers: 2,
    resolvedOrder: ['a', 'b', 'c', 'd'],
  })
  assert.equal(r.status, 'ok')
  if (r.status !== 'ok') return
  assert.deepEqual(r.championship, ['a'])
  assert.deepEqual(r.consolation, ['b', 'c'])
})

test('qualification: resolvedOrder can put b ahead of a', () => {
  const r = qualifyGroup({
    standings: tieTop(), winnerQualifiers: 1, consolationQualifiers: 0,
    resolvedOrder: ['b', 'a', 'c', 'd'],
  })
  if (r.status !== 'ok') { assert.fail('expected ok'); return }
  assert.deepEqual(r.championship, ['b'])
})

test('qualification: count > group size → invalid QUALIFICATION_OVERFLOW', () => {
  const s = calculateStandings({ competitors: roster('a', 'b'), matches: [M('a', 'b', 21, 0)] })
  const r = qualifyGroup({ standings: s, winnerQualifiers: 2, consolationQualifiers: 2 })
  assert.equal(r.status, 'invalid')
  if (r.status !== 'invalid') return
  assert.equal(r.code, 'QUALIFICATION_OVERFLOW')
})

test('qualification: bad override permutation → invalid INVALID_OVERRIDE', () => {
  const r = qualifyGroup({
    standings: tieTop(), winnerQualifiers: 1, consolationQualifiers: 2,
    resolvedOrder: ['a', 'b', 'c'], // missing d
  })
  assert.equal(r.status, 'invalid')
  if (r.status !== 'invalid') return
  assert.equal(r.code, 'INVALID_OVERRIDE')
})
