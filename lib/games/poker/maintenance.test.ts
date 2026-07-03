import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseMaintenanceMode,
  resolveMaintenance,
  maintenanceGate,
  maintenanceSeverity,
  worseDecision,
  MAINTENANCE_MODES,
  POKER_MAINTENANCE_MODE_ENV,
  POKER_MAINTENANCE_MESSAGE_ENV,
  POKER_MAINTENANCE_ETA_ENV,
  type MaintenanceMode,
} from './maintenance.ts'
import type { PokerCapability } from './flags.ts'

const CAPS: readonly PokerCapability[] = [
  'enter', 'create', 'join', 'public_lobby', 'private_table', 'spectate',
]

// ── Parsing / fail-closed ──────────────────────────────────────────────────────────────────────
test('MAINT-PARSE-001 unset / empty / off resolve to normal', () => {
  for (const v of [undefined, null, '', '  ', '0', 'off', 'none', 'NORMAL']) {
    assert.equal(parseMaintenanceMode(v as string | undefined), 'normal')
  }
})

test('MAINT-PARSE-002 canonical + alias spellings resolve correctly', () => {
  assert.equal(parseMaintenanceMode('read-only-lobby'), 'read_only_lobby')
  assert.equal(parseMaintenanceMode('lobby'), 'read_only_lobby')
  assert.equal(parseMaintenanceMode('freeze'), 'no_new_joins')
  assert.equal(parseMaintenanceMode('drain'), 'finish_active_hands')
  assert.equal(parseMaintenanceMode('maintenance'), 'full_maintenance')
  assert.equal(parseMaintenanceMode('KILL'), 'emergency_shutdown')
})

test('MAINT-PARSE-003 unknown non-empty value FAILS CLOSED to full_maintenance', () => {
  assert.equal(parseMaintenanceMode('typo_mode'), 'full_maintenance')
  assert.equal(parseMaintenanceMode('enabled'), 'full_maintenance')
})

test('MAINT-SEV-001 severity is monotonic with canonical order; unknown is most severe', () => {
  for (let i = 0; i < MAINTENANCE_MODES.length; i++) {
    assert.equal(maintenanceSeverity(MAINTENANCE_MODES[i]), i)
  }
  assert.equal(maintenanceSeverity('bogus' as MaintenanceMode), MAINTENANCE_MODES.length - 1)
})

// ── Resolve status ───────────────────────────────────────────────────────────────────────────
test('MAINT-RESOLVE-001 empty env ⇒ normal + inactive + no message/eta', () => {
  const s = resolveMaintenance({})
  assert.deepEqual(s, { mode: 'normal', active: false, message: null, etaIso: null })
})

test('MAINT-RESOLVE-002 message + eta are surfaced, trimmed; active flips on', () => {
  const s = resolveMaintenance({
    [POKER_MAINTENANCE_MODE_ENV]: 'no_new_joins',
    [POKER_MAINTENANCE_MESSAGE_ENV]: '  Scheduled upgrade in progress.  ',
    [POKER_MAINTENANCE_ETA_ENV]: ' 2026-07-03T18:00:00Z ',
  })
  assert.equal(s.mode, 'no_new_joins')
  assert.equal(s.active, true)
  assert.equal(s.message, 'Scheduled upgrade in progress.')
  assert.equal(s.etaIso, '2026-07-03T18:00:00Z')
})

// ── Capability gate per mode ────────────────────────────────────────────────────────────────────
test('MAINT-GATE-001 normal allows every capability', () => {
  for (const cap of CAPS) assert.equal(maintenanceGate('normal', cap).allowed, true)
})

test('MAINT-GATE-002 read_only_lobby: read-only open, committing/private blocked as joins_frozen', () => {
  assert.equal(maintenanceGate('read_only_lobby', 'enter').allowed, true)
  assert.equal(maintenanceGate('read_only_lobby', 'public_lobby').allowed, true)
  assert.equal(maintenanceGate('read_only_lobby', 'spectate').allowed, true)
  for (const cap of ['create', 'join', 'private_table'] as PokerCapability[]) {
    const d = maintenanceGate('read_only_lobby', cap)
    assert.equal(d.allowed, false)
    assert.equal(d.reason, 'joins_frozen')
  }
})

