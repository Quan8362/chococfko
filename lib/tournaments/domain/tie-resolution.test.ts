import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveTieOrder } from './tie-resolution.ts'
import { calculateStandings } from './standings.ts'
import type { Competitor, MatchInput } from './types.ts'

const c = (id: string): Competitor => ({ id, name: id })

test('reorders a full tie group and returns the whole roster as resolvedOrder', () => {
  // Two competitors, no completed matches → both share rank 1 (a full tie).
  const standings = calculateStandings({ competitors: [c('c1'), c('c2')], matches: [] })
  assert.equal(standings.tieGroups.length, 1)

  const r = resolveTieOrder({ standings, orderedTieIds: ['c2', 'c1'] })
  assert.ok(r.ok)
  assert.deepEqual(r.resolvedOrder, ['c2', 'c1'])
})

test('keeps non-tied competitors in their standings position (only the tie group moves)', () => {
  // c1 beats c2 and c3; c2 and c3 never resolve → c2/c3 tie for 2nd, c1 is clear 1st.
  const matches: MatchInput[] = [
    { competitorAId: 'c1', competitorBId: 'c2', status: 'completed', games: [{ gameNumber: 1, scoreA: 21, scoreB: 10 }] },
    { competitorAId: 'c1', competitorBId: 'c3', status: 'completed', games: [{ gameNumber: 1, scoreA: 21, scoreB: 10 }] },
    { competitorAId: 'c2', competitorBId: 'c3', status: 'ready', games: [] },
  ]
  const standings = calculateStandings({ competitors: [c('c1'), c('c2'), c('c3')], matches })
  const tie = standings.tieGroups[0]
  assert.deepEqual([...tie.competitorIds].sort(), ['c2', 'c3'])

  const r = resolveTieOrder({ standings, orderedTieIds: ['c3', 'c2'] })
  assert.ok(r.ok)
  assert.deepEqual(r.resolvedOrder, ['c1', 'c3', 'c2']) // c1 untouched at the front
})

test('rejects an order that is not a permutation of a real tie group', () => {
  const standings = calculateStandings({ competitors: [c('c1'), c('c2')], matches: [] })
  // Includes an id that is not part of the tie group.
  const r = resolveTieOrder({ standings, orderedTieIds: ['c1', 'c9'] })
  assert.ok(!r.ok)
  assert.equal(r.code, 'NO_SUCH_TIE')
})

test('rejects a duplicate-laden order (not a clean permutation)', () => {
  const standings = calculateStandings({ competitors: [c('c1'), c('c2')], matches: [] })
  const r = resolveTieOrder({ standings, orderedTieIds: ['c1', 'c1'] })
  assert.ok(!r.ok)
  assert.equal(r.code, 'INVALID_PERMUTATION')
})

test('rejects a subset of a tie group (must be the exact members)', () => {
  // Three-way tie, but only two ids supplied.
  const cyc: MatchInput[] = [
    { competitorAId: 'c1', competitorBId: 'c2', status: 'completed', games: [{ gameNumber: 1, scoreA: 21, scoreB: 19 }] },
    { competitorAId: 'c2', competitorBId: 'c3', status: 'completed', games: [{ gameNumber: 1, scoreA: 21, scoreB: 19 }] },
    { competitorAId: 'c3', competitorBId: 'c1', status: 'completed', games: [{ gameNumber: 1, scoreA: 21, scoreB: 19 }] },
  ]
  const standings = calculateStandings({ competitors: [c('c1'), c('c2'), c('c3')], matches: cyc })
  const r = resolveTieOrder({ standings, orderedTieIds: ['c1', 'c2'] })
  assert.ok(!r.ok)
  assert.equal(r.code, 'NO_SUCH_TIE')
})
