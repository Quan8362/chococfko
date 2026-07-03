// ── Prompt 25B — isolated maintenance × access verification ──────────────────────────────────────
//
// Drives the REAL, pure resolver + capability composition exactly as the server enforcement in
// app/games/poker/access.ts → checkPokerCapability() does, for every maintenance tier, under the
// production Closed-Beta posture (Closed Beta ON; public/alpha/spectator/bots/tournaments OFF).
//
// This is the "isolated non-production environment" verification: it exercises the same pure
// functions the server runs (resolvePokerFlags, pokerCan, resolveMaintenance, maintenanceGate,
// worseDecision) with NO DB, NO coins, NO cards — so it can never mutate a wallet or expose a hole
// card. Structurally: none of these modules import supabase, coin_ledger, or a card value.
//
// It asserts, per tier: the capability RESULT code a real player would receive, that admins are
// subject to the same GAMEPLAY gate (admins operate ops via /admin/poker, gated separately by
// ADMIN_EMAILS — NOT by these gameplay capabilities), and that returning to `normal` fully recovers.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolvePokerFlags,
  pokerCan,
  pokerVisibleTo,
  type PokerFlags,
  type PokerViewer,
  type PokerCapability,
} from './flags.ts'
import {
  resolveMaintenance,
  maintenanceGate,
  worseDecision,
  parseMaintenanceMode,
  type MaintenanceDecision,
} from './maintenance.ts'

// Faithful re-implementation of checkPokerCapability's synchronous decision (the beta terms-ack gate
// is async + DB-backed and out of scope here; it only ever ADDS a block, never removes one).
type Code = null | 'poker_feature_off' | 'poker_joins_frozen'

function effectiveCode(
  flags: PokerFlags,
  viewer: PokerViewer,
  modeEnv: string | undefined,
  cap: PokerCapability,
  betaMaintenance = false,
): Code {
  const maint = resolveMaintenance({ POKER_MAINTENANCE_MODE: modeEnv })
  if (!pokerCan(flags, viewer, cap)) {
    if ((cap === 'join' || cap === 'create') && flags.blockNewJoins && pokerVisibleTo(flags, viewer)) {
      return 'poker_joins_frozen'
    }
    return 'poker_feature_off'
  }
  const legacy: MaintenanceDecision =
    betaMaintenance && (cap === 'create' || cap === 'join')
      ? { allowed: false, reason: 'joins_frozen' }
      : { allowed: true, reason: null }
  const decision = worseDecision(maintenanceGate(maint.mode, cap), legacy)
  if (!decision.allowed) {
    return decision.reason === 'feature_off' ? 'poker_feature_off' : 'poker_joins_frozen'
  }
  return null
}

// Production Closed-Beta posture, but with the per-capability flags a real cohort tester needs ON,
// so the baseline (normal) PERMITS play and the maintenance tier is what changes outcomes — this
// isolates the maintenance behavior under test.
const BETA_FLAGS: PokerFlags = resolvePokerFlags({
  POKER_CLOSED_BETA_ENABLED: '1',
  POKER_CREATE_TABLE_ENABLED: '1',
  POKER_PUBLIC_LOBBY_ENABLED: '1',
  POKER_PRIVATE_TABLE_ENABLED: '1',
  POKER_SPECTATOR_ENABLED: '1',
})
const COHORT: PokerViewer = { isAdmin: false, isBetaMember: true }
const ADMIN: PokerViewer = { isAdmin: true }
const ANON: PokerViewer = { isAdmin: false, isBetaMember: false }

const ALL_CAPS: readonly PokerCapability[] = ['enter', 'create', 'join', 'public_lobby', 'private_table', 'spectate']

// Sanity: the posture matches the declared production state.
test('25B-POSTURE-001 Closed Beta ON; public/alpha/spectator-master/bots/tournaments OFF', () => {
  const prod = resolvePokerFlags({ POKER_CLOSED_BETA_ENABLED: '1' })
  assert.equal(prod.closedBeta, true)
  assert.equal(prod.enabled, false)      // public poker OFF
  assert.equal(prod.alpha, false)        // alpha OFF
  assert.equal(prod.bot, false)          // bots hard-OFF
  assert.equal(prod.tournament, false)   // tournaments hard-OFF
  // Cohort member is visible; anon/non-cohort is denied entirely.
  assert.equal(pokerVisibleTo(prod, COHORT), true)
  assert.equal(pokerVisibleTo(prod, ANON), false)
  assert.equal(pokerVisibleTo(prod, ADMIN), true)
})

// ── normal: standard Closed-Beta behavior continues ──────────────────────────────────────────────
test('25B-TIER-normal-001 baseline permits play for cohort; anon denied', () => {
  for (const cap of ALL_CAPS) {
    assert.equal(effectiveCode(BETA_FLAGS, COHORT, 'normal', cap), null, `cohort/${cap}`)
    assert.equal(effectiveCode(BETA_FLAGS, ANON, 'normal', cap), 'poker_feature_off', `anon/${cap}`)
  }
})

