// Run with: node --test lib/tournaments/domain/knockout-seed.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  requiredBracketSize,
  knockoutByeCount,
  validateSeedPayload,
  evaluateSeedReadiness,
  buildKnockoutPreview,
  buildKnockoutMatchRows,
  buildKnockoutBracketFromSeeds,
  reconstructBracketForProgression,
  deriveFirstRoundPairings,
  type DbKnockoutMatch,
  type SeedPayload,
} from './knockout-seed.ts'
import { progressKnockout } from './progression.ts'

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `c${i + 1}`)
const seeded = (n: number): SeedPayload => ({ seededIds: ids(n), unassignedIds: [] })

// ── bracket size / byes ──────────────────────────────────────────────────────────────────────
const SIZE_CASES: Array<[number, number, number]> = [
  [2, 2, 0], [3, 4, 1], [4, 4, 0], [5, 8, 3], [6, 8, 2], [8, 8, 0], [10, 16, 6], [16, 16, 0],
]
for (const [n, size, byes] of SIZE_CASES) {
  test(`bracket size/byes for ${n} → ${size}/${byes}`, () => {
    assert.equal(requiredBracketSize(n), size)
    assert.equal(knockoutByeCount(n), byes)
  })
}

// ── seed payload validation ───────────────────────────────────────────────────────────────────
test('valid permutation passes', () => {
  const res = validateSeedPayload({ seededIds: ['a', 'b'], unassignedIds: ['c'] }, { competitorIds: ['a', 'b', 'c'] })
  assert.equal(res.ok, true)
})

test('missing competitor is rejected', () => {
  const res = validateSeedPayload({ seededIds: ['a'], unassignedIds: [] }, { competitorIds: ['a', 'b'] })
  assert.equal(res.ok, false)
  assert.ok(!res.ok && res.errors.some((e) => e.code === 'missing_competitor' && e.competitorId === 'b'))
})

test('duplicate competitor is rejected', () => {
  const res = validateSeedPayload({ seededIds: ['a', 'a'], unassignedIds: [] }, { competitorIds: ['a'] })
  assert.equal(res.ok, false)
  assert.ok(!res.ok && res.errors.some((e) => e.code === 'duplicate_competitor'))
})

test('foreign competitor is rejected', () => {
  const res = validateSeedPayload({ seededIds: ['x'], unassignedIds: [] }, { competitorIds: ['a'] })
  assert.equal(res.ok, false)
  assert.ok(!res.ok && res.errors.some((e) => e.code === 'unknown_competitor'))
})

// ── readiness ────────────────────────────────────────────────────────────────────────────────
test('readiness blocks < 2 competitors', () => {
  const r = evaluateSeedReadiness({ seededIds: ['a'], unassignedIds: [] })
  assert.equal(r.ok, false)
  assert.ok(r.issues.some((i) => i.code === 'not_enough_competitors'))
})

test('readiness blocks when someone is unseeded', () => {
  const r = evaluateSeedReadiness({ seededIds: ['a', 'b'], unassignedIds: ['c'] })
  assert.equal(r.ok, false)
  assert.ok(r.issues.some((i) => i.code === 'unseeded_remaining'))
})

test('readiness ok for a full seed and reports size/byes', () => {
  const r = evaluateSeedReadiness(seeded(6))
  assert.equal(r.ok, true)
  assert.equal(r.bracketSize, 8)
  assert.equal(r.byes, 2)
})

// ── preview is deterministic ─────────────────────────────────────────────────────────────────
test('preview is deterministic and reports totals', () => {
  const p1 = buildKnockoutPreview(ids(6), true)
  const p2 = buildKnockoutPreview(ids(6), true)
  assert.deepEqual(p1, p2)
  assert.equal(p1.totalCompetitors, 6)
  assert.equal(p1.bracketSize, 8)
  assert.equal(p1.byes, 2)
  assert.ok(p1.thirdPlaceMatch !== null)
  assert.equal(p1.rounds[0].matches.length, 4)
})

test('preview has no third-place placeholder when disabled', () => {
  const p = buildKnockoutPreview(ids(4), false)
  assert.equal(p.thirdPlaceMatch, null)
})

// ── first-round pairing preview (shared engine, no second algorithm) ────────────────────────────
const slotId = (s: { kind: string; competitorId?: string }) => (s.kind === 'competitor' ? s.competitorId! : s.kind)

test('four seeds derive exactly two first-round matches', () => {
  const p = deriveFirstRoundPairings(ids(4), false)
  assert.equal(p.length, 2)
  assert.ok(p.every((m) => !m.isBye))
})

test('eight seeds derive exactly four first-round matches', () => {
  const p = deriveFirstRoundPairings(ids(8), false)
  assert.equal(p.length, 4)
})

test('first-round pairings match the full preview round[0] exactly (same mapping)', () => {
  const seeds = ids(6)
  const inline = deriveFirstRoundPairings(seeds, true)
  const full = buildKnockoutPreview(seeds, true).rounds[0].matches
  assert.equal(inline.length, full.length)
  inline.forEach((m, i) => {
    assert.equal(m.matchNumber, full[i].matchNumber)
    assert.equal(slotId(m.slotA), slotId(full[i].slotA))
    assert.equal(slotId(m.slotB), slotId(full[i].slotB))
    assert.equal(m.isBye, full[i].isBye)
  })
})

