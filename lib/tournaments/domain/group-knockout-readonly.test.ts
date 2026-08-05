// Run with: node --test lib/tournaments/domain/group-knockout-readonly.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildReadonlyBranchView,
  evaluateBracketResetGate,
  type ReadonlyMatchInput,
  type ReadonlySeedInput,
} from './group-knockout-readonly.ts'

// A championship branch with 3 real competitors → 4-slot bracket, one first-round BYE.
const seed3: ReadonlySeedInput = {
  seededIds: ['tA1', 'tB1', 'tC1'],
  tokens: [
    { tokenId: 'tA1', competitorId: 'teamA' },
    { tokenId: 'tB1', competitorId: 'teamB' },
    { tokenId: 'tC1', competitorId: 'teamC' },
  ],
}
// Official first-round matches (as stored): seed 1 gets a BYE, seeds 2 & 3 meet.
const matches3: ReadonlyMatchInput[] = [
  { matchNumber: 2, competitorAId: 'teamB', competitorBId: 'teamC', status: 'ready' },
  { matchNumber: 1, competitorAId: 'teamA', competitorBId: null, status: 'bye' },
]

test('seed order is preserved from persisted slots and resolved to competitors', () => {
  const v = buildReadonlyBranchView({ seed: seed3, firstRoundMatches: matches3 })
  assert.deepEqual(
    v.seedRows.map((r) => [r.seed, r.tokenId, r.competitorId]),
    [
      [1, 'tA1', 'teamA'],
      [2, 'tB1', 'teamB'],
      [3, 'tC1', 'teamC'],
    ],
  )
})

test('pairings come from official matches, sorted by match number, with real competitors', () => {
  const v = buildReadonlyBranchView({ seed: seed3, firstRoundMatches: matches3 })
  assert.equal(v.pairings.length, 2)
  assert.equal(v.pairings[0].matchNumber, 1)
  assert.equal(v.pairings[1].matchNumber, 2)
  assert.deepEqual(v.pairings[1].slotA, { kind: 'competitor', competitorId: 'teamB' })
  assert.deepEqual(v.pairings[1].slotB, { kind: 'competitor', competitorId: 'teamC' })
})

test('BYE is surfaced explicitly (never a fake opponent) and flagged on the match', () => {
  const v = buildReadonlyBranchView({ seed: seed3, firstRoundMatches: matches3 })
  const bye = v.pairings.find((p) => p.matchNumber === 1)!
  assert.equal(bye.isBye, true)
  assert.deepEqual(bye.slotA, { kind: 'competitor', competitorId: 'teamA' })
  assert.deepEqual(bye.slotB, { kind: 'bye' })
})

test('stats are derived from the official (played) bracket, not the seed config', () => {
  const v = buildReadonlyBranchView({ seed: seed3, firstRoundMatches: matches3 })
  assert.equal(v.bracketSize, 4) // 2 matches * 2 slots
  assert.equal(v.competitorCount, 3) // 3 real competitors placed
  assert.equal(v.byes, 1)
  assert.equal(v.hasData, true)
})

test('a not-yet-known slot on a non-bye match reads as tbd, not bye', () => {
  const v = buildReadonlyBranchView({
    seed: null,
    firstRoundMatches: [{ matchNumber: 1, competitorAId: 'x', competitorBId: null, status: 'pending' }],
  })
  assert.deepEqual(v.pairings[0].slotB, { kind: 'tbd' })
  assert.equal(v.pairings[0].isBye, false)
})

test('no official matches → hasData false, empty rows (defensive, never throws)', () => {
  const v = buildReadonlyBranchView({ seed: null, firstRoundMatches: [] })
  assert.equal(v.hasData, false)
  assert.equal(v.seedRows.length, 0)
  assert.equal(v.pairings.length, 0)
  assert.equal(v.bracketSize, 0)
})

test('an unresolved seed token keeps its order but resolves to null (never fabricated)', () => {
  const v = buildReadonlyBranchView({
    seed: { seededIds: ['tA1', 'tB1'], tokens: [{ tokenId: 'tA1', competitorId: 'teamA' }, { tokenId: 'tB1', competitorId: null }] },
    firstRoundMatches: [{ matchNumber: 1, competitorAId: 'teamA', competitorBId: 'teamB', status: 'ready' }],
  })
  assert.equal(v.seedRows[1].competitorId, null)
})

// ── reset gate ─────────────────────────────────────────────────────────────────────────────────

test('reset allowed only when there are no results and the viewer can manage', () => {
  assert.deepEqual(evaluateBracketResetGate({ hasResults: false, canManage: true }), { allowed: true })
})

test('reset blocked with a visible reason once any knockout result exists', () => {
  assert.deepEqual(evaluateBracketResetGate({ hasResults: true, canManage: true }), {
    allowed: false,
    reason: 'has_results',
  })
})

test('results block wins over a missing permission (primary blocker surfaced first)', () => {
  assert.deepEqual(evaluateBracketResetGate({ hasResults: true, canManage: false }), {
    allowed: false,
    reason: 'has_results',
  })
})

test('without bracket.manage the reset is forbidden even with no results', () => {
  assert.deepEqual(evaluateBracketResetGate({ hasResults: false, canManage: false }), {
    allowed: false,
    reason: 'forbidden',
  })
})
