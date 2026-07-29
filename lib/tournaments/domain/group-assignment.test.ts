import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateAssignmentPayload,
  evaluateReadiness,
  requiredGroupSize,
  groupLetters,
  type AssignmentPayload,
} from './group-assignment.ts'

const truth = {
  competitorIds: ['c1', 'c2', 'c3', 'c4'],
  groupIds: ['gA', 'gB'],
}

function payload(
  groups: { groupId: string; competitorIds: string[] }[],
  unassignedIds: string[] = [],
): AssignmentPayload {
  return { groups, unassignedIds }
}

// ── validateAssignmentPayload (permutation) ──────────────────────────────────────────────────

test('a valid permutation across groups + unassigned passes', () => {
  const res = validateAssignmentPayload(
    payload([
      { groupId: 'gA', competitorIds: ['c1', 'c2'] },
      { groupId: 'gB', competitorIds: ['c3'] },
    ], ['c4']),
    truth,
  )
  assert.equal(res.ok, true)
})

test('all groups empty with everyone unassigned is a valid permutation', () => {
  const res = validateAssignmentPayload(
    payload([
      { groupId: 'gA', competitorIds: [] },
      { groupId: 'gB', competitorIds: [] },
    ], ['c1', 'c2', 'c3', 'c4']),
    truth,
  )
  assert.equal(res.ok, true)
})

test('a competitor from another event (unknown id) is rejected', () => {
  const res = validateAssignmentPayload(
    payload([
      { groupId: 'gA', competitorIds: ['c1', 'cX'] },
      { groupId: 'gB', competitorIds: ['c2', 'c3'] },
    ], ['c4']),
    truth,
  )
  assert.equal(res.ok, false)
  if (!res.ok) assert.ok(res.errors.some((e) => e.code === 'unknown_competitor' && e.competitorId === 'cX'))
})

test('a competitor placed in two groups is a duplicate', () => {
  const res = validateAssignmentPayload(
    payload([
      { groupId: 'gA', competitorIds: ['c1', 'c2'] },
      { groupId: 'gB', competitorIds: ['c2', 'c3'] },
    ], ['c4']),
    truth,
  )
  assert.equal(res.ok, false)
  if (!res.ok) assert.ok(res.errors.some((e) => e.code === 'duplicate_competitor' && e.competitorId === 'c2'))
})

test('a competitor both assigned and unassigned is a duplicate', () => {
  const res = validateAssignmentPayload(
    payload([
      { groupId: 'gA', competitorIds: ['c1', 'c2'] },
      { groupId: 'gB', competitorIds: ['c3'] },
    ], ['c4', 'c1']),
    truth,
  )
  assert.equal(res.ok, false)
  if (!res.ok) assert.ok(res.errors.some((e) => e.code === 'duplicate_competitor' && e.competitorId === 'c1'))
})

test('a missing competitor (not present anywhere) is rejected', () => {
  const res = validateAssignmentPayload(
    payload([
      { groupId: 'gA', competitorIds: ['c1', 'c2'] },
      { groupId: 'gB', competitorIds: ['c3'] },
    ], []),
    truth,
  )
  assert.equal(res.ok, false)
  if (!res.ok) assert.ok(res.errors.some((e) => e.code === 'missing_competitor' && e.competitorId === 'c4'))
})

test('an unknown / foreign group id is rejected', () => {
  const res = validateAssignmentPayload(
    payload([
      { groupId: 'gA', competitorIds: ['c1', 'c2'] },
      { groupId: 'gZ', competitorIds: ['c3', 'c4'] },
    ], []),
    truth,
  )
  assert.equal(res.ok, false)
  if (!res.ok) {
    assert.ok(res.errors.some((e) => e.code === 'unknown_group' && e.groupId === 'gZ'))
    assert.ok(res.errors.some((e) => e.code === 'missing_group' && e.groupId === 'gB'))
  }
})

test('a group described twice is a duplicate group', () => {
  const res = validateAssignmentPayload(
    payload([
      { groupId: 'gA', competitorIds: ['c1'] },
      { groupId: 'gA', competitorIds: ['c2'] },
      { groupId: 'gB', competitorIds: ['c3', 'c4'] },
    ], []),
    truth,
  )
  assert.equal(res.ok, false)
  if (!res.ok) assert.ok(res.errors.some((e) => e.code === 'duplicate_group' && e.groupId === 'gA'))
})

