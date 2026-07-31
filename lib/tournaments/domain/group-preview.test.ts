import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRoundRobinPreview, buildRoundRobinMatches } from './group-preview.ts'
import { generateRoundRobin } from './round-robin.ts'
import type { Competitor } from './types.ts'

const comp = (id: string): Competitor => ({ id, name: id })
const c = (ids: string[]) => ids.map(comp)

test('preview match counts follow n(n-1)/2 per group', () => {
  const preview = buildRoundRobinPreview({
    groups: [
      { groupId: 'gA', competitors: c(['a', 'b', 'c', 'd']) }, // 4 → 6
      { groupId: 'gB', competitors: c(['e', 'f', 'g']) }, // 3 → 3
    ],
  })
  assert.equal(preview.totalGroups, 2)
  assert.equal(preview.groups[0].matchCount, 6)
  assert.equal(preview.groups[1].matchCount, 3)
  assert.equal(preview.totalMatches, 9)
})

test('preview groups matches into rounds; a 4-player group has 3 rounds of 2', () => {
  const preview = buildRoundRobinPreview({
    groups: [{ groupId: 'gA', competitors: c(['a', 'b', 'c', 'd']) }],
  })
  const rounds = preview.groups[0].rounds
  assert.equal(rounds.length, 3)
  for (const r of rounds) assert.equal(r.matches.length, 2)
  // Round numbers are ascending and contiguous.
  assert.deepEqual(rounds.map((r) => r.roundNumber), [1, 2, 3])
})

test('an odd group (5) has one sit-out per round → 2 matches per round, 10 total', () => {
  const preview = buildRoundRobinPreview({
    groups: [{ groupId: 'gA', competitors: c(['a', 'b', 'c', 'd', 'e']) }],
  })
  assert.equal(preview.groups[0].matchCount, 10)
  assert.equal(preview.groups[0].rounds.length, 5)
  for (const r of preview.groups[0].rounds) assert.equal(r.matches.length, 2)
})

test('buildRoundRobinMatches equals generateRoundRobin per group, concatenated (no rewrite)', () => {
  const groups = [
    { groupId: 'gA', competitors: c(['a', 'b', 'c']) },
    { groupId: 'gB', competitors: c(['d', 'e', 'f', 'g']) },
  ]
  const expected = [
    ...generateRoundRobin({ groupId: 'gA', competitors: c(['a', 'b', 'c']) }),
    ...generateRoundRobin({ groupId: 'gB', competitors: c(['d', 'e', 'f', 'g']) }),
  ]
  assert.deepEqual(buildRoundRobinMatches(groups), expected)
})

test('preview is deterministic (same input → identical output)', () => {
  const input = { groups: [{ groupId: 'gA', competitors: c(['a', 'b', 'c', 'd']) }] }
  assert.deepEqual(buildRoundRobinPreview(input), buildRoundRobinPreview(input))
})

test('every generated match has a stable pair-derived generationKey (idempotent backstop)', () => {
  const matches = buildRoundRobinMatches([{ groupId: 'gA', competitors: c(['a', 'b', 'c']) }])
  const keys = matches.map((m) => m.generationKey)
  assert.equal(new Set(keys).size, keys.length) // unique
  // Regenerating yields identical keys → ON CONFLICT DO NOTHING cannot duplicate.
  const again = buildRoundRobinMatches([{ groupId: 'gA', competitors: c(['a', 'b', 'c']) }])
  assert.deepEqual(again.map((m) => m.generationKey), keys)
})
