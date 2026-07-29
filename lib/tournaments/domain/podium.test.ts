// Run with: node --test lib/tournaments/domain/podium.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculatePodium } from './podium.ts'

test('podium: with third-place match → 1,2,3 (none joint)', () => {
  const r = calculatePodium({
    final: { winnerId: 'A', loserId: 'B' },
    thirdPlaceEnabled: true,
    thirdPlace: { winnerId: 'C' },
  })
  assert.equal(r.status, 'ready')
  if (r.status !== 'ready') return
  assert.deepEqual(r.entries.map((e) => [e.rank, e.competitorId, e.isJoint]), [
    [1, 'A', false], [2, 'B', false], [3, 'C', false],
  ])
})

test('podium: without third-place match → joint third for both semifinal losers', () => {
  const r = calculatePodium({
    final: { winnerId: 'A', loserId: 'B' },
    thirdPlaceEnabled: false,
    semifinalLosers: ['C', 'D'],
  })
  if (r.status !== 'ready') { assert.fail('expected ready'); return }
  const thirds = r.entries.filter((e) => e.rank === 3)
  assert.equal(thirds.length, 2)
  assert.ok(thirds.every((e) => e.isJoint))
  assert.deepEqual(thirds.map((e) => e.competitorId).sort(), ['C', 'D'])
})

test('podium: incomplete final → pending INCOMPLETE_FINAL', () => {
  const r = calculatePodium({ final: null, thirdPlaceEnabled: true })
  assert.equal(r.status, 'pending')
  if (r.status !== 'pending') return
  assert.equal(r.reason, 'INCOMPLETE_FINAL')
})

test('podium: third-place enabled but not played → pending INCOMPLETE_THIRD_PLACE', () => {
  const r = calculatePodium({ final: { winnerId: 'A', loserId: 'B' }, thirdPlaceEnabled: true, thirdPlace: null })
  assert.equal(r.status, 'pending')
  if (r.status !== 'pending') return
  assert.equal(r.reason, 'INCOMPLETE_THIRD_PLACE')
})

test('podium: size-2 style (no semifinals, no third place) → only 1 & 2', () => {
  const r = calculatePodium({ final: { winnerId: 'A', loserId: 'B' }, thirdPlaceEnabled: false })
  if (r.status !== 'ready') { assert.fail('expected ready'); return }
  assert.deepEqual(r.entries.map((e) => e.rank), [1, 2])
})

test('podium: championship & consolation computed independently (no mixing)', () => {
  const champ = calculatePodium({ final: { winnerId: 'A', loserId: 'B' }, thirdPlaceEnabled: false, semifinalLosers: ['C', 'D'] })
  const conso = calculatePodium({ final: { winnerId: 'E', loserId: 'F' }, thirdPlaceEnabled: false, semifinalLosers: ['G', 'H'] })
  if (champ.status !== 'ready' || conso.status !== 'ready') { assert.fail('expected ready'); return }
  const champIds = champ.entries.map((e) => e.competitorId)
  const consoIds = conso.entries.map((e) => e.competitorId)
  assert.equal(champIds.filter((id) => consoIds.includes(id)).length, 0)
})
