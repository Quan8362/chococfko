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

// ── Uncalled-bet-return regression suite (27G-M1B) ──────────────────────────────────────────────
// Legitimate uncalled returns make GROSS contributions exceed the contested pot. The detector must
// treat the return as explicit money movement and NOT alert, while still catching genuine breaches.
const codesOf = (r: ReturnType<typeof checkHandCoinIntegrity>) => r.violations.map((v) => v.code)

test('1. raise / partial call / fold with a legitimate uncalled return — no alert', () => {
  // seat0 raises to 300, seat1 (short) is in for 200 then folds → 100 uncalled back to seat0.
  const r = checkHandCoinIntegrity({
    tableId: 't', handId: 'h',
    contributions: [{ seatIndex: 0, contributed: 300 }, { seatIndex: 1, contributed: 200 }],
    declaredPotTotal: 400,
    payouts: [{ seatIndex: 0, amount: 400 }],
    refunds: [{ seatIndex: 0, amount: 100 }],
    authoritativeTotalContributed: 500,
    settlementRowCount: 1,
  })
  assert.equal(r.ok, true, JSON.stringify(r.violations))
})

test('2. heads-up raise/fold with returned excess — no alert', () => {
  const r = checkHandCoinIntegrity({
    contributions: [{ seatIndex: 0, contributed: 500 }, { seatIndex: 1, contributed: 100 }],
    declaredPotTotal: 200,
    payouts: [{ seatIndex: 0, amount: 200 }],
    refunds: [{ seatIndex: 0, amount: 400 }],
    authoritativeTotalContributed: 600,
    settlementRowCount: 1,
  })
  assert.equal(r.ok, true, JSON.stringify(r.violations))
})

test('3. preflop uncalled raise (everyone folds to the raiser) — no alert', () => {
  // BB 100, SB 50; seat0 raises to 300, seat1 folds having only posted 50 → 250 uncalled to seat0.
  const r = checkHandCoinIntegrity({
    contributions: [{ seatIndex: 0, contributed: 300 }, { seatIndex: 1, contributed: 50 }],
    declaredPotTotal: 100,
    payouts: [{ seatIndex: 0, amount: 100 }],
    refunds: [{ seatIndex: 0, amount: 250 }],
    authoritativeTotalContributed: 350,
    settlementRowCount: 1,
  })
  assert.equal(r.ok, true, JSON.stringify(r.violations))
})

test('4. all-in with a main pot and a side pot — no alert', () => {
  // seat0 all-in 100; seat1 & seat2 each 300 and go to showdown (top matched → no return).
  const r = checkHandCoinIntegrity({
    contributions: [{ seatIndex: 0, contributed: 100 }, { seatIndex: 1, contributed: 300 }, { seatIndex: 2, contributed: 300 }],
    declaredPotTotal: 700, // main 300 (0,1,2) + side 400 (1,2)
    payouts: [{ seatIndex: 1, amount: 300 }, { seatIndex: 2, amount: 400 }],
    refunds: [],
    authoritativeTotalContributed: 700,
    settlementRowCount: 1,
  })
  assert.equal(r.ok, true, JSON.stringify(r.violations))
})

test('5. multiple side pots with a valid uncalled return — no alert', () => {
  // seat0 100 all-in, seat1 250 all-in, seat2 400 bet uncalled by anyone above 250 → 150 back.
  const contributions = [{ seatIndex: 0, contributed: 100 }, { seatIndex: 1, contributed: 250 }, { seatIndex: 2, contributed: 400 }]
  // effective after 150 return to seat2: 100/250/250 → main 300 (0,1,2) + side 300 (1,2) = 600
  const r = checkHandCoinIntegrity({
    contributions,
    declaredPotTotal: 600,
    payouts: [{ seatIndex: 2, amount: 600 }],
    refunds: [{ seatIndex: 2, amount: 150 }],
    authoritativeTotalContributed: 750,
    settlementRowCount: 1,
  })
  assert.equal(r.ok, true, JSON.stringify(r.violations))
})

