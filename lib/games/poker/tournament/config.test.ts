import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateTournamentConfig,
  TEMPLATE_STT_6MAX,
  TEMPLATE_MTT,
  TEMPLATE_PUBLIC_HEADS_UP,
  TOURNAMENT_TEMPLATES,
  BLINDS_STANDARD_6MAX,
  PAYOUTS_STANDARD,
} from './config.ts'
import { validateBlindStructure } from './blinds.ts'
import type { TournamentConfig } from './types.ts'

test('shipped templates validate', () => {
  assert.deepEqual(validateTournamentConfig(TEMPLATE_STT_6MAX), { ok: true })
  assert.deepEqual(validateTournamentConfig(TEMPLATE_MTT), { ok: true })
  assert.deepEqual(validateTournamentConfig(TEMPLATE_PUBLIC_HEADS_UP), { ok: true })
  assert.deepEqual(validateBlindStructure(BLINDS_STANDARD_6MAX), { ok: true })
  assert.equal(Object.keys(TOURNAMENT_TEMPLATES).length, 3)
})

test('COIN-INT-001 all template money values are integers', () => {
  for (const c of Object.values(TOURNAMENT_TEMPLATES)) {
    for (const v of [c.entryFee, c.startingStack, c.guaranteedPrizePool, c.minEntries, c.maxEntries]) {
      assert.ok(Number.isInteger(v))
    }
    for (const l of c.blindStructure.levels) {
      assert.ok(Number.isInteger(l.smallBlind) && Number.isInteger(l.bigBlind) && Number.isInteger(l.ante))
    }
    for (const t of c.payoutStructure.tiers) {
      assert.ok(t.weights.every((w) => Number.isInteger(w) && w > 0))
    }
  }
})

test('validateTournamentConfig rejects malformed configs', () => {
  const bad = (over: Partial<TournamentConfig>): boolean =>
    validateTournamentConfig({ ...TEMPLATE_STT_6MAX, ...over }).ok === false
  assert.ok(bad({ entryFee: 0 }))
  assert.ok(bad({ entryFee: 10.5 }))
  assert.ok(bad({ maxEntries: 1 })) // < minEntries
  assert.ok(bad({ minEntries: 1 }))
  assert.ok(bad({ seatsPerTable: 1 }))
  assert.ok(bad({ maxReEntriesPerUser: 2, reEntryUntilLevelIndex: null })) // re-entry needs a window
  assert.ok(bad({ lateRegUntilLevelIndex: 999 })) // out of range
})

test('PAYOUTS_STANDARD pays at least one place at the smallest field', () => {
  assert.ok(PAYOUTS_STANDARD.tiers.some((t) => t.minEntries === 2))
})
