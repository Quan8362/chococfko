import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupCompetitors } from './competitorGroups.ts'
import type { PublicCompetitor } from './types.ts'

const mk = (id: string, groupId: string | null, extra: Partial<PublicCompetitor> = {}): PublicCompetitor => ({
  id,
  name: `Name ${id}`,
  shortName: null,
  seed: null,
  groupId,
  groupName: null,
  ...extra,
})

// A → B → C → D, four people each, mirroring the real Athletes tab fixture.
const groups = [
  { id: 'gA', name: 'A' },
  { id: 'gB', name: 'B' },
  { id: 'gC', name: 'C' },
  { id: 'gD', name: 'D' },
]
const competitors: PublicCompetitor[] = [
  mk('d1', 'gA'), mk('d2', 'gA'), mk('d3', 'gA'), mk('d4', 'gA'),
  mk('d5', 'gB'), mk('d6', 'gB'), mk('d7', 'gB'), mk('d8', 'gB'),
  mk('d9', 'gC'), mk('d10', 'gC'), mk('d11', 'gC'), mk('d12', 'gC'),
  mk('d13', 'gD'), mk('d14', 'gD'), mk('d15', 'gD'), mk('d16', 'gD'),
]

test('groups render in the exact provided order A → B → C → D', () => {
  const { groups: out } = groupCompetitors(competitors, groups)
  assert.deepEqual(out.map((g) => g.name), ['A', 'B', 'C', 'D'])
})

test('each group reports the correct competitor count', () => {
  const { groups: out, totalGroups, totalCompetitors } = groupCompetitors(competitors, groups)
  assert.deepEqual(out.map((g) => g.members.length), [4, 4, 4, 4])
  assert.equal(totalGroups, 4)
  assert.equal(totalCompetitors, 16)
})

test('competitor order within a group is preserved, not resorted', () => {
  const { groups: out } = groupCompetitors(competitors, groups)
  assert.deepEqual(out[0].members.map((c) => c.id), ['d1', 'd2', 'd3', 'd4'])
  assert.deepEqual(out[1].members.map((c) => c.id), ['d5', 'd6', 'd7', 'd8'])
})

test('ungrouped competitors fall into their own bucket, not into a card', () => {
  const withLoose = [...competitors, mk('loose1', null), mk('loose2', null)]
  const { groups: out, ungrouped, totalCompetitors } = groupCompetitors(withLoose, groups)
  assert.deepEqual(ungrouped.map((c) => c.id), ['loose1', 'loose2'])
  assert.equal(out.reduce((n, g) => n + g.members.length, 0), 16)
  assert.equal(totalCompetitors, 18)
})

test('an empty event yields empty groups and zero totals', () => {
  const { groups: out, ungrouped, totalGroups, totalCompetitors } = groupCompetitors([], [])
  assert.deepEqual(out, [])
  assert.deepEqual(ungrouped, [])
  assert.equal(totalGroups, 0)
  assert.equal(totalCompetitors, 0)
})

test('a group with no members stays present (renders an empty-group state)', () => {
  const { groups: out } = groupCompetitors([mk('x', 'gA')], groups)
  assert.equal(out.length, 4)
  assert.equal(out[0].members.length, 1)
  assert.deepEqual(out.slice(1).map((g) => g.members.length), [0, 0, 0])
})

test('a competitor pointing at an unknown group is not invented into a card', () => {
  const { groups: out, ungrouped, totalCompetitors } = groupCompetitors([mk('ghost', 'gZ')], groups)
  assert.equal(out.reduce((n, g) => n + g.members.length, 0), 0)
  assert.deepEqual(ungrouped, [])
  assert.equal(totalCompetitors, 1)
})
