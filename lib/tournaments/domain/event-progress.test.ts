import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateGroupStage } from './event-progress.ts'
import type { Competitor, MatchInput } from './types.ts'

const c = (id: string): Competitor => ({ id, name: id })
const win = (a: string, b: string): MatchInput => ({
  competitorAId: a,
  competitorBId: b,
  status: 'completed',
  games: [{ gameNumber: 1, scoreA: 21, scoreB: 19 }],
})

test('an unfinished group keeps the event in group_stage', () => {
  const e = evaluateGroupStage({
    format: 'group_knockout',
    winnerQualifiers: 1,
    consolationQualifiers: 0,
    groups: [
      {
        groupId: 'g1',
        competitors: [c('c1'), c('c2')],
        matches: [{ competitorAId: 'c1', competitorBId: 'c2', status: 'ready', games: [] }],
      },
    ],
  })
  assert.equal(e.allCompleted, false)
  assert.equal(e.status, 'group_stage')
})

test('round_robin fully finished → completed (no knockout gate)', () => {
  const e = evaluateGroupStage({
    format: 'round_robin',
    winnerQualifiers: 0,
    consolationQualifiers: 0,
    groups: [{ groupId: 'g1', competitors: [c('c1'), c('c2')], matches: [win('c1', 'c2')] }],
  })
  assert.equal(e.status, 'completed')
  assert.equal(e.hasBlockingTie, false)
})

test('group_knockout finished with a clear order → knockout_ready', () => {
  const e = evaluateGroupStage({
    format: 'group_knockout',
    winnerQualifiers: 1,
    consolationQualifiers: 0,
    groups: [{ groupId: 'g1', competitors: [c('c1'), c('c2')], matches: [win('c1', 'c2')] }],
  })
  assert.equal(e.allCompleted, true)
  assert.equal(e.hasBlockingTie, false)
  assert.equal(e.status, 'knockout_ready')
  assert.equal(e.groups[0].qualification.status, 'ok')
})

// A 3-way cycle with equal margins → a full 3-way tie that straddles the winner cut.
const cycle: MatchInput[] = [win('c1', 'c2'), win('c2', 'c3'), win('c3', 'c1')]

test('a critical (boundary) tie blocks knockout_ready → group_stage_completed', () => {
  const e = evaluateGroupStage({
    format: 'group_knockout',
    winnerQualifiers: 1,
    consolationQualifiers: 0,
    groups: [{ groupId: 'g1', competitors: [c('c1'), c('c2'), c('c3')], matches: cycle }],
  })
  assert.equal(e.allCompleted, true)
  assert.equal(e.hasBlockingTie, true)
  assert.equal(e.status, 'group_stage_completed')
  assert.equal(e.groups[0].qualification.status, 'blocked_by_tie')
})

test('an override resolving the tie unblocks knockout_ready', () => {
  const e = evaluateGroupStage({
    format: 'group_knockout',
    winnerQualifiers: 1,
    consolationQualifiers: 0,
    groups: [
      {
        groupId: 'g1',
        competitors: [c('c1'), c('c2'), c('c3')],
        matches: cycle,
        resolvedOrder: ['c1', 'c2', 'c3'],
      },
    ],
  })
  assert.equal(e.hasBlockingTie, false)
  assert.equal(e.status, 'knockout_ready')
  assert.equal(e.groups[0].qualification.status, 'ok')
  assert.deepEqual(e.groups[0].qualification.status === 'ok' ? e.groups[0].qualification.championship : [], ['c1'])
})

test('with multiple groups, ALL must be finished for the stage to complete', () => {
  const e = evaluateGroupStage({
    format: 'group_knockout',
    winnerQualifiers: 1,
    consolationQualifiers: 0,
    groups: [
      { groupId: 'g1', competitors: [c('c1'), c('c2')], matches: [win('c1', 'c2')] },
      {
        groupId: 'g2',
        competitors: [c('c3'), c('c4')],
        matches: [{ competitorAId: 'c3', competitorBId: 'c4', status: 'ready', games: [] }],
      },
    ],
  })
  assert.equal(e.allCompleted, false)
  assert.equal(e.status, 'group_stage')
})
