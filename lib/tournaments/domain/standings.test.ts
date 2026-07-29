// Run with: node --test lib/tournaments/domain/standings.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculateStandings } from './standings.ts'
import type { Competitor, MatchInput, MatchStatus } from './types.ts'

const roster = (...ids: string[]): Competitor[] => ids.map((id) => ({ id, name: id.toUpperCase() }))
const M = (a: string, b: string, sa: number, sb: number, status: MatchStatus = 'completed'): MatchInput =>
  ({ competitorAId: a, competitorBId: b, status, games: [{ gameNumber: 1, scoreA: sa, scoreB: sb }] })

const byId = (rows: readonly { competitorId: string }[], id: string) =>
  rows.find((r) => r.competitorId === id)!

test('standings: win=1/loss=0, order by points then diff then pf', () => {
  const s = calculateStandings({
    competitors: roster('a', 'b', 'c'),
    matches: [M('a', 'b', 21, 10), M('a', 'c', 21, 15), M('b', 'c', 21, 19)],
  })
  assert.deepEqual(s.rows.map((r) => r.competitorId), ['a', 'b', 'c'])
  const a = byId(s.rows, 'a')
  assert.equal(a.wins, 2); assert.equal(a.losses, 0); assert.equal(a.tablePoints, 2)
  assert.equal(a.pointsFor, 42); assert.equal(a.pointsAgainst, 25); assert.equal(a.pointDifference, 17)
  assert.equal(s.tieGroups.length, 0)
})

test('standings: only completed matches count (pending/bye/cancelled ignored)', () => {
  const s = calculateStandings({
    competitors: roster('x', 'y', 'z'),
    matches: [
      M('x', 'z', 21, 0), M('y', 'z', 21, 0),
      M('x', 'y', 21, 0, 'pending'),
      M('x', 'y', 21, 0, 'bye'),
      M('x', 'y', 21, 0, 'cancelled'),
    ],
  })
  assert.equal(byId(s.rows, 'x').played, 1)
  assert.equal(byId(s.rows, 'y').played, 1)
})

test('standings: full tie → shared rank, tied flag, tie group', () => {
  const s = calculateStandings({
    competitors: roster('x', 'y', 'z'),
    matches: [M('x', 'z', 21, 0), M('y', 'z', 21, 0)], // x & y identical (1pt, diff21, pf21)
  })
  assert.equal(byId(s.rows, 'x').rank, byId(s.rows, 'y').rank)
  assert.ok(byId(s.rows, 'x').tied && byId(s.rows, 'y').tied)
  assert.equal(byId(s.rows, 'z').tied, false)
  assert.equal(s.tieGroups.length, 1)
  assert.deepEqual([...s.tieGroups[0].competitorIds].sort(), ['x', 'y'])
  assert.equal(s.tieGroups[0].positionStart, 1)
  assert.equal(s.tieGroups[0].positionEnd, 2)
  assert.equal(byId(s.rows, 'z').rank, 3) // competition ranking 1,1,3
})

test('standings: pointDifference breaks equal points', () => {
  const s = calculateStandings({
    competitors: roster('p', 'q', 'r'),
    matches: [M('p', 'r', 21, 5), M('q', 'r', 21, 19)],
  })
  assert.deepEqual(s.rows.slice(0, 2).map((r) => r.competitorId), ['p', 'q'])
  assert.equal(s.tieGroups.length, 0)
})

test('standings: pointsFor breaks equal points & diff', () => {
  const s = calculateStandings({
    competitors: roster('s', 't', 'u'),
    matches: [M('s', 'u', 21, 11), M('t', 'u', 25, 15)], // both diff 10; t pf 25 > s pf 21
  })
  assert.deepEqual(s.rows.slice(0, 2).map((r) => r.competitorId), ['t', 's'])
})

test('standings: multi-game points aggregate across sets', () => {
  const s = calculateStandings({
    competitors: roster('a', 'b'),
    matches: [{
      competitorAId: 'a', competitorBId: 'b', status: 'completed',
      games: [
        { gameNumber: 1, scoreA: 21, scoreB: 15 },
        { gameNumber: 2, scoreA: 18, scoreB: 21 },
        { gameNumber: 3, scoreA: 21, scoreB: 17 },
      ],
    }],
  })
  assert.equal(byId(s.rows, 'a').pointsFor, 60)
  assert.equal(byId(s.rows, 'a').pointsAgainst, 53)
  assert.equal(byId(s.rows, 'a').wins, 1)
})

test('standings: competitor with no completed matches shows zeros', () => {
  const s = calculateStandings({ competitors: roster('a', 'b', 'c'), matches: [M('a', 'b', 21, 10)] })
  const c = byId(s.rows, 'c')
  assert.equal(c.played, 0); assert.equal(c.wins, 0); assert.equal(c.tablePoints, 0)
})

test('standings: deterministic + non-mutating', () => {
  const competitors = roster('a', 'b', 'c')
  const matches = [M('a', 'b', 21, 10), M('a', 'c', 21, 15), M('b', 'c', 21, 19)]
  const snap = JSON.stringify({ competitors, matches })
  const s1 = calculateStandings({ competitors, matches })
  const s2 = calculateStandings({ competitors, matches })
  assert.deepEqual(s1, s2)
  assert.equal(JSON.stringify({ competitors, matches }), snap)
})

test('standings: empty roster → empty', () => {
  const s = calculateStandings({ competitors: [], matches: [] })
  assert.equal(s.rows.length, 0)
  assert.equal(s.tieGroups.length, 0)
})
