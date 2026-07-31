// Run with: node --test lib/tournaments/domain/knockout-impact.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeKnockoutCorrection, type ImpactMatchRecord } from './knockout-impact.ts'

// A completed 4-competitor championship bracket (SF1, SF2, Final, Third-place), plus optionally a
// consolation bracket, expressed as persisted match records.
function championship4(): ImpactMatchRecord[] {
  return [
    {
      id: 'sf1', generationKey: 'ko:championship:r1:m1', bracket: 'championship',
      roundNumber: 1, matchNumber: 1, status: 'completed',
      competitorAId: 'c1', competitorBId: 'c4', winnerId: 'c1',
      sourceMatchAId: null, sourceMatchBId: null, sourceOutcomeA: null, sourceOutcomeB: null, gameCount: 2,
    },
    {
      id: 'sf2', generationKey: 'ko:championship:r1:m2', bracket: 'championship',
      roundNumber: 1, matchNumber: 2, status: 'completed',
      competitorAId: 'c2', competitorBId: 'c3', winnerId: 'c2',
      sourceMatchAId: null, sourceMatchBId: null, sourceOutcomeA: null, sourceOutcomeB: null, gameCount: 2,
    },
    {
      id: 'final', generationKey: 'ko:championship:r2:m1', bracket: 'championship',
      roundNumber: 2, matchNumber: 1, status: 'completed',
      competitorAId: 'c1', competitorBId: 'c2', winnerId: 'c1',
      sourceMatchAId: 'sf1', sourceMatchBId: 'sf2', sourceOutcomeA: 'winner', sourceOutcomeB: 'winner', gameCount: 2,
    },
    {
      id: 'third', generationKey: 'ko:championship:third', bracket: 'championship',
      roundNumber: 2, matchNumber: 2, status: 'completed',
      competitorAId: 'c4', competitorBId: 'c3', winnerId: 'c4',
      sourceMatchAId: 'sf1', sourceMatchBId: 'sf2', sourceOutcomeA: 'loser', sourceOutcomeB: 'loser', gameCount: 2,
    },
  ]
}

test('impact: correcting a semifinal affects final (winner-fed) and third-place (loser-fed) only', () => {
  const res = analyzeKnockoutCorrection({ matches: championship4(), upstreamMatchId: 'sf1', newWinnerId: 'c4' })
  assert.ok(res.ok)
  const im = res.impact
  assert.equal(im.winnerChanges, true)
  assert.equal(im.currentWinnerId, 'c1')
  assert.equal(im.newWinnerId, 'c4')
  assert.equal(im.newLoserId, 'c1')
  const ids = im.affected.map((a) => a.matchId).sort()
  assert.deepEqual(ids, ['final', 'third'])
  // sf2 (independent same-round match) is NOT affected.
  assert.ok(!im.affected.some((a) => a.matchId === 'sf2'))
  assert.equal(im.resultsToClear, 2)
  assert.equal(im.totalGamesToDelete, 4)
  assert.equal(im.podiumWillClear, true)
})

test('impact: only the corrected-path slot of each downstream match is cleared; the sibling slot is kept', () => {
  const res = analyzeKnockoutCorrection({ matches: championship4(), upstreamMatchId: 'sf1', newWinnerId: 'c4' })
  assert.ok(res.ok)
  const final = res.impact.affected.find((a) => a.matchId === 'final')!
  // final is fed by sf1 (slot A) and sf2 (slot B). Only slot A is cleared; c2 (slot B) is kept.
  assert.deepEqual([...final.clearSlots], [{ matchId: 'final', slot: 'A' }])
  assert.deepEqual([...final.participantsToReset], ['c1'])
})

test('impact: reprogress re-feeds only the immediate consumers of the corrected match with the NEW result', () => {
  const res = analyzeKnockoutCorrection({ matches: championship4(), upstreamMatchId: 'sf1', newWinnerId: 'c4' })
  assert.ok(res.ok)
  const rp = [...res.impact.reprogress].sort((a, b) => a.matchId.localeCompare(b.matchId))
  assert.deepEqual(rp, [
    { matchId: 'final', slot: 'A', competitorId: 'c4' }, // new winner → final
    { matchId: 'third', slot: 'A', competitorId: 'c1' }, // new loser → third place
  ])
})

test('impact: correcting the FINAL (terminal match) affects nothing downstream', () => {
  const res = analyzeKnockoutCorrection({ matches: championship4(), upstreamMatchId: 'final', newWinnerId: 'c2' })
  assert.ok(res.ok)
  assert.equal(res.impact.affected.length, 0)
  assert.equal(res.impact.reprogress.length, 0)
  assert.equal(res.impact.podiumWillClear, false)
  assert.equal(res.impact.winnerChanges, true)
})

test('impact: winnerChanges=false when the corrected winner is unchanged', () => {
  const res = analyzeKnockoutCorrection({ matches: championship4(), upstreamMatchId: 'sf1', newWinnerId: 'c1' })
  assert.ok(res.ok)
  assert.equal(res.impact.winnerChanges, false)
})

