import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  compareScheduleMatches,
  knockoutStageRank,
  orderedSchedule,
  phaseRank,
} from './scheduleOrder.ts'
import type { PublicScheduleMatch } from './types.ts'

function m(over: Partial<PublicScheduleMatch>): PublicScheduleMatch {
  return {
    id: over.id ?? 'id',
    stage: over.stage ?? 'group',
    bracket: over.bracket ?? null,
    groupId: over.groupId ?? null,
    groupName: over.groupName ?? null,
    roundNumber: over.roundNumber ?? 1,
    matchNumber: over.matchNumber ?? 1,
    roundLabel: over.roundLabel ?? null,
    competitorAId: over.competitorAId ?? null,
    competitorBId: over.competitorBId ?? null,
    status: over.status ?? 'pending',
    winnerId: over.winnerId ?? null,
    games: over.games ?? [],
    gamesWonA: over.gamesWonA ?? 0,
    gamesWonB: over.gamesWonB ?? 0,
    isBye: over.isBye ?? false,
  }
}

// The canonical order of a schedule = the list of section keys the UI would render, in order.
function orderKeys(list: PublicScheduleMatch[]): string[] {
  return orderedSchedule(list).map((x) => {
    if (x.stage === 'group') return `G:${x.groupName}:r${x.roundNumber}:m${x.matchNumber}`
    const serie = x.bracket === 'consolation' ? 'B' : 'A'
    return `K:${serie}:${x.roundLabel}:m${x.matchNumber}`
  })
}

test('groups render A before B before C before D regardless of input order', () => {
  const input = [
    m({ id: 'd', groupName: 'D', matchNumber: 4 }),
    m({ id: 'b', groupName: 'B', matchNumber: 2 }),
    m({ id: 'a', groupName: 'A', matchNumber: 1 }),
    m({ id: 'c', groupName: 'C', matchNumber: 3 }),
  ]
  assert.deepEqual(
    orderedSchedule(input).map((x) => x.groupName),
    ['A', 'B', 'C', 'D'],
  )
})

test('rounds within a group ascend (1 → 2 → 3)', () => {
  const input = [
    m({ id: 'r3', groupName: 'A', roundNumber: 3 }),
    m({ id: 'r1', groupName: 'A', roundNumber: 1 }),
    m({ id: 'r2', groupName: 'A', roundNumber: 2 }),
  ]
  assert.deepEqual(
    orderedSchedule(input).map((x) => x.roundNumber),
    [1, 2, 3],
  )
})

test('group stage always precedes knockout', () => {
  const input = [
    m({ id: 'ko', stage: 'knockout', bracket: 'championship', roundLabel: 'final' }),
    m({ id: 'grp', stage: 'group', groupName: 'A' }),
  ]
  assert.deepEqual(
    orderedSchedule(input).map((x) => x.stage),
    ['group', 'knockout'],
  )
})

test('Serie A knockout renders completely before Serie B — no interleaving', () => {
  const input = [
    m({ id: 'b-qf', stage: 'knockout', bracket: 'consolation', roundLabel: 'quarterfinal' }),
    m({ id: 'a-sf', stage: 'knockout', bracket: 'championship', roundLabel: 'semifinal' }),
    m({ id: 'b-sf', stage: 'knockout', bracket: 'consolation', roundLabel: 'semifinal' }),
    m({ id: 'a-qf', stage: 'knockout', bracket: 'championship', roundLabel: 'quarterfinal' }),
  ]
  assert.deepEqual(orderKeys(input), [
    'K:A:quarterfinal:m1',
    'K:A:semifinal:m1',
    'K:B:quarterfinal:m1',
    'K:B:semifinal:m1',
  ])
})

test('knockout stages ascend: R16 → QF → SF → 3rd place → Final', () => {
  const input = [
    m({ id: 'final', stage: 'knockout', bracket: 'championship', roundLabel: 'final' }),
    m({ id: 'third', stage: 'knockout', bracket: 'championship', roundLabel: 'third_place' }),
    m({ id: 'sf', stage: 'knockout', bracket: 'championship', roundLabel: 'semifinal' }),
    m({ id: 'qf', stage: 'knockout', bracket: 'championship', roundLabel: 'quarterfinal' }),
    m({ id: 'r16', stage: 'knockout', bracket: 'championship', roundLabel: 'round_of_16' }),
  ]
  assert.deepEqual(
    orderedSchedule(input).map((x) => x.roundLabel),
    ['round_of_16', 'quarterfinal', 'semifinal', 'third_place', 'final'],
  )
})

test('semifinal precedes third-place precedes final', () => {
  assert.ok(knockoutStageRank('semifinal', 2) < knockoutStageRank('third_place', 3))
  assert.ok(knockoutStageRank('third_place', 3) < knockoutStageRank('final', 3))
})

