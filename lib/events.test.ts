// node --test lib/events.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  type PlaceEvent, isExpired, isToday, isThisWeekend, isUpcoming, isFree,
  eventBucket, filterEvents, sortEvents, weekendRange, startsSoon,
} from './events.ts'

// 2026-06-22 is a Monday. now = 12:00 JST Monday (03:00 UTC).
const NOW = new Date(Date.UTC(2026, 5, 22, 3, 0))

const ev = (over: Partial<PlaceEvent>): PlaceEvent => ({
  id: 'x', slug: null, title: 't', description: null, placeSlug: null,
  venue: null, area: null, prefecture: null,
  startsAt: '2026-06-22T05:00:00Z', endsAt: '2026-06-22T08:00:00Z',
  priceType: null, priceMin: null, priceMax: null, currency: null,
  sourceUrl: null, registrationUrl: null, lastVerifiedAt: null,
  status: 'published', isCancelled: false, ...over,
})

test('weekendRange from a Monday points at the upcoming Sat/Sun', () => {
  const { satDay, sunDay } = weekendRange(NOW)
  // 2026-06-27 Sat, 2026-06-28 Sun
  assert.equal(sunDay - satDay, 1)
  const satMs = satDay * 86_400_000 - 9 * 3_600_000
  assert.equal(new Date(satMs + 12 * 3_600_000).getUTCDate(), 27)
})

test('isToday: event later today (JST) is today; expired one is not', () => {
  assert.equal(isToday(ev({ startsAt: '2026-06-22T05:00:00Z', endsAt: '2026-06-22T08:00:00Z' }), NOW), true)
  assert.equal(isToday(ev({ startsAt: '2026-06-21T05:00:00Z', endsAt: '2026-06-21T08:00:00Z' }), NOW), false)
})

test('JST calendar boundary: 23:30 JST is today, 00:30 JST next day is not', () => {
  // 2026-06-22T14:30Z = 23:30 JST Mon (today)
  assert.equal(isToday(ev({ startsAt: '2026-06-22T14:30:00Z', endsAt: '2026-06-22T15:00:00Z' }), NOW), true)
  // 2026-06-22T15:30Z = 00:30 JST Tue (not today, but upcoming)
  const next = ev({ startsAt: '2026-06-22T15:30:00Z', endsAt: '2026-06-22T16:00:00Z' })
  assert.equal(isToday(next, NOW), false)
  assert.equal(isUpcoming(next, NOW), true)
})

test('isExpired / isUpcoming are instant-based', () => {
  const past = ev({ startsAt: '2026-06-20T00:00:00Z', endsAt: '2026-06-21T10:00:00Z' })
  assert.equal(isExpired(past, NOW), true)
  assert.equal(isUpcoming(past, NOW), false)
  const future = ev({ startsAt: '2026-07-10T00:00:00Z', endsAt: '2026-07-10T03:00:00Z' })
  assert.equal(isExpired(future, NOW), false)
  assert.equal(isUpcoming(future, NOW), true)
})

test('single-instant event (no end) expires after its start', () => {
  const e = ev({ startsAt: '2026-06-22T02:00:00Z', endsAt: null }) // 11:00 JST, before now
  assert.equal(isExpired(e, NOW), true)
})

test('isThisWeekend matches Sat events, not weekday ones', () => {
  assert.equal(isThisWeekend(ev({ startsAt: '2026-06-27T02:00:00Z', endsAt: '2026-06-27T05:00:00Z' }), NOW), true)
  assert.equal(isThisWeekend(ev({ startsAt: '2026-06-24T02:00:00Z', endsAt: '2026-06-24T05:00:00Z' }), NOW), false)
})

test('eventBucket classifies past/today/weekend/upcoming', () => {
  assert.equal(eventBucket(ev({ startsAt: '2026-06-20T00:00:00Z', endsAt: '2026-06-21T00:00:00Z' }), NOW), 'past')
  assert.equal(eventBucket(ev({ startsAt: '2026-06-22T05:00:00Z', endsAt: '2026-06-22T08:00:00Z' }), NOW), 'today')
  assert.equal(eventBucket(ev({ startsAt: '2026-06-27T02:00:00Z', endsAt: '2026-06-27T05:00:00Z' }), NOW), 'weekend')
  assert.equal(eventBucket(ev({ startsAt: '2026-07-10T00:00:00Z', endsAt: '2026-07-10T03:00:00Z' }), NOW), 'upcoming')
})

test('isFree: by priceType or zero price', () => {
  assert.equal(isFree(ev({ priceType: 'free' })), true)
  assert.equal(isFree(ev({ priceType: null, priceMin: 0, priceMax: 0 })), true)
  assert.equal(isFree(ev({ priceType: 'paid', priceMin: 1000 })), false)
})

test('filterEvents drops expired by default; view + free + prefecture compose', () => {
  const list = [
    ev({ id: 'past', startsAt: '2026-06-20T00:00:00Z', endsAt: '2026-06-21T00:00:00Z' }),
    ev({ id: 'today-free', startsAt: '2026-06-22T05:00:00Z', endsAt: '2026-06-22T08:00:00Z', priceType: 'free', prefecture: 'fukuoka' }),
    ev({ id: 'today-paid', startsAt: '2026-06-22T06:00:00Z', endsAt: '2026-06-22T09:00:00Z', priceType: 'paid', priceMin: 500, prefecture: 'tokyo' }),
    ev({ id: 'weekend', startsAt: '2026-06-27T02:00:00Z', endsAt: '2026-06-27T05:00:00Z' }),
  ]
  assert.deepEqual(filterEvents(list, { view: 'today', now: NOW }).map((e) => e.id), ['today-free', 'today-paid'])
  assert.deepEqual(filterEvents(list, { view: 'today', free: true, now: NOW }).map((e) => e.id), ['today-free'])
  assert.deepEqual(filterEvents(list, { view: 'all', prefecture: 'tokyo', now: NOW }).map((e) => e.id), ['today-paid'])
  assert.deepEqual(filterEvents(list, { view: 'weekend', now: NOW }).map((e) => e.id), ['weekend'])
  // upcoming view = every non-expired
  assert.equal(filterEvents(list, { view: 'upcoming', now: NOW }).length, 3)
  // includePast surfaces the expired one
  assert.equal(filterEvents(list, { view: 'all', includePast: true, now: NOW }).length, 4)
})

test('sortEvents: soonest first, cancelled sinks at equal start', () => {
  const a = ev({ id: 'a', startsAt: '2026-06-27T02:00:00Z' })
  const b = ev({ id: 'b', startsAt: '2026-06-22T05:00:00Z' })
  const c = ev({ id: 'c', startsAt: '2026-06-22T05:00:00Z', isCancelled: true })
  assert.deepEqual(sortEvents([a, b, c]).map((e) => e.id), ['b', 'c', 'a'])
})

test('startsSoon: within window, not cancelled, published only', () => {
  const soon = ev({ startsAt: '2026-06-22T03:30:00Z' }) // 30 min after now
  assert.equal(startsSoon(soon, 60, NOW), true)
  assert.equal(startsSoon(soon, 15, NOW), false)
  assert.equal(startsSoon(ev({ startsAt: '2026-06-22T03:30:00Z', isCancelled: true }), 60, NOW), false)
  assert.equal(startsSoon(ev({ startsAt: '2026-06-22T03:30:00Z', status: 'draft' }), 60, NOW), false)
})