test('MAINT-GATE-003 no_new_tables blocks only create', () => {
  assert.equal(maintenanceGate('no_new_tables', 'create').allowed, false)
  assert.equal(maintenanceGate('no_new_tables', 'create').reason, 'joins_frozen')
  for (const cap of ['enter', 'join', 'public_lobby', 'private_table', 'spectate'] as PokerCapability[]) {
    assert.equal(maintenanceGate('no_new_tables', cap).allowed, true)
  }
})

test('MAINT-GATE-004 no_new_joins / finish_active_hands block create+join only', () => {
  for (const mode of ['no_new_joins', 'finish_active_hands'] as MaintenanceMode[]) {
    assert.equal(maintenanceGate(mode, 'create').allowed, false)
    assert.equal(maintenanceGate(mode, 'join').allowed, false)
    for (const cap of ['enter', 'public_lobby', 'private_table', 'spectate'] as PokerCapability[]) {
      assert.equal(maintenanceGate(mode, cap).allowed, true, `${mode}/${cap}`)
    }
  }
})

test('MAINT-GATE-005 full_maintenance allows only enter, everything else feature_off', () => {
  assert.equal(maintenanceGate('full_maintenance', 'enter').allowed, true)
  for (const cap of ['create', 'join', 'public_lobby', 'private_table', 'spectate'] as PokerCapability[]) {
    const d = maintenanceGate('full_maintenance', cap)
    assert.equal(d.allowed, false)
    assert.equal(d.reason, 'feature_off')
  }
})

test('MAINT-GATE-006 emergency_shutdown refuses everything incl. enter', () => {
  for (const cap of CAPS) {
    const d = maintenanceGate('emergency_shutdown', cap)
    assert.equal(d.allowed, false)
    assert.equal(d.reason, 'feature_off')
  }
})

test('MAINT-GATE-007 hosting a new table is blocked in every active mode', () => {
  // Invariant across the (deliberately non-total) tier ordering: as soon as maintenance is active,
  // no NEW table can be created. `no_new_tables` still lets players SEAT at existing tables (join);
  // every other active mode also blocks join.
  for (const mode of MAINTENANCE_MODES) {
    if (mode === 'normal') continue
    assert.equal(maintenanceGate(mode, 'create').allowed, false, `${mode}/create`)
    const joinAllowed = maintenanceGate(mode, 'join').allowed
    assert.equal(joinAllowed, mode === 'no_new_tables', `${mode}/join`)
  }
})

test('MAINT-GATE-008 read-only capabilities stay open until full_maintenance/emergency', () => {
  // enter/public_lobby/spectate remain available through the drain tiers so a player can see the
  // status and finish their hand; they only close at full_maintenance (enter-only) + emergency.
  for (const mode of ['read_only_lobby', 'no_new_tables', 'no_new_joins', 'finish_active_hands'] as MaintenanceMode[]) {
    assert.equal(maintenanceGate(mode, 'enter').allowed, true, `${mode}/enter`)
    assert.equal(maintenanceGate(mode, 'spectate').allowed, true, `${mode}/spectate`)
  }
})

// ── worseDecision composition ───────────────────────────────────────────────────────────────────
test('MAINT-COMPOSE-001 worseDecision: block beats allow; feature_off beats joins_frozen', () => {
  const allow = { allowed: true, reason: null } as const
  const joins = { allowed: false, reason: 'joins_frozen' } as const
  const off = { allowed: false, reason: 'feature_off' } as const
  assert.deepEqual(worseDecision(allow, allow), { allowed: true, reason: null })
  assert.deepEqual(worseDecision(allow, joins), { allowed: false, reason: 'joins_frozen' })
  assert.deepEqual(worseDecision(joins, off), { allowed: false, reason: 'feature_off' })
  assert.deepEqual(worseDecision(off, joins), { allowed: false, reason: 'feature_off' })
})
