// node --test lib/planning.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moveItem, analyzePlan, type PlanStopInput } from './planning.ts'

test('moveItem reorders immutably and is bounds-safe', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a'])
  assert.deepEqual(moveItem(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b'])
  assert.deepEqual(moveItem(['a', 'b'], 0, 5), ['a', 'b']) // out of range → unchanged copy
})

const HAKATA = { lat: 33.5902, lng: 130.4203 }
const ITOSHIMA = { lat: 33.556, lng: 130.19 } // ~21 km west

test('structural warnings: missing coords, temp closure, reservation, not verified', () => {
  const stops: PlanStopInput[] = [{
    slug: 'x', temporaryStatus: 'temporarily_closed', reservationRequired: true,
    verificationStatus: 'unverified', openingHours: null,
  }]
  const a = analyzePlan(stops)
  const w = a.stops[0].warnings
  assert.ok(w.includes('missing_coordinates'))
  assert.ok(w.includes('temporarily_closed'))
  assert.ok(w.includes('reservation_required'))
  assert.ok(w.includes('not_verified_recently'))
  assert.ok(w.includes('hours_unknown'))
})

test('opening-hour conflict: closed on the planned day vs arrival outside hours', () => {
  const open = { mon: [{ open: '09:00', close: '18:00' }], sun: [] }
  // 2024-01-07 is a Sunday → sun=[] → closed_on_day
  const sun = analyzePlan([{ slug: 's', ...HAKATA, openingHours: open, arrivalTime: '10:00' }], { planDate: '2024-01-07' })
  assert.ok(sun.stops[0].warnings.includes('closed_on_day'))
  // 2024-01-08 is Monday, arrive 20:00 → outside 09–18 → arrival_outside_hours
  const late = analyzePlan([{ slug: 's', ...HAKATA, openingHours: open, arrivalTime: '20:00' }], { planDate: '2024-01-08' })
  assert.ok(late.stops[0].warnings.includes('arrival_outside_hours'))
  // Monday 10:00 → within hours → no hour warning
  const ok = analyzePlan([{ slug: 's', ...HAKATA, openingHours: open, arrivalTime: '10:00', verificationStatus: 'verified', lastVerifiedAt: new Date().toISOString() }], { planDate: '2024-01-08' })
  assert.ok(!ok.stops[0].warnings.includes('arrival_outside_hours'))
  assert.ok(!ok.stops[0].warnings.includes('closed_on_day'))
})

test('time overlap warning between consecutive stops', () => {
  const stops: PlanStopInput[] = [
    { slug: 'a', ...HAKATA, departureTime: '12:00' },
    { slug: 'b', ...HAKATA, arrivalTime: '11:30' }, // arrives before previous departs
  ]
  const a = analyzePlan(stops)
  assert.equal(a.stops[1].overlapsWithPrev, true)
  assert.ok(a.planWarnings.includes('time_overlap'))
})

test('straight-line distance + large_distance plan warning', () => {
  const stops: PlanStopInput[] = [{ slug: 'a', ...HAKATA }, { slug: 'b', ...ITOSHIMA }]
  const a = analyzePlan(stops, { largeDistanceKm: 15 })
  assert.equal(a.stops[0].distanceFromPrevKm, null)
  assert.ok((a.stops[1].distanceFromPrevKm ?? 0) > 15)
  assert.ok(a.planWarnings.includes('large_distance'))
})
