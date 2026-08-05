import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  groupRankTokenId,
  parseGroupRankTokenId,
  buildGroupRankTokens,
  validateBranchSeedPayload,
  evaluateBranchSeedReadiness,
  resolveGroupRankToken,
  resolveBranchSeeds,
} from './group-knockout-seed.ts'
import type { QualificationOutcome } from './qualification.ts'

// ── Token id round-trip ─────────────────────────────────────────────────────────────────────────
test('token id encodes group + rank and round-trips', () => {
  const id = groupRankTokenId('g-A', 2)
  assert.equal(id, 'group:g-A:rank:2')
  assert.deepEqual(parseGroupRankTokenId(id), { groupId: 'g-A', rank: 2 })
})

test('token id parse rejects malformed / non-positive ranks', () => {
  assert.equal(parseGroupRankTokenId('nope'), null)
  assert.equal(parseGroupRankTokenId('group:g:rank:0'), null)
  assert.equal(parseGroupRankTokenId('group:g:rank:-1'), null)
})

test('token id parse keeps colons inside a group id', () => {
  assert.deepEqual(parseGroupRankTokenId('group:a:b:c:rank:1'), { groupId: 'a:b:c', rank: 1 })
})

// ── Token building for both branches ─────────────────────────────────────────────────────────────
test('championship=1 consolation=2 → rank 1 champ, ranks 2-3 conso per group', () => {
  const { championship, consolation } = buildGroupRankTokens({
    groups: [{ groupId: 'A', competitorCount: 4 }, { groupId: 'B', competitorCount: 4 }],
    winnerQualifiers: 1,
    consolationQualifiers: 2,
  })
  assert.deepEqual(championship.map((t) => `${t.groupId}#${t.rank}`), ['A#1', 'B#1'])
  assert.deepEqual(consolation.map((t) => `${t.groupId}#${t.rank}`), ['A#2', 'A#3', 'B#2', 'B#3'])
  assert.ok(championship.every((t) => t.branch === 'championship'))
  assert.ok(consolation.every((t) => t.branch === 'consolation'))
})

test('championship=2 consolation=2 → ranks 1-2 champ, ranks 3-4 conso per group', () => {
  const { championship, consolation } = buildGroupRankTokens({
    groups: [{ groupId: 'A', competitorCount: 4 }, { groupId: 'B', competitorCount: 4 }],
    winnerQualifiers: 2,
    consolationQualifiers: 2,
  })
  assert.deepEqual(championship.map((t) => t.rank), [1, 2, 1, 2])
  assert.deepEqual(consolation.map((t) => t.rank), [3, 4, 3, 4])
})

test('consolation=0 → no consolation tokens', () => {
  const { championship, consolation } = buildGroupRankTokens({
    groups: [{ groupId: 'A', competitorCount: 4 }, { groupId: 'B', competitorCount: 4 }],
    winnerQualifiers: 1,
    consolationQualifiers: 0,
  })
  assert.equal(championship.length, 2)
  assert.equal(consolation.length, 0)
})

test('no competitor rank appears in both branches (ranges are disjoint)', () => {
  const { championship, consolation } = buildGroupRankTokens({
    groups: [{ groupId: 'A', competitorCount: 4 }],
    winnerQualifiers: 2,
    consolationQualifiers: 2,
  })
  const champKeys = new Set(championship.map((t) => t.tokenId))
  assert.ok(consolation.every((t) => !champKeys.has(t.tokenId)))
})

test('uneven group A=2/B=2, n=3 → ranks 1-2 champ, rank 3 conso only (no phantom rank 4)', () => {
  const { championship, consolation } = buildGroupRankTokens({
    groups: [{ groupId: 'A', competitorCount: 3 }],
    winnerQualifiers: 2,
    consolationQualifiers: 2,
  })
  assert.deepEqual(championship.map((t) => t.rank), [1, 2])
  assert.deepEqual(consolation.map((t) => t.rank), [3])
})

test('uneven group A=2/B=2, n=2 → ranks 1-2 champ, no conso tokens', () => {
  const { championship, consolation } = buildGroupRankTokens({
    groups: [{ groupId: 'A', competitorCount: 2 }],
    winnerQualifiers: 2,
    consolationQualifiers: 2,
  })
  assert.deepEqual(championship.map((t) => t.rank), [1, 2])
  assert.equal(consolation.length, 0)
})

test('A=2/B=2 across A(4) B(3) C(3) D(4) → Serie A=8 tokens, Serie B=6 tokens', () => {
  const { championship, consolation } = buildGroupRankTokens({
    groups: [
      { groupId: 'A', competitorCount: 4 },
      { groupId: 'B', competitorCount: 3 },
      { groupId: 'C', competitorCount: 3 },
      { groupId: 'D', competitorCount: 4 },
    ],
    winnerQualifiers: 2,
    consolationQualifiers: 2,
  })
  assert.equal(championship.length, 8) // 2+2+2+2
  assert.equal(consolation.length, 6)  // 2+1+1+2
})

// ── Per-branch permutation validation ────────────────────────────────────────────────────────────
test('valid branch payload is a permutation of the branch tokens', () => {
  const valid = ['group:A:rank:1', 'group:B:rank:1']
  const res = validateBranchSeedPayload({ seededIds: valid, unassignedIds: [] }, valid)
  assert.equal(res.ok, true)
})

test('duplicate token in a branch is rejected', () => {
  const valid = ['group:A:rank:1', 'group:B:rank:1']
  const res = validateBranchSeedPayload(
    { seededIds: ['group:A:rank:1', 'group:A:rank:1'], unassignedIds: [] },
    valid,
  )
  assert.equal(res.ok, false)
})