test('impact: group_knockout — correcting championship never touches the consolation branch', () => {
  const matches: ImpactMatchRecord[] = [
    ...championship4(),
    {
      id: 'con-f', generationKey: 'ko:consolation:r1:m1', bracket: 'consolation',
      roundNumber: 1, matchNumber: 1, status: 'completed',
      competitorAId: 'd1', competitorBId: 'd2', winnerId: 'd1',
      sourceMatchAId: null, sourceMatchBId: null, sourceOutcomeA: null, sourceOutcomeB: null, gameCount: 2,
    },
  ]
  const res = analyzeKnockoutCorrection({ matches, upstreamMatchId: 'sf1', newWinnerId: 'c4' })
  assert.ok(res.ok)
  assert.ok(!res.impact.affected.some((a) => a.bracket === 'consolation'))
  assert.deepEqual([...res.impact.branchesAffected], ['championship'])
  assert.deepEqual([...res.impact.branchesUnaffected], ['consolation'])
})

test('impact: deeper dependency path — grandparent correction resets both child and grandchild', () => {
  // r1: qf1 (c1 vs c8). r2: sf1 fed by qf1.winner + qf2.winner. r3: final fed by sf1.winner + sf2.winner.
  const matches: ImpactMatchRecord[] = [
    { id: 'qf1', generationKey: 'k:r1:m1', bracket: 'championship', roundNumber: 1, matchNumber: 1, status: 'completed', competitorAId: 'c1', competitorBId: 'c8', winnerId: 'c1', sourceMatchAId: null, sourceMatchBId: null, sourceOutcomeA: null, sourceOutcomeB: null, gameCount: 2 },
    { id: 'qf2', generationKey: 'k:r1:m2', bracket: 'championship', roundNumber: 1, matchNumber: 2, status: 'completed', competitorAId: 'c4', competitorBId: 'c5', winnerId: 'c4', sourceMatchAId: null, sourceMatchBId: null, sourceOutcomeA: null, sourceOutcomeB: null, gameCount: 2 },
    { id: 'sf1', generationKey: 'k:r2:m1', bracket: 'championship', roundNumber: 2, matchNumber: 1, status: 'completed', competitorAId: 'c1', competitorBId: 'c4', winnerId: 'c1', sourceMatchAId: 'qf1', sourceMatchBId: 'qf2', sourceOutcomeA: 'winner', sourceOutcomeB: 'winner', gameCount: 2 },
    { id: 'final', generationKey: 'k:r3:m1', bracket: 'championship', roundNumber: 3, matchNumber: 1, status: 'completed', competitorAId: 'c1', competitorBId: 'c2', winnerId: 'c1', sourceMatchAId: 'sf1', sourceMatchBId: null, sourceOutcomeA: 'winner', sourceOutcomeB: null, gameCount: 2 },
  ]
  const res = analyzeKnockoutCorrection({ matches, upstreamMatchId: 'qf1', newWinnerId: 'c8' })
  assert.ok(res.ok)
  const ids = res.impact.affected.map((a) => a.matchId).sort()
  assert.deepEqual(ids, ['final', 'sf1'])
  // qf2 (independent) untouched.
  assert.ok(!res.impact.affected.some((a) => a.matchId === 'qf2'))
  // Immediate reprogress only re-feeds sf1 (qf1's direct consumer), not the final.
  assert.deepEqual(res.impact.reprogress, [{ matchId: 'sf1', slot: 'A', competitorId: 'c8' }])
})

test('impact: errors — unknown match, not completed, not a pairing, winner not in match', () => {
  const base = championship4()
  assert.equal((analyzeKnockoutCorrection({ matches: base, upstreamMatchId: 'nope', newWinnerId: 'c1' }) as { ok: false; error: { code: string } }).error.code, 'unknown_match')

  const ready = base.map((m) => (m.id === 'sf1' ? { ...m, status: 'ready', winnerId: null } : m))
  assert.equal((analyzeKnockoutCorrection({ matches: ready, upstreamMatchId: 'sf1', newWinnerId: 'c1' }) as { ok: false; error: { code: string } }).error.code, 'not_completed')

  const bye = base.map((m) => (m.id === 'sf1' ? { ...m, competitorBId: null } : m))
  assert.equal((analyzeKnockoutCorrection({ matches: bye, upstreamMatchId: 'sf1', newWinnerId: 'c1' }) as { ok: false; error: { code: string } }).error.code, 'not_a_pairing')

  assert.equal((analyzeKnockoutCorrection({ matches: base, upstreamMatchId: 'sf1', newWinnerId: 'zzz' }) as { ok: false; error: { code: string } }).error.code, 'winner_not_in_match')
})

test('impact: does not mutate its input', () => {
  const matches = championship4()
  const snapshot = JSON.stringify(matches)
  analyzeKnockoutCorrection({ matches, upstreamMatchId: 'sf1', newWinnerId: 'c4' })
  assert.equal(JSON.stringify(matches), snapshot)
})
