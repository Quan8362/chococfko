import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  settlementKey,
  refundKey,
  settleFinal,
  settlePreStartRefund,
  settlePostStartCancellation,
  conservesAgainstFees,
} from './payout.ts'
import type { EliminationRecord, PayoutRecord } from './types.ts'
import type { PlacePrize } from './prizePool.ts'
import { TEMPLATE_STT_6MAX } from './config.ts'

function rec(entryId: string, place: number, tied = false): EliminationRecord {
  return { entryId, userId: `u_${entryId}`, finishingPlace: place, handNo: 0, chipsAtHandStart: 0, tied }
}

test('idempotency keys are stable per entry', () => {
  assert.equal(settlementKey('t1', 'e1'), 'settle:t1:e1')
  assert.equal(refundKey('t1', 'e1'), 'refund:t1:e1')
})

test('TNMT-PAY-012 settleFinal pays places + conserves', () => {
  const prizes: PlacePrize[] = [
    { place: 1, amount: 600 },
    { place: 2, amount: 400 },
  ]
  const records = [rec('a', 1), rec('b', 2), rec('c', 3), rec('d', 4)]
  const out = settleFinal(records, prizes)
  const byEntry = Object.fromEntries(out.map((r) => [r.entryId, r.amount]))
  assert.equal(byEntry.a, 600)
  assert.equal(byEntry.b, 400)
  assert.equal(byEntry.c, 0)
  assert.equal(byEntry.d, 0)
  assert.equal(out.reduce((s, r) => s + r.amount, 0), 1000)
})

test('TNMT-PAY-026 tie at a paid place splits the combined block prize', () => {
  const prizes: PlacePrize[] = [
    { place: 1, amount: 600 },
    { place: 2, amount: 400 },
  ]
  // b & c tie for 2nd → combined = prize[2] + prize[3] = 400 + 0 = 400 → 200 each.
  const records = [rec('a', 1), rec('b', 2, true), rec('c', 2, true), rec('d', 4)]
  const out = settleFinal(records, prizes)
  const byEntry = Object.fromEntries(out.map((r) => [r.entryId, r.amount]))
  assert.equal(byEntry.a, 600)
  assert.equal(byEntry.b, 200)
  assert.equal(byEntry.c, 200)
  assert.equal(out.reduce((s, r) => s + r.amount, 0), 1000)
})

test('tie with odd combined block → remainder to lower entryId', () => {
  const prizes: PlacePrize[] = [
    { place: 1, amount: 500 },
    { place: 2, amount: 301 }, // odd combined for a 2-way tie (301 + place3=0)
  ]
  const records = [rec('a', 1), rec('z', 2, true), rec('b', 2, true)]
  const out = settleFinal(records, prizes)
  const byEntry = Object.fromEntries(out.map((r) => [r.entryId, r.amount]))
  // 301 / 2 = 150 each + 1 remainder to lower entryId ('b' < 'z')
  assert.equal(byEntry.b, 151)
  assert.equal(byEntry.z, 150)
  assert.equal(out.reduce((s, r) => s + r.amount, 0), 801)
})

test('settleFinal throws if records do not conserve the pool', () => {
  const prizes: PlacePrize[] = [{ place: 1, amount: 1000 }]
  // No record at place 1 → 1000 unassigned → conservation error.
  assert.throws(() => settleFinal([rec('a', 2)], prizes))
})

test('TNMT-CANCEL-010 pre-start full refund conserves against fees', () => {
  const entries = [
    { entryId: 'e1', userId: 'u1' },
    { entryId: 'e2', userId: 'u2' },
    { entryId: 'e3', userId: 'u3' },
  ]
  const out = settlePreStartRefund(entries, TEMPLATE_STT_6MAX.entryFee)
  assert.equal(out.length, 3)
  assert.ok(out.every((r) => r.place === null && r.amount === TEMPLATE_STT_6MAX.entryFee))
  assert.ok(conservesAgainstFees(TEMPLATE_STT_6MAX, 3, out))
})

test('TNMT-CANCEL-020 post-start proportional split conserves', () => {
  // Pool 1000; one player already locked 400 for a made place; 3 live players split remaining 600
  // by chips 300/200/100 → 300/200/100.
  const locked: PayoutRecord[] = [{ entryId: 'made', userId: 'um', place: 2, amount: 400 }]
  const live = [
    { entryId: 'x', userId: 'ux', chips: 300 },
    { entryId: 'y', userId: 'uy', chips: 200 },
    { entryId: 'z', userId: 'uz', chips: 100 },
  ]
  const out = settlePostStartCancellation(1000, locked, live)
  const byEntry = Object.fromEntries(out.map((r) => [r.entryId, r.amount]))
  assert.equal(byEntry.made, 400)
  assert.equal(byEntry.x, 300)
  assert.equal(byEntry.y, 200)
  assert.equal(byEntry.z, 100)
  assert.equal(out.reduce((s, r) => s + r.amount, 0), 1000)
})

test('TNMT-CANCEL-022 proportional remainder goes to the largest stack', () => {
  // Pool 100, no locked; chips 2/1/1 → floors 50/25/25 = 100 exact; make it uneven: 1/1/1 of 100.
  const live = [
    { entryId: 'a', userId: 'ua', chips: 1 },
    { entryId: 'b', userId: 'ub', chips: 1 },
    { entryId: 'c', userId: 'uc', chips: 1 },
  ]
  const out = settlePostStartCancellation(100, [], live)
  const amounts = out.map((r) => r.amount).sort((a, b) => b - a)
  assert.deepEqual(amounts, [34, 33, 33]) // 100/3 = 33 each + 1 remainder to a stack
  assert.equal(out.reduce((s, r) => s + r.amount, 0), 100)
})

test('TNMT-CANCEL-023 single live player wins the remaining pool', () => {
  const locked: PayoutRecord[] = [{ entryId: 'made', userId: 'um', place: 2, amount: 400 }]
  const out = settlePostStartCancellation(1000, locked, [{ entryId: 'solo', userId: 'us', chips: 999 }])
  const byEntry = Object.fromEntries(out.map((r) => [r.entryId, r.amount]))
  assert.equal(byEntry.solo, 600)
  assert.equal(out.reduce((s, r) => s + r.amount, 0), 1000)
})

test('post-start cancellation rejects locked prizes exceeding pool', () => {
  assert.throws(() =>
    settlePostStartCancellation(100, [{ entryId: 'm', userId: 'um', place: 1, amount: 200 }], []),
  )
})