test('reordering seeds changes the derived pairings (live preview source of truth)', () => {
  const before = deriveFirstRoundPairings(['a', 'b', 'c', 'd'], false)
  const after = deriveFirstRoundPairings(['a', 'c', 'b', 'd'], false)
  assert.notEqual(JSON.stringify(before), JSON.stringify(after))
})

test('a bye seed shows an explicit bye opponent, never a fabricated competitor', () => {
  const p = deriveFirstRoundPairings(ids(3), false) // size 4 → one bye
  const byeMatch = p.find((m) => m.isBye)!
  assert.ok(byeMatch, 'a bye match exists')
  const kinds = [byeMatch.slotA.kind, byeMatch.slotB.kind].sort()
  assert.deepEqual(kinds, ['bye', 'competitor'])
})

test('fewer than two seeds derive no pairings and do not throw', () => {
  assert.deepEqual(deriveFirstRoundPairings([], false), [])
  assert.deepEqual(deriveFirstRoundPairings(['solo'], false), [])
})

test('first-round pairings only reference the given seeds (no cross contamination)', () => {
  const seeds = ['x1', 'x2', 'x3', 'x4']
  const ref = new Set(seeds)
  for (const m of deriveFirstRoundPairings(seeds, false)) {
    for (const s of [m.slotA, m.slotB]) {
      if (s.kind === 'competitor') assert.ok(ref.has(s.competitorId))
    }
  }
})

// ── materialization: BYE auto-advance ──────────────────────────────────────────────────────────
test('bye matches have one competitor, a winner, and no 0–0 score', () => {
  const rows = buildKnockoutMatchRows(buildKnockoutBracketFromSeeds(ids(5), false))
  const byes = rows.filter((r) => r.status === 'bye')
  assert.equal(byes.length, 3)
  for (const b of byes) {
    // exactly one competitor present; a winner is set; games are NOT part of the row (no 0–0).
    const present = [b.competitorAId, b.competitorBId].filter(Boolean).length
    assert.equal(present, 1)
    assert.ok(b.winnerId !== null)
  }
})

test('a round-2 match fed by two byes is immediately ready with both bye winners', () => {
  // 5 seeds in size 8: seeds 6,7,8 are byes → seed2 (bye) meets seed3 (bye) in round 2.
  const rows = buildKnockoutMatchRows(buildKnockoutBracketFromSeeds(ids(5), false))
  const r2 = rows.filter((r) => r.generationKey.includes(':r2:'))
  const readyR2 = r2.filter((r) => r.status === 'ready')
  assert.ok(readyR2.length >= 1, 'at least one round-2 match ready from two bye winners')
  for (const m of readyR2) {
    assert.ok(m.competitorAId && m.competitorBId)
  }
})

test('materialized rows carry source refs for later rounds', () => {
  const rows = buildKnockoutMatchRows(buildKnockoutBracketFromSeeds(ids(4), false))
  const final = rows.find((r) => r.roundLabel === 'final')!
  assert.ok(final.sourceAKey && final.sourceBKey)
  assert.equal(final.sourceAOutcome, 'winner')
  assert.equal(final.sourceBOutcome, 'winner')
})

test('third-place match sources the two semifinal losers', () => {
  const rows = buildKnockoutMatchRows(buildKnockoutBracketFromSeeds(ids(4), true))
  const third = rows.find((r) => r.roundLabel === 'third_place')!
  assert.equal(third.sourceAOutcome, 'loser')
  assert.equal(third.sourceBOutcome, 'loser')
})

test('a full 4-seed bracket starts with 2 ready first-round matches, no byes', () => {
  const rows = buildKnockoutMatchRows(buildKnockoutBracketFromSeeds(ids(4), false))
  const r1 = rows.filter((r) => r.generationKey.includes(':r1:'))
  assert.equal(r1.length, 2)
  assert.ok(r1.every((r) => r.status === 'ready'))
})

// ── reconstruction for progression round-trips ─────────────────────────────────────────────────
test('reconstructBracketForProgression lets progressKnockout route a semifinal', () => {
  const rows = buildKnockoutMatchRows(buildKnockoutBracketFromSeeds(ids(4), true))
  const db: DbKnockoutMatch[] = rows.map((r) => ({
    matchKey: r.generationKey,
    bracket: r.bracket,
    roundNumber: r.roundNumber,
    matchNumber: r.matchNumber,
    roundLabel: r.roundLabel,
    slotA: { from: r.sourceAKey ? r.sourceAOutcome! : r.competitorAId ? 'entrant' : 'bye', matchKey: r.sourceAKey },
    slotB: { from: r.sourceBKey ? r.sourceBOutcome! : r.competitorBId ? 'entrant' : 'bye', matchKey: r.sourceBKey },
    isThirdPlace: r.roundLabel === 'third_place',
  }))
  const bracket = reconstructBracketForProgression(db)
  // Completing the first semifinal routes its winner to the final and its loser to the third-place.
  const sf = rows.find((r) => r.roundLabel === 'semifinal')!
  const res = progressKnockout({ bracket, completedMatchKey: sf.generationKey, winnerId: 'c1', loserId: 'c4' })
  assert.ok(res.patches.some((p) => p.competitorId === 'c1')) // winner → final
  assert.ok(res.patches.some((p) => p.competitorId === 'c4')) // loser → third place
})