test('6. gross > pot ONLY because of a valid return — no alert', () => {
  const r = checkHandCoinIntegrity({
    contributions: [{ seatIndex: 0, contributed: 300 }, { seatIndex: 1, contributed: 200 }],
    declaredPotTotal: 400,
    payouts: [{ seatIndex: 1, amount: 400 }],
    refunds: [{ seatIndex: 0, amount: 100 }],
    authoritativeTotalContributed: 500,
    settlementRowCount: 1,
  })
  assert.equal(r.ok, true, JSON.stringify(r.violations))
})

test('7. declared pot smaller with NO valid return — SEV-1 pot construction', () => {
  // Both matched at 200 (no uncalled), but pot understated as 300.
  const r = checkHandCoinIntegrity({
    contributions: [{ seatIndex: 0, contributed: 200 }, { seatIndex: 1, contributed: 200 }],
    declaredPotTotal: 300,
    payouts: [{ seatIndex: 0, amount: 300 }],
    refunds: [],
    authoritativeTotalContributed: 400,
    settlementRowCount: 1,
  })
  assert.equal(r.ok, false)
  assert.ok(codesOf(r).includes('POT_CONSTRUCTION_MISMATCH'))
})

test('8. incorrect return amount — SEV-1 uncalled-return mismatch', () => {
  // Real return is 100; settlement claims 150.
  const r = checkHandCoinIntegrity({
    contributions: [{ seatIndex: 0, contributed: 300 }, { seatIndex: 1, contributed: 200 }],
    declaredPotTotal: 400,
    payouts: [{ seatIndex: 0, amount: 400 }],
    refunds: [{ seatIndex: 0, amount: 150 }],
    authoritativeTotalContributed: 500,
    settlementRowCount: 1,
  })
  assert.equal(r.ok, false)
  assert.ok(codesOf(r).includes('UNCALLED_RETURN_MISMATCH'))
})

test('9. duplicate return / refund rows — SEV-1 uncalled-return mismatch', () => {
  const r = checkHandCoinIntegrity({
    contributions: [{ seatIndex: 0, contributed: 300 }, { seatIndex: 1, contributed: 200 }],
    declaredPotTotal: 400,
    payouts: [{ seatIndex: 0, amount: 400 }],
    refunds: [{ seatIndex: 0, amount: 100 }, { seatIndex: 0, amount: 100 }],
    authoritativeTotalContributed: 500,
    settlementRowCount: 1,
  })
  assert.equal(r.ok, false)
  assert.ok(codesOf(r).includes('UNCALLED_RETURN_MISMATCH'))
})

test('9b. return attributed to the WRONG seat — SEV-1 uncalled-return mismatch', () => {
  const r = checkHandCoinIntegrity({
    contributions: [{ seatIndex: 0, contributed: 300 }, { seatIndex: 1, contributed: 200 }],
    declaredPotTotal: 400,
    payouts: [{ seatIndex: 0, amount: 400 }],
    refunds: [{ seatIndex: 1, amount: 100 }], // should be seat 0
    authoritativeTotalContributed: 500,
    settlementRowCount: 1,
  })
  assert.equal(r.ok, false)
  assert.ok(codesOf(r).includes('UNCALLED_RETURN_MISMATCH'))
})

test('10. payout total != contested pots — SEV-1 conservation', () => {
  const r = checkHandCoinIntegrity({
    contributions: [{ seatIndex: 0, contributed: 300 }, { seatIndex: 1, contributed: 200 }],
    declaredPotTotal: 400,
    payouts: [{ seatIndex: 0, amount: 350 }], // 50 short of the 400 contested pot
    refunds: [{ seatIndex: 0, amount: 100 }],
    authoritativeTotalContributed: 500,
    settlementRowCount: 1,
  })
  assert.equal(r.ok, false)
  assert.ok(codesOf(r).includes('CONSERVATION_MISMATCH'))
})

