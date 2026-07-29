// Run with: node --test lib/tournaments/domain/ties.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyTies, hasBlockingTie } from './ties.ts'
import { calculateStandings } from './standings.ts'
import type { Competitor, MatchInput } from './types.ts'

const roster = (...ids: string[]): Competitor[] => ids.map((id) => ({ id, name: id }))
const M = (a: string, b: string, sa: number, sb: number, status: MatchInput['status'] = 'completed'): MatchInput =>
  ({ competitorAId: a, competitorBId: b, status, games: [{ gameNumber: 1, scoreA: sa, scoreB: sb }] })

// Standings: a (pos1) > {b,c tied pos2-3} > d (pos4).
function tieAt23() {
  return calculateStandings({
    competitors: roster('a', 'b', 'c', 'd'),
    matches: [
      M('a', 'b', 21, 0), M('a', 'c', 21, 0), M('a', 'd', 21, 0),
      M('b', 'd', 21, 0), M('c', 'd', 21, 0),
      // b vs c not played → b & c identical → tie at positions 2-3
    ],
  })
}

// Standings: {a,b tied pos1-2} > c (pos3) > d (pos4).
function tieAt12() {
  return calculateStandings({
    competitors: roster('a', 'b', 'c', 'd'),
    matches: [M('a', 'c', 21, 0), M('a', 'd', 21, 0), M('b', 'c', 21, 0), M('b', 'd', 21, 0), M('c', 'd', 21, 0)],
  })
}

test('ties: tie at championship cut → championship_boundary', () => {
  const ties = classifyTies({ standings: tieAt12(), mode: 'group_knockout', winnerQualifiers: 1, consolationQualifiers: 2 })
  assert.equal(ties.length, 1)
  assert.equal(ties[0].impact, 'championship_boundary')
  assert.ok(hasBlockingTie(ties))
})

test('ties: tie at consolation cut → consolation_boundary', () => {
  // champ=1 (cut@1), conso=1 (cut@2). Tie b,c at positions 2-3 straddles cut 2.
  const ties = classifyTies({ standings: tieAt23(), mode: 'group_knockout', winnerQualifiers: 1, consolationQualifiers: 1 })
  assert.equal(ties[0].impact, 'consolation_boundary')
})

test('ties: tie entirely inside a band → none (not blocking)', () => {
  // champ cut @3; tie b,c at positions 2-3 does NOT straddle 3.
  const ties = classifyTies({ standings: tieAt23(), mode: 'group_knockout', winnerQualifiers: 3, consolationQualifiers: 0 })
  assert.equal(ties[0].impact, 'none')
  assert.ok(!hasBlockingTie(ties))
})

test('ties: round_robin tie in top-3 → podium', () => {
  const ties = classifyTies({ standings: tieAt23(), mode: 'round_robin' })
  assert.equal(ties[0].impact, 'podium')
})

test('ties: round_robin tie outside podium → none', () => {
  // Tie b,c at positions 2-3 with podiumSize=1 → outside podium zone.
  const ties = classifyTies({ standings: tieAt23(), mode: 'round_robin', podiumSize: 1 })
  assert.equal(ties[0].impact, 'none')
})

test('ties: no tie groups → empty classification', () => {
  const s = calculateStandings({ competitors: roster('a', 'b'), matches: [M('a', 'b', 21, 0)] })
  assert.deepEqual(classifyTies({ standings: s, mode: 'round_robin' }), [])
})