test('third-place is omitted cleanly when not configured (order still valid)', () => {
  const input = [
    m({ id: 'final', stage: 'knockout', bracket: 'championship', roundLabel: 'final' }),
    m({ id: 'sf', stage: 'knockout', bracket: 'championship', roundLabel: 'semifinal' }),
  ]
  assert.deepEqual(
    orderedSchedule(input).map((x) => x.roundLabel),
    ['semifinal', 'final'],
  )
})

test('generic large-bracket rounds (round_of_32) sort before the named late stages', () => {
  const input = [
    m({ id: 'qf', stage: 'knockout', bracket: 'championship', roundLabel: 'quarterfinal', roundNumber: 3 }),
    m({ id: 'r16', stage: 'knockout', bracket: 'championship', roundLabel: 'round_of_16', roundNumber: 2 }),
    m({ id: 'r32', stage: 'knockout', bracket: 'championship', roundLabel: 'round_1', roundNumber: 1 }),
  ]
  assert.deepEqual(
    orderedSchedule(input).map((x) => x.roundLabel),
    ['round_1', 'round_of_16', 'quarterfinal'],
  )
})

test('order is independent of query order (reverse input yields same order)', () => {
  const forward = [
    m({ id: 'a', groupName: 'A', roundNumber: 1 }),
    m({ id: 'b', groupName: 'B', roundNumber: 1 }),
    m({ id: 'ko-a', stage: 'knockout', bracket: 'championship', roundLabel: 'final' }),
    m({ id: 'ko-b', stage: 'knockout', bracket: 'consolation', roundLabel: 'final' }),
  ]
  const reversed = [...forward].reverse()
  assert.deepEqual(orderKeys(forward), orderKeys(reversed))
})

test('order is independent of id / created ordering (id tiebreak is stable, not primary)', () => {
  const input = [
    m({ id: 'zzz', groupName: 'A', roundNumber: 1, matchNumber: 1 }),
    m({ id: 'aaa', groupName: 'B', roundNumber: 1, matchNumber: 1 }),
  ]
  // Group A wins despite its larger id; the id never overrides the group name.
  assert.deepEqual(
    orderedSchedule(input).map((x) => x.groupName),
    ['A', 'B'],
  )
})

test('unknown knockout stage is placed at the end of its section, never crashing', () => {
  const input = [
    m({ id: 'weird', stage: 'knockout', bracket: 'championship', roundLabel: 'super_special', roundNumber: 9 }),
    m({ id: 'final', stage: 'knockout', bracket: 'championship', roundLabel: 'final', roundNumber: 3 }),
    m({ id: 'sf', stage: 'knockout', bracket: 'championship', roundLabel: 'semifinal', roundNumber: 2 }),
  ]
  assert.deepEqual(
    orderedSchedule(input).map((x) => x.roundLabel),
    ['semifinal', 'final', 'super_special'],
  )
  assert.equal(knockoutStageRank('super_special', 9), Number.MAX_SAFE_INTEGER)
})

test('phaseRank: group=0, Serie A=1, Serie B=2 (null bracket → Serie A)', () => {
  assert.equal(phaseRank(m({ stage: 'group' })), 0)
  assert.equal(phaseRank(m({ stage: 'knockout', bracket: 'championship' })), 1)
  assert.equal(phaseRank(m({ stage: 'knockout', bracket: null })), 1)
  assert.equal(phaseRank(m({ stage: 'knockout', bracket: 'consolation' })), 2)
})

test('full canonical order: groups A→D, then Serie A stages, then Serie B stages', () => {
  const input = [
    m({ id: 'b-final', stage: 'knockout', bracket: 'consolation', roundLabel: 'final' }),
    m({ id: 'a-final', stage: 'knockout', bracket: 'championship', roundLabel: 'final' }),
    m({ id: 'a-sf', stage: 'knockout', bracket: 'championship', roundLabel: 'semifinal' }),
    m({ id: 'gD', stage: 'group', groupName: 'D', roundNumber: 1 }),
    m({ id: 'gA', stage: 'group', groupName: 'A', roundNumber: 1 }),
  ]
  assert.deepEqual(orderKeys(input), [
    'G:A:r1:m1',
    'G:D:r1:m1',
    'K:A:semifinal:m1',
    'K:A:final:m1',
    'K:B:final:m1',
  ])
})

test('compareScheduleMatches is a stable total order (sorting twice is idempotent)', () => {
  const input = [
    m({ id: 'c', groupName: 'C', roundNumber: 2, matchNumber: 1 }),
    m({ id: 'a2', groupName: 'A', roundNumber: 2, matchNumber: 1 }),
    m({ id: 'a1', groupName: 'A', roundNumber: 1, matchNumber: 2 }),
    m({ id: 'a1b', groupName: 'A', roundNumber: 1, matchNumber: 1 }),
  ]
  const once = orderedSchedule(input)
  const twice = [...once].sort(compareScheduleMatches)
  assert.deepEqual(
    once.map((x) => x.id),
    twice.map((x) => x.id),
  )
  assert.deepEqual(
    once.map((x) => x.id),
    ['a1b', 'a1', 'a2', 'c'],
  )
})