test('11. contribution / settlement conservation failure — SEV-1', () => {
  // Gross reconstructed (500) disagrees with the authoritative settlement total (450).
  const r = checkHandCoinIntegrity({
    contributions: [{ seatIndex: 0, contributed: 300 }, { seatIndex: 1, contributed: 200 }],
    declaredPotTotal: 400,
    payouts: [{ seatIndex: 0, amount: 400 }],
    refunds: [{ seatIndex: 0, amount: 100 }],
    authoritativeTotalContributed: 450,
    settlementRowCount: 1,
  })
  assert.equal(r.ok, false)
  assert.ok(codesOf(r).includes('SETTLEMENT_RECONCILE_MISMATCH'))
})

test('12. the exact investigated production hand shape — no false positive', () => {
  // 499c60ec…: BB100 seat0, SB50→raise200→fold seat1, seat0 raise to 300. gross 500, pot 400,
  // uncalled 100 → seat0, payout 400 → seat0.
  const r = checkHandCoinIntegrity({
    tableId: '18b92b66-6108-4484-8447-a0dc5d771def',
    handId: '499c60ec-2109-474f-b3b5-86fb441494fb',
    contributions: [{ seatIndex: 0, contributed: 300 }, { seatIndex: 1, contributed: 200 }],
    declaredPotTotal: 400,
    payouts: [{ seatIndex: 0, amount: 400 }],
    refunds: [{ seatIndex: 0, amount: 100 }],
    authoritativeTotalContributed: 500,
    settlementRowCount: 1,
  })
  assert.equal(r.ok, true, JSON.stringify(r.violations))
  assert.equal(r.worst, null)
})

test('13. a valid hand with no return still passes (no phantom refund tolerated)', () => {
  // Sanity: supplying a refund when none is due IS flagged (nothing was uncalled).
  const phantom = checkHandCoinIntegrity({
    contributions: [{ seatIndex: 0, contributed: 200 }, { seatIndex: 1, contributed: 200 }],
    declaredPotTotal: 400,
    payouts: [{ seatIndex: 0, amount: 400 }],
    refunds: [{ seatIndex: 0, amount: 50 }],
    authoritativeTotalContributed: 400,
    settlementRowCount: 1,
  })
  assert.equal(phantom.ok, false)
  assert.ok(codesOf(phantom).includes('UNCALLED_RETURN_MISMATCH'))
})

test('15. cash and tournament data shapes are handled identically', () => {
  // The checker is game-agnostic: the same economic snapshot (contributions/pot/payouts/return)
  // is produced by both cash settlement and a tournament hand. A tournament heads-up all-in with a
  // legitimate uncalled return must pass exactly as the cash equivalent does.
  const snapshot = {
    contributions: [{ seatIndex: 3, contributed: 1500 }, { seatIndex: 5, contributed: 1000 }],
    declaredPotTotal: 2000,
    payouts: [{ seatIndex: 3, amount: 2000 }],
    refunds: [{ seatIndex: 3, amount: 500 }],
    authoritativeTotalContributed: 2500,
    settlementRowCount: 1,
  }
  const cash = checkHandCoinIntegrity({ tableId: 'cash-table', handId: 'cash-hand', ...snapshot })
  const tourney = checkHandCoinIntegrity({ tableId: 'tnmt:abc:2', handId: 'tnmt-hand', ...snapshot })
  assert.equal(cash.ok, true, JSON.stringify(cash.violations))
  assert.equal(tourney.ok, true, JSON.stringify(tourney.violations))
})

test('14. evidence for uncalled-return hands carries numbers/ids only — no card tokens', () => {
  const r = checkHandCoinIntegrity({
    tableId: 't', handId: 'h',
    contributions: [{ seatIndex: 0, contributed: 300 }, { seatIndex: 1, contributed: 200 }],
    declaredPotTotal: 400,
    payouts: [{ seatIndex: 0, amount: 350 }],
    refunds: [{ seatIndex: 0, amount: 150 }],
    authoritativeTotalContributed: 500,
    settlementRowCount: 1,
  })
  const line = JSON.stringify(r.violations)
  assert.ok(!/[2-9TJQKA][cdhs]"/.test(line), 'no card tokens in evidence')
  assert.ok(!/@/.test(line), 'no email in evidence')
  for (const v of r.violations) {
    for (const val of Object.values(v.evidence)) {
      assert.ok(typeof val === 'number' || typeof val === 'string')
    }
  }
})