test('validate does not mutate its input', () => {
  const p = payload([{ groupId: 'gA', competitorIds: ['c1'] }], ['c2'])
  const snapshot = JSON.stringify(p)
  validateAssignmentPayload(p, truth)
  assert.equal(JSON.stringify(p), snapshot)
})

// ── evaluateReadiness (pre-generate) ─────────────────────────────────────────────────────────

const rr = { format: 'round_robin' as const, winnerQualifiersPerGroup: 0, consolationQualifiersPerGroup: 0 }
const gk = (w: number, c: number) => ({ format: 'group_knockout' as const, winnerQualifiersPerGroup: w, consolationQualifiersPerGroup: c })

test('round_robin requires ≥2 per group', () => {
  assert.equal(requiredGroupSize(rr), 2)
  const ready = evaluateReadiness(
    payload([
      { groupId: 'gA', competitorIds: ['c1', 'c2'] },
      { groupId: 'gB', competitorIds: ['c3', 'c4'] },
    ]),
    rr,
  )
  assert.equal(ready.ok, true)
})

test('unassigned competitors block generation', () => {
  const ready = evaluateReadiness(
    payload([
      { groupId: 'gA', competitorIds: ['c1', 'c2'] },
      { groupId: 'gB', competitorIds: ['c3'] },
    ], ['c4']),
    rr,
  )
  assert.equal(ready.ok, false)
  const issue = ready.issues.find((i) => i.code === 'unassigned_remaining')
  assert.ok(issue && 'competitorIds' in issue && issue.competitorIds.includes('c4'))
})

test('an empty group blocks generation', () => {
  const ready = evaluateReadiness(
    payload([
      { groupId: 'gA', competitorIds: ['c1', 'c2', 'c3', 'c4'] },
      { groupId: 'gB', competitorIds: [] },
    ]),
    rr,
  )
  assert.equal(ready.ok, false)
  assert.ok(ready.issues.some((i) => i.code === 'empty_group' && i.groupId === 'gB'))
})

test('a single-competitor group blocks generation', () => {
  const ready = evaluateReadiness(
    payload([
      { groupId: 'gA', competitorIds: ['c1', 'c2', 'c3'] },
      { groupId: 'gB', competitorIds: ['c4'] },
    ]),
    rr,
  )
  assert.equal(ready.ok, false)
  assert.ok(ready.issues.some((i) => i.code === 'group_too_small' && i.groupId === 'gB'))
})

test('group_knockout requires winner+consolation qualifier capacity per group', () => {
  assert.equal(requiredGroupSize(gk(1, 1)), 2)
  assert.equal(requiredGroupSize(gk(2, 2)), 4)
  // 2+2 = 4 required; a group of 3 is ≥2 but cannot supply 4 qualifiers → insufficient capacity.
  const ready = evaluateReadiness(
    payload([
      { groupId: 'gA', competitorIds: ['c1', 'c2', 'c3', 'c4'] },
      { groupId: 'gB', competitorIds: ['c1b', 'c2b', 'c3b'] },
    ]),
    gk(2, 2),
  )
  assert.equal(ready.ok, false)
  const issue = ready.issues.find((i) => i.code === 'insufficient_qualifier_capacity')
  assert.ok(issue && issue.code === 'insufficient_qualifier_capacity' && issue.groupId === 'gB' && issue.required === 4)
})

test('group_knockout with enough capacity is ready', () => {
  const ready = evaluateReadiness(
    payload([
      { groupId: 'gA', competitorIds: ['c1', 'c2', 'c3', 'c4'] },
      { groupId: 'gB', competitorIds: ['c1b', 'c2b', 'c3b', 'c4b'] },
    ]),
    gk(2, 2),
  )
  assert.equal(ready.ok, true)
})

test('no groups at all is not ready', () => {
  const ready = evaluateReadiness(payload([], ['c1', 'c2']), rr)
  assert.equal(ready.ok, false)
  assert.ok(ready.issues.some((i) => i.code === 'no_groups'))
})

// ── groupLetters ─────────────────────────────────────────────────────────────────────────────

test('groupLetters generates A..Z then AA, AB (bijective base-26)', () => {
  assert.deepEqual(groupLetters(3), ['A', 'B', 'C'])
  assert.equal(groupLetters(26).at(-1), 'Z')
  assert.deepEqual(groupLetters(28).slice(25), ['Z', 'AA', 'AB'])
  assert.deepEqual(groupLetters(0), [])
})
