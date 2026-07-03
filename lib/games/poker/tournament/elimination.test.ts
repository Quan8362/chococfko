import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  assignPlacesForHand,
  assignFinishingOrder,
  placeMultiplicity,
  type BustedPlayer,
  type HandBustEvent,
} from './elimination.ts'

test('TNMT-ELIM-011 single bust gets the worst remaining place', () => {
  const recs = assignPlacesForHand(5, [{ entryId: 'a', userId: 'ua', chipsAtHandStart: 100 }])
  assert.equal(recs.length, 1)
  assert.equal(recs[0].finishingPlace, 5)
  assert.equal(recs[0].tied, false)
})

test('TNMT-ELIM-003 simultaneous busts ordered by chips at hand start', () => {
  const busted: BustedPlayer[] = [
    { entryId: 'a', userId: 'ua', chipsAtHandStart: 50 },
    { entryId: 'b', userId: 'ub', chipsAtHandStart: 300 },
    { entryId: 'c', userId: 'uc', chipsAtHandStart: 100 },
  ]
  // 6 remained; 3 bust → they occupy places 4,5,6. More chips → better (lower) place.
  const recs = assignPlacesForHand(6, busted)
  const byEntry = Object.fromEntries(recs.map((r) => [r.entryId, r.finishingPlace]))
  assert.equal(byEntry.b, 4) // 300 chips → best of the busted
  assert.equal(byEntry.c, 5) // 100
  assert.equal(byEntry.a, 6) // 50 → first out
  assert.ok(recs.every((r) => !r.tied))
})

test('TNMT-PAY-026 true tie (equal chips) shares one place', () => {
  const busted: BustedPlayer[] = [
    { entryId: 'a', userId: 'ua', chipsAtHandStart: 100 },
    { entryId: 'b', userId: 'ub', chipsAtHandStart: 100 },
    { entryId: 'c', userId: 'uc', chipsAtHandStart: 40 },
  ]
  const recs = assignPlacesForHand(6, busted)
  const a = recs.find((r) => r.entryId === 'a')!
  const b = recs.find((r) => r.entryId === 'b')!
  const c = recs.find((r) => r.entryId === 'c')!
  assert.equal(a.finishingPlace, 4)
  assert.equal(b.finishingPlace, 4) // tie shares place 4 (absorbs place 5)
  assert.ok(a.tied && b.tied)
  assert.equal(c.finishingPlace, 6)
  assert.equal(c.tied, false)
  const mult = placeMultiplicity(recs)
  assert.equal(mult.get(4), 2)
  assert.equal(mult.get(6), 1)
})

test('a bust can never take the whole remaining field', () => {
  assert.throws(() => assignPlacesForHand(2, [
    { entryId: 'a', userId: 'ua', chipsAtHandStart: 1 },
    { entryId: 'b', userId: 'ub', chipsAtHandStart: 1 },
  ]))
})

test('TNMT-ELIM-012 full finishing order: winner=1, unique places, no gaps', () => {
  // 6-player tournament collapsing over several hands.
  const events: HandBustEvent[] = [
    { handNo: 5, remainingBefore: 6, busted: [{ entryId: 'f', userId: 'uf', chipsAtHandStart: 10 }] },   // 6th
    { handNo: 9, remainingBefore: 5, busted: [{ entryId: 'e', userId: 'ue', chipsAtHandStart: 20 }] },   // 5th
    { handNo: 14, remainingBefore: 4, busted: [
      { entryId: 'd', userId: 'ud', chipsAtHandStart: 30 },
      { entryId: 'c', userId: 'uc', chipsAtHandStart: 80 },
    ] }, // c=3rd, d=4th
    { handNo: 20, remainingBefore: 2, busted: [{ entryId: 'b', userId: 'ub', chipsAtHandStart: 100 }] }, // 2nd
  ]
  const order = assignFinishingOrder(events, { entryId: 'a', userId: 'ua' })
  const places = order.map((r) => r.finishingPlace)
  assert.deepEqual(places, [1, 2, 3, 4, 5, 6])
  assert.equal(order[0].entryId, 'a') // winner
  assert.equal(order.find((r) => r.entryId === 'c')!.finishingPlace, 3)
  assert.equal(order.find((r) => r.entryId === 'd')!.finishingPlace, 4)
  // totality: 6 distinct entries
  assert.equal(new Set(order.map((r) => r.entryId)).size, 6)
})
