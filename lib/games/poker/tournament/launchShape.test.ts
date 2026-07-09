// Unit tests for the public launch-shape policy (heads-up single-table) + closed-beta compatibility.
// Run with:  node --test lib/games/poker/tournament/launchShape.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validatePublicLaunchShape,
  isPublicLaunchShape,
  PUBLIC_LAUNCH_MAX_ENTRIES,
  PUBLIC_LAUNCH_SEATS_PER_TABLE,
} from './launchShape.ts'
import {
  TEMPLATE_PUBLIC_HEADS_UP,
  TEMPLATE_STT_6MAX,
  TEMPLATE_MTT,
  validateTournamentConfig,
} from './config.ts'
import type { TournamentConfig } from './types.ts'
import { resolvePokerFlags, pokerTournamentPublicEnabled } from '../flags.ts'

const hu = (over: Partial<TournamentConfig> = {}): TournamentConfig => ({ ...TEMPLATE_PUBLIC_HEADS_UP, ...over })

// ── Accept the validated public shape ───────────────────────────────────────────────────────────
test('public heads-up single-table configuration is accepted', () => {
  assert.equal(PUBLIC_LAUNCH_MAX_ENTRIES, 2)
  assert.equal(PUBLIC_LAUNCH_SEATS_PER_TABLE, 2)
  assert.equal(validatePublicLaunchShape(TEMPLATE_PUBLIC_HEADS_UP).ok, true)
  assert.equal(isPublicLaunchShape(TEMPLATE_PUBLIC_HEADS_UP), true)
  // The public template is ALSO a valid tournament config on the general validator.
  assert.equal(validateTournamentConfig(TEMPLATE_PUBLIC_HEADS_UP).ok, true)
})

// ── Reject everything outside the validated shape ─────────────────────────────────────────────────
test('public multi-table / >2 players is rejected', () => {
  assert.equal(validatePublicLaunchShape(hu({ maxEntries: 6 })).ok, false)
  assert.equal(validatePublicLaunchShape(hu({ maxEntries: 3 })).ok, false)
  assert.equal(validatePublicLaunchShape(hu({ seatsPerTable: 6 })).ok, false)
  // A 6-max seat count with 2 entries would still allow a >1-table future → rejected.
  assert.equal(validatePublicLaunchShape(hu({ seatsPerTable: 9 })).ok, false)
})

test('public re-entry is rejected', () => {
  assert.equal(validatePublicLaunchShape(hu({ maxReEntriesPerUser: 1, reEntryUntilLevelIndex: 3 })).ok, false)
  assert.equal(validatePublicLaunchShape(hu({ maxReEntriesPerUser: 2, reEntryUntilLevelIndex: 0 })).ok, false)
})

test('public late registration is rejected', () => {
  assert.equal(validatePublicLaunchShape(hu({ lateRegUntilLevelIndex: 3 })).ok, false)
})

test('public minEntries other than 2 is rejected', () => {
  assert.equal(validatePublicLaunchShape(hu({ minEntries: 6, maxEntries: 6 })).ok, false)
})

test('the full internal-alpha MTT template is rejected as a public shape (multi-table + late reg + re-entry)', () => {
  const r = validatePublicLaunchShape(TEMPLATE_MTT)
  assert.equal(r.ok, false)
})

// ── Closed-beta / internal-alpha compatibility (unchanged behaviour) ──────────────────────────────
test('closed-beta 6-max templates remain valid on the general validator (not weakened)', () => {
  assert.equal(validateTournamentConfig(TEMPLATE_STT_6MAX).ok, true)
  assert.equal(validateTournamentConfig(TEMPLATE_MTT).ok, true)
  // ...but they are NOT public-launch-shaped, so they can only be created while the public flag is OFF.
  assert.equal(isPublicLaunchShape(TEMPLATE_STT_6MAX), false)
  assert.equal(isPublicLaunchShape(TEMPLATE_MTT), false)
})

test('public tournament capability is hard-off by default → launch-shape enforcement is dormant', () => {
  // The public `tournament` flag is hard-off regardless of env (flags.ts). With it OFF the operator
  // create path does NOT apply validatePublicLaunchShape, so closed-beta/internal-alpha 6-max
  // creation is unchanged. Enforcement only arms when public is explicitly enabled.
  const flags = resolvePokerFlags({ POKER_TOURNAMENT_ENABLED: 'true', POKER_ENABLED: 'true' })
  assert.equal(flags.tournament, false)
  assert.equal(pokerTournamentPublicEnabled(flags), false)
})
