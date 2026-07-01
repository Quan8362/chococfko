// Unit tests for the pure poker telemetry taxonomy + privacy-safe record builder.
// Run with:  node --test lib/games/poker/telemetry.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TELEMETRY_SCHEMA_VERSION,
  TELEMETRY_EVENTS,
  telemetryDomain,
  isTelemetryEvent,
  defaultEventSeverity,
  POKER_ERROR_CODES,
  isPokerErrorCode,
  opsKindForEvent,
  isPersistedEvent,
  redactTelemetryDetail,
  buildTelemetryRecord,
  formatTelemetryLine,
} from './telemetry.ts'
import { OPS_EVENT_KINDS } from './admin.ts'

test('taxonomy: every documented event is present and uniquely classified', () => {
  // 7 domains: table(7) seat(7) hand(6) action(6) realtime(6) coin(7) security(4) = 43 events.
  assert.equal(TELEMETRY_EVENTS.length, 43)
  assert.equal(new Set(TELEMETRY_EVENTS).size, TELEMETRY_EVENTS.length, 'no duplicate events')
  for (const e of TELEMETRY_EVENTS) {
    assert.ok(isTelemetryEvent(e))
    assert.ok(telemetryDomain(e), `domain for ${e}`)
  }
  assert.equal(isTelemetryEvent('not_an_event'), false)
})

test('severity defaults: integrity/security events are critical', () => {
  assert.equal(defaultEventSeverity('coin_invariant_failed'), 'critical')
  assert.equal(defaultEventSeverity('private_data_access_denied'), 'critical')
  assert.equal(defaultEventSeverity('hand_frozen'), 'error')
  assert.equal(defaultEventSeverity('action_rejected'), 'warn')
  assert.equal(defaultEventSeverity('hand_started'), 'info')
})

test('error codes: catalog is stable and guarded', () => {
  assert.ok(POKER_ERROR_CODES.includes('PKR_COIN_NOT_CONSERVED'))
  assert.ok(isPokerErrorCode('PKR_ACTION_STALE'))
  assert.equal(isPokerErrorCode('nope'), false)
})

test('ops-kind bridge: mapped kinds are valid ops_events kinds; lifecycle events are log-only', () => {
  for (const e of TELEMETRY_EVENTS) {
    const kind = opsKindForEvent(e)
    if (kind !== null) {
      assert.ok((OPS_EVENT_KINDS as readonly string[]).includes(kind), `${e} -> ${kind} must be a real ops kind`)
      assert.equal(isPersistedEvent(e), true)
    } else {
      assert.equal(isPersistedEvent(e), false)
    }
  }
  // Sanity: a couple of specific mappings.
  assert.equal(opsKindForEvent('coin_invariant_failed'), 'coin_conservation_failure')
  assert.equal(opsKindForEvent('sequence_gap'), 'sequence_gap')
  assert.equal(opsKindForEvent('table_created'), null)
})

test('redaction: cards, secrets AND coarse PII are stripped from detail', () => {
  const d = redactTelemetryDetail({
    holeCards: ['As', 'Kd'],
    board: ['2h'],
    token: 'secret-jwt',
    email: 'user@example.com',
    client_ip: '203.0.113.7',
    stateVersion: 12,
    nested: { deck: ['Tc', '9s'], note: 'ok', phone: '+81...' },
  })
  assert.equal(d.token, '[redacted]')
  assert.equal(d.email, '[redacted]')
  assert.equal(d.client_ip, '[redacted]')
  assert.equal(d.holeCards, '[redacted]')
  // card-shaped value scrub reaches the board array value too
  assert.equal(d.stateVersion, 12)
  const nested = d.nested as Record<string, unknown>
  assert.equal(nested.deck, '[redacted]')
  assert.equal(nested.phone, '[redacted]')
  assert.equal(nested.note, 'ok')
  // The serialized line must contain no raw sensitive substrings.
  const line = JSON.stringify(d)
  for (const bad of ['As', 'Kd', 'Tc', 'secret-jwt', 'user@example.com', '203.0.113.7']) {
    assert.ok(!line.includes(bad), `line must not contain ${bad}`)
  }
})

test('buildTelemetryRecord: fills schema/domain/severity, redacts, and marks persisted', () => {
  const rec = buildTelemetryRecord({
    event: 'action_rejected',
    code: 'PKR_ACTION_ILLEGAL',
    correlation: { tableId: 't1', handId: 'h1', stateVersion: 5, actionSeq: 9, requestId: '', region: null },
    detail: { holeCards: ['As', 'Ks'], reason: 'not_your_turn' },
    now: () => '2026-07-01T00:00:00.000Z',
  })
  assert.equal(rec.schema, TELEMETRY_SCHEMA_VERSION)
  assert.equal(rec.ts, '2026-07-01T00:00:00.000Z')
  assert.equal(rec.domain, 'action')
  assert.equal(rec.severity, 'warn')
  assert.equal(rec.code, 'PKR_ACTION_ILLEGAL')
  assert.equal(rec.persisted, true)
  // Empty/null correlation fields are dropped; present ones kept.
  assert.deepEqual(rec.correlation, { tableId: 't1', handId: 'h1', stateVersion: 5, actionSeq: 9 })
  assert.equal((rec.detail as Record<string, unknown>).holeCards, '[redacted]')
  assert.equal((rec.detail as Record<string, unknown>).reason, 'not_your_turn')
})

test('formatTelemetryLine: single greppable prefixed JSON line, no card leak', () => {
  const rec = buildTelemetryRecord({ event: 'hand_completed', detail: { winners: [0], reveal: ['As', 'Ad'] }, now: () => '2026-07-01T00:00:00.000Z' })
  const line = formatTelemetryLine(rec)
  assert.ok(line.startsWith('[poker-telemetry] '))
  assert.ok(!line.includes('As'))
  assert.ok(!line.includes('Ad'))
  const parsed = JSON.parse(line.slice('[poker-telemetry] '.length))
  assert.equal(parsed.event, 'hand_completed')
})