test('foreign token (wrong branch / event) is rejected', () => {
  const valid = ['group:A:rank:1', 'group:B:rank:1']
  const res = validateBranchSeedPayload(
    { seededIds: ['group:A:rank:1', 'group:C:rank:9'], unassignedIds: [] },
    valid,
  )
  assert.equal(res.ok, false)
})

test('missing token (not all placed) is rejected', () => {
  const valid = ['group:A:rank:1', 'group:B:rank:1']
  const res = validateBranchSeedPayload({ seededIds: ['group:A:rank:1'], unassignedIds: [] }, valid)
  assert.equal(res.ok, false)
})

// ── Readiness ────────────────────────────────────────────────────────────────────────────────────
test('branch readiness needs ≥2 seeded and nothing unassigned', () => {
  assert.equal(evaluateBranchSeedReadiness({ seededIds: ['t1', 't2'], unassignedIds: [] }).ok, true)
  assert.equal(evaluateBranchSeedReadiness({ seededIds: ['t1'], unassignedIds: [] }).ok, false)
  assert.equal(evaluateBranchSeedReadiness({ seededIds: ['t1', 't2'], unassignedIds: ['t3'] }).ok, false)
})

// ── Token resolution against qualification ─────────────────────────────────────────────────────────
const okQual = (championship: string[], consolation: string[]): QualificationOutcome => ({
  status: 'ok',
  championship,
  consolation,
})

test('resolve championship rank picks the correct qualifier', () => {
  const q = new Map<string, QualificationOutcome>([['A', okQual(['cA1', 'cA2'], ['cA3', 'cA4'])]])
  assert.deepEqual(
    resolveGroupRankToken({ groupId: 'A', rank: 1 }, { winnerQualifiers: 2, qualificationByGroup: q }),
    { ok: true, competitorId: 'cA1' },
  )
  assert.deepEqual(
    resolveGroupRankToken({ groupId: 'A', rank: 2 }, { winnerQualifiers: 2, qualificationByGroup: q }),
    { ok: true, competitorId: 'cA2' },
  )
})

test('resolve consolation rank picks from the consolation list', () => {
  const q = new Map<string, QualificationOutcome>([['A', okQual(['cA1', 'cA2'], ['cA3', 'cA4'])]])
  assert.deepEqual(
    resolveGroupRankToken({ groupId: 'A', rank: 3 }, { winnerQualifiers: 2, qualificationByGroup: q }),
    { ok: true, competitorId: 'cA3' },
  )
  assert.deepEqual(
    resolveGroupRankToken({ groupId: 'A', rank: 4 }, { winnerQualifiers: 2, qualificationByGroup: q }),
    { ok: true, competitorId: 'cA4' },
  )
})

test('resolve fails when the group qualification is not settled (blocked by tie)', () => {
  const q = new Map<string, QualificationOutcome>([['A', { status: 'blocked_by_tie', ties: [] }]])
  const res = resolveGroupRankToken({ groupId: 'A', rank: 1 }, { winnerQualifiers: 1, qualificationByGroup: q })
  assert.deepEqual(res, { ok: false, reason: 'group_not_qualified' })
})

test('resolve fails for a missing group and an out-of-range rank', () => {
  const q = new Map<string, QualificationOutcome>([['A', okQual(['cA1'], [])]])
  assert.deepEqual(
    resolveGroupRankToken({ groupId: 'Z', rank: 1 }, { winnerQualifiers: 1, qualificationByGroup: q }),
    { ok: false, reason: 'group_not_found' },
  )
  assert.deepEqual(
    resolveGroupRankToken({ groupId: 'A', rank: 2 }, { winnerQualifiers: 1, qualificationByGroup: q }),
    { ok: false, reason: 'rank_out_of_range' },
  )
})

test('resolveBranchSeeds preserves seed order and resolves "Nhất A vs Nhì B" style mapping', () => {
  const q = new Map<string, QualificationOutcome>([
    ['A', okQual(['A1'], ['A2'])],
    ['B', okQual(['B1'], ['B2'])],
  ])
  const res = resolveBranchSeeds(
    [groupRankTokenId('A', 1), groupRankTokenId('B', 1)],
    { winnerQualifiers: 1, qualificationByGroup: q },
  )
  assert.equal(res.ok, true)
  assert.deepEqual(res.competitorIds, ['A1', 'B1'])
})

test('resolveBranchSeeds reports unresolved tokens and blocks (ok=false)', () => {
  const q = new Map<string, QualificationOutcome>([['A', { status: 'blocked_by_tie', ties: [] }]])
  const res = resolveBranchSeeds([groupRankTokenId('A', 1)], { winnerQualifiers: 1, qualificationByGroup: q })
  assert.equal(res.ok, false)
  assert.deepEqual(res.unresolved, ['group:A:rank:1'])
})

test('resolveBranchSeeds refuses the same competitor twice in one branch', () => {
  // Two tokens accidentally mapping to the same competitor id → second is unresolved (defensive).
  const q = new Map<string, QualificationOutcome>([['A', okQual(['X', 'X'], [])]])
  const res = resolveBranchSeeds(
    [groupRankTokenId('A', 1), groupRankTokenId('A', 2)],
    { winnerQualifiers: 2, qualificationByGroup: q },
  )
  assert.equal(res.ok, false)
  assert.deepEqual(res.competitorIds, ['X'])
  assert.deepEqual(res.unresolved, ['group:A:rank:2'])
})
