// Framework-free tests for the load-test guardrail/profile/stop-switch spine.
// Run:  node --test scripts/poker-load/config.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PROFILES,
  clientCount,
  assertWithinGuardrails,
  assertSafeTarget,
  resolveProfile,
  type Guardrails,
} from './config.ts'

const G: Guardrails = { maxTables: 120, maxSeatedPlayers: 720, maxClients: 1500, maxDurationSec: 1800, maxActionsPerSec: 400 }

test('target profile is within the default guardrails', () => {
  assert.doesNotThrow(() => assertWithinGuardrails(PROFILES.target, G))
})

test('guardrail rejects an over-scale profile', () => {
  const huge = { ...PROFILES.target, tables: 1000 }
  assert.throws(() => assertWithinGuardrails(huge, G), /GUARDRAIL/)
})

test('clientCount sums seated + spectators + lobby + history', () => {
  const p = PROFILES.moderate
  assert.equal(clientCount(p), p.tables * (p.playersPerTable + p.spectatorsPerTable) + p.lobbyViewers + p.historyBrowsers)
})

test('assertSafeTarget refuses when neither branch nor prod-override is set', () => {
  assert.throws(
    () => assertSafeTarget({ supabaseUrl: 'https://example.supabase.co', baseUrl: 'x', isBranchTarget: false, allowProd: false }),
    /LOAD SAFETY/,
  )
})

test('assertSafeTarget allows an explicit throwaway branch', () => {
  assert.doesNotThrow(() =>
    assertSafeTarget({ supabaseUrl: 'https://branchref.supabase.co', baseUrl: 'x', isBranchTarget: true, allowProd: false }),
  )
})

test('assertSafeTarget still refuses the known prod ref even if mislabelled a branch', () => {
  assert.throws(
    () => assertSafeTarget({ supabaseUrl: 'https://kjfnqbzfhymhfodmgyow.supabase.co', baseUrl: 'x', isBranchTarget: true, allowProd: false }),
    /PRODUCTION/,
  )
})

test('resolveProfile throws on an unknown name', () => {
  assert.throws(() => resolveProfile('nope'), /unknown load profile/)
})

test('every profile has coherent, non-negative shape', () => {
  for (const p of Object.values(PROFILES)) {
    assert.ok(p.tables >= 0 && p.playersPerTable >= 0 && p.durationSec > 0, `profile ${p.name}`)
    assert.ok(p.actionThinkMsMax >= p.actionThinkMsMin, `think window ${p.name}`)
    assert.ok(p.reconnectFraction >= 0 && p.reconnectFraction <= 1, `reconnect fraction ${p.name}`)
  }
})
