// Unit tests for the pure poker coin-integrity invariant checker.
// Run with:  node --test lib/games/poker/coinIntegrity.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkHandCoinIntegrity,
  checkLedgerConservation,
  mergeIntegrityReports,
  type HandIntegrityInput,
} from './coinIntegrity.ts'

function conservedHand(over: Partial<HandIntegrityInput> = {}): HandIntegrityInput {
  // 3 seats each put in 100 (pot 300); seat 0 wins the whole pot.
  return {
    tableId: 't1', handId: 'h1',
    contributions: [{ seatIndex: 0, contributed: 100 }, { seatIndex: 1, contributed: 100 }, { seatIndex: 2, contributed: 100 }],
    declaredPotTotal: 300,
    payouts: [{ seatIndex: 0, amount: 300 }],
    refunds: [],
    authoritativeTotalContributed: 300,
    settlementRowCount: 1,
    ...over,
  }
}

test('a conserved hand passes with no violations', () => {
  const r = checkHandCoinIntegrity(conservedHand())
  assert.equal(r.ok, true)
  assert.equal(r.violations.length, 0)
  assert.equal(r.worst, null)
})

test('conservation mismatch: payouts exceed contributions (coins created)', () => {
  const r = checkHandCoinIntegrity(conservedHand({ payouts: [{ seatIndex: 0, amount: 400 }] }))
  assert.equal(r.ok, false)
  const codes = r.violations.map((v) => v.code)
  assert.ok(codes.includes('CONSERVATION_MISMATCH'))
  const v = r.violations.find((x) => x.code === 'CONSERVATION_MISMATCH')!
  assert.equal(v.severity, 'critical')
  assert.equal(v.evidence.delta, 100)
  // Correlation ids ride along for the incident.
  assert.equal(v.correlation.handId, 'h1')
})

test('pot construction mismatch: declared pot != sum contributions', () => {
  const r = checkHandCoinIntegrity(conservedHand({ declaredPotTotal: 250 }))
  assert.ok(r.violations.some((v) => v.code === 'POT_CONSTRUCTION_MISMATCH'))
})

test('non-integer and negative coin values are critical violations', () => {
  const bad = checkHandCoinIntegrity(conservedHand({ payouts: [{ seatIndex: 0, amount: 300.5 }] }))
  assert.ok(bad.violations.some((v) => v.code === 'NON_INTEGER_VALUE'))
  const neg = checkHandCoinIntegrity(conservedHand({
    contributions: [{ seatIndex: 0, contributed: -100 }, { seatIndex: 1, contributed: 200 }, { seatIndex: 2, contributed: 200 }],
  }))
  assert.ok(neg.violations.some((v) => v.code === 'NEGATIVE_VALUE'))
})

test('duplicate settlement rows are flagged (idempotency breach)', () => {
  const r = checkHandCoinIntegrity(conservedHand({ settlementRowCount: 2 }))
  assert.ok(r.violations.some((v) => v.code === 'DUPLICATE_SETTLEMENT'))
})

test('payout to ineligible seat flagged when eligibility supplied', () => {
  const r = checkHandCoinIntegrity(conservedHand({ eligibleSeatIndexes: [1, 2] }))
  const v = r.violations.find((x) => x.code === 'PAYOUT_TO_INELIGIBLE_SEAT')
  assert.ok(v)
  assert.equal(v!.severity, 'high')
  assert.equal(v!.evidence.seatIndex, 0)
})

test('evidence never carries card-shaped data — numbers/ids only', () => {
  const r = checkHandCoinIntegrity(conservedHand({ payouts: [{ seatIndex: 0, amount: 400 }] }))
  const line = JSON.stringify(r.violations)
  assert.ok(!/[2-9TJQKA][cdhs]"/.test(line), 'no card tokens in evidence')
})

test('ledger conservation: balance must equal start + delta', () => {
  assert.equal(checkLedgerConservation({ startingBalance: 1000, ledgerDelta: -200, currentBalance: 800 }).ok, true)
  const bad = checkLedgerConservation({ startingBalance: 1000, ledgerDelta: -200, currentBalance: 900 })
  assert.equal(bad.ok, false)
  assert.ok(bad.violations.some((v) => v.code === 'LEDGER_IMBALANCE'))
  const neg = checkLedgerConservation({ startingBalance: 100, ledgerDelta: -300, currentBalance: -200 })
  assert.ok(neg.violations.some((v) => v.code === 'NEGATIVE_VALUE'))
})

test('mergeIntegrityReports: worst severity wins', () => {
  const a = checkHandCoinIntegrity(conservedHand())
  const b = checkHandCoinIntegrity(conservedHand({ payouts: [{ seatIndex: 0, amount: 400 }] }))
  const merged = mergeIntegrityReports([a, b])
  assert.equal(merged.ok, false)
  assert.equal(merged.worst, 'critical')
})
