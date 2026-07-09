// Unit tests for the pure SEV-1 invariant detectors.
// Run with:  node --test lib/games/poker/incidentDetectors.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  sev1CodeForIntegrity,
  detectionFromIntegrity,
  detectDuplicateActiveHands,
  detectDuplicatePayouts,
  detectDuplicateActions,
  detectCrossUserActions,
} from './incidentDetectors.ts'
import type { IntegrityViolation } from './coinIntegrity.ts'

const SRC = 'test'

// ── Economy / settlement contradictions from the coin-integrity audit ───────────────────────────
test('integrity codes map to the right SEV-1 codes', () => {
  assert.equal(sev1CodeForIntegrity('CONSERVATION_MISMATCH'), 'PKR_SEV1_ECONOMY_NOT_CONSERVED')
  assert.equal(sev1CodeForIntegrity('SETTLEMENT_RECONCILE_MISMATCH'), 'PKR_SEV1_ECONOMY_NOT_CONSERVED')
  assert.equal(sev1CodeForIntegrity('POT_CONSTRUCTION_MISMATCH'), 'PKR_SEV1_ECONOMY_NOT_CONSERVED')
  assert.equal(sev1CodeForIntegrity('DUPLICATE_SETTLEMENT'), 'PKR_SEV1_DUPLICATE_PAYOUT')
  assert.equal(sev1CodeForIntegrity('PAYOUT_TO_INELIGIBLE_SEAT'), 'PKR_SEV1_CONTRADICTORY_SETTLEMENT')
})

test('detectionFromIntegrity keeps only numeric evidence + correlation ids', () => {
  const v: IntegrityViolation = {
    code: 'CONSERVATION_MISMATCH', severity: 'critical',
    message: 'payouts + refunds do not equal total contributed',
    evidence: { out: 100, in: 90, delta: 10 },
    correlation: { tableId: 'tbl-1', handId: 'hand-1' },
  }
  const d = detectionFromIntegrity(v, SRC)
  assert.equal(d.code, 'PKR_SEV1_ECONOMY_NOT_CONSERVED')
  assert.equal(d.correlation.tableId, 'tbl-1')
  assert.equal(d.facts.delta, 10)
  assert.equal(d.facts.integrity, 'CONSERVATION_MISMATCH')
})

// ── Duplicate active hand (the invariant NOT backed by a DB unique constraint) ────────────────────
test('detectDuplicateActiveHands flags >1 live hand per table, ignores terminal/singletons', () => {
  const rows = [
    { tableKey: 'cash:A', live: true, tableId: 'A' },
    { tableKey: 'cash:A', live: true, tableId: 'A' }, // duplicate live at A
    { tableKey: 'cash:B', live: true, tableId: 'B' }, // single live at B → ok
    { tableKey: 'cash:C', live: false, tableId: 'C' },
    { tableKey: 'cash:C', live: false, tableId: 'C' }, // both terminal → ignored
  ]
  const out = detectDuplicateActiveHands(rows, SRC)
  assert.equal(out.length, 1)
  assert.equal(out[0].code, 'PKR_SEV1_DUPLICATE_ACTIVE_HAND')
  assert.equal(out[0].facts.liveHands, 2)
  assert.equal(out[0].correlation.tableId, 'A')
})

// ── Duplicate payout / refund (DB-prevented by UNIQUE(tournament_id,entry_id,kind); tripwire) ─────
test('detectDuplicatePayouts flags duplicate prize AND refund rows independently', () => {
  const rows = [
    { tournamentId: 'T1', entryId: 'E1', kind: 'prize' },
    { tournamentId: 'T1', entryId: 'E1', kind: 'prize' },  // dup prize
    { tournamentId: 'T1', entryId: 'E2', kind: 'refund' },
    { tournamentId: 'T1', entryId: 'E2', kind: 'refund' }, // dup refund
    { tournamentId: 'T1', entryId: 'E3', kind: 'prize' },  // single → ok
  ]
  const out = detectDuplicatePayouts(rows, SRC)
  const codes = out.map((d) => d.code).sort()
  assert.deepEqual(codes, ['PKR_SEV1_DUPLICATE_PAYOUT', 'PKR_SEV1_DUPLICATE_REFUND'])
})

// ── Duplicate accepted action (DB-prevented by UNIQUE(hand_id,action_seq); tripwire) ──────────────
test('detectDuplicateActions flags duplicate (hand_id, action_seq)', () => {
  const rows = [
    { handId: 'H1', actionSeq: 1, seatIndex: 0, userId: 'u1' },
    { handId: 'H1', actionSeq: 1, seatIndex: 0, userId: 'u1' }, // duplicate accepted action
    { handId: 'H1', actionSeq: 2, seatIndex: 1, userId: 'u2' }, // ok
  ]
  const out = detectDuplicateActions(rows, SRC)
  assert.equal(out.length, 1)
  assert.equal(out[0].code, 'PKR_SEV1_DUPLICATE_ACTION')
  assert.equal(out[0].facts.actionSeq, 1)
})

// ── Cross-user action ─────────────────────────────────────────────────────────────────────────
test('detectCrossUserActions flags an action whose user does not own the seat; ignores server actions', () => {
  const seating = [
    { handId: 'H1', seatIndex: 0, userId: 'alice' },
    { handId: 'H1', seatIndex: 1, userId: 'bob' },
  ]
  const actions = [
    { handId: 'H1', actionSeq: 1, seatIndex: 0, userId: 'alice' },  // ok — owns seat 0
    { handId: 'H1', actionSeq: 2, seatIndex: 1, userId: 'alice' },  // CROSS-USER — alice acting on bob's seat
    { handId: 'H1', actionSeq: 3, seatIndex: 1, userId: null },     // server/timeout — ignored
  ]
  const out = detectCrossUserActions(actions, seating, SRC)
  assert.equal(out.length, 1)
  assert.equal(out[0].code, 'PKR_SEV1_CROSS_USER_ACTION')
  assert.equal(out[0].facts.seatIndex, 1)
})

test('clean data produces no detections at all (no false SEV-1)', () => {
  assert.equal(detectDuplicateActiveHands([{ tableKey: 'A', live: true, tableId: 'A' }], SRC).length, 0)
  assert.equal(detectDuplicatePayouts([{ tournamentId: 'T', entryId: 'E', kind: 'prize' }], SRC).length, 0)
  assert.equal(detectDuplicateActions([{ handId: 'H', actionSeq: 1, seatIndex: 0, userId: 'u' }], SRC).length, 0)
  assert.equal(detectCrossUserActions(
    [{ handId: 'H', actionSeq: 1, seatIndex: 0, userId: 'u' }],
    [{ handId: 'H', seatIndex: 0, userId: 'u' }], SRC,
  ).length, 0)
})