// ── no_new_joins: existing play continues; NEW create/join blocked; read paths open ───────────────
test('25B-TIER-no_new_joins-001 blocks create+join only, keeps enter/lobby/spectate', () => {
  assert.equal(effectiveCode(BETA_FLAGS, COHORT, 'no_new_joins', 'create'), 'poker_joins_frozen')
  assert.equal(effectiveCode(BETA_FLAGS, COHORT, 'no_new_joins', 'join'), 'poker_joins_frozen')
  for (const cap of ['enter', 'public_lobby', 'private_table', 'spectate'] as PokerCapability[]) {
    assert.equal(effectiveCode(BETA_FLAGS, COHORT, 'no_new_joins', cap), null, cap)
  }
  // Admins are subject to the SAME gameplay gate (ops is a separate /admin/poker surface).
  assert.equal(effectiveCode(BETA_FLAGS, ADMIN, 'no_new_joins', 'join'), 'poker_joins_frozen')
})

// ── read_only_lobby: read paths open; committing/private blocked ──────────────────────────────────
test('25B-TIER-read_only_lobby-001 browse+spectate open, create/join/private blocked', () => {
  for (const cap of ['enter', 'public_lobby', 'spectate'] as PokerCapability[]) {
    assert.equal(effectiveCode(BETA_FLAGS, COHORT, 'read_only_lobby', cap), null, cap)
  }
  for (const cap of ['create', 'join', 'private_table'] as PokerCapability[]) {
    assert.equal(effectiveCode(BETA_FLAGS, COHORT, 'read_only_lobby', cap), 'poker_joins_frozen', cap)
  }
})

// ── full_maintenance: only enter (the maintenance screen); everything else feature_off ────────────
test('25B-TIER-full_maintenance-001 only enter allowed; gameplay routes blocked', () => {
  assert.equal(effectiveCode(BETA_FLAGS, COHORT, 'full_maintenance', 'enter'), null)
  for (const cap of ['create', 'join', 'public_lobby', 'private_table', 'spectate'] as PokerCapability[]) {
    assert.equal(effectiveCode(BETA_FLAGS, COHORT, 'full_maintenance', cap), 'poker_feature_off', cap)
  }
  // Admin gameplay is likewise blocked to enter-only; admin OPS remain on /admin/poker.
  assert.equal(effectiveCode(BETA_FLAGS, ADMIN, 'full_maintenance', 'create'), 'poker_feature_off')
  assert.equal(effectiveCode(BETA_FLAGS, ADMIN, 'full_maintenance', 'enter'), null)
})

// ── emergency_shutdown: fully dark for everyone (incl. enter) ─────────────────────────────────────
test('25B-TIER-emergency_shutdown-001 every capability feature_off', () => {
  for (const cap of ALL_CAPS) {
    assert.equal(effectiveCode(BETA_FLAGS, COHORT, 'emergency_shutdown', cap), 'poker_feature_off', cap)
    assert.equal(effectiveCode(BETA_FLAGS, ADMIN, 'emergency_shutdown', cap), 'poker_feature_off', `admin/${cap}`)
  }
})

// ── invalid/unknown value: FAILS CLOSED to full_maintenance (never opens) ─────────────────────────
test('25B-TIER-invalid-001 unknown mode value resolves to full_maintenance behavior', () => {
  assert.equal(parseMaintenanceMode('totally-bogus'), 'full_maintenance')
  assert.equal(effectiveCode(BETA_FLAGS, COHORT, 'totally-bogus', 'enter'), null)
  assert.equal(effectiveCode(BETA_FLAGS, COHORT, 'totally-bogus', 'join'), 'poker_feature_off')
  // A blank/empty value is the ONLY thing that reads as normal.
  assert.equal(effectiveCode(BETA_FLAGS, COHORT, '', 'join'), null)
})

// ── recovery: returning to normal fully restores capability ───────────────────────────────────────
test('25B-RECOVERY-001 after any tier, normal restores full cohort capability', () => {
  for (const mode of ['no_new_joins', 'read_only_lobby', 'full_maintenance', 'emergency_shutdown', 'bogus']) {
    // (mode active → at least one block)
    assert.notEqual(effectiveCode(BETA_FLAGS, COHORT, mode, 'join'), null, `${mode} should block join`)
  }
  // Back to normal → every capability the flags permit is allowed again.
  for (const cap of ALL_CAPS) {
    assert.equal(effectiveCode(BETA_FLAGS, COHORT, 'normal', cap), null, `recovered/${cap}`)
  }
})

// ── legacy beta wind-down still composes (most-restrictive-wins) ──────────────────────────────────
test('25B-COMPOSE-001 POKER_BETA_MAINTENANCE still freezes create/join under normal mode', () => {
  assert.equal(effectiveCode(BETA_FLAGS, COHORT, 'normal', 'join', /*betaMaintenance*/ true), 'poker_joins_frozen')
  assert.equal(effectiveCode(BETA_FLAGS, COHORT, 'normal', 'enter', true), null)
})
