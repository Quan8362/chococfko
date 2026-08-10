import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectPromoActivities } from './promo.ts'
import type { PublicTournamentListItem, TournamentPhase } from './types.ts'

function item(over: Partial<PublicTournamentListItem>): PublicTournamentListItem {
  return {
    slug: over.slug ?? 'slug',
    name: over.name ?? 'Giải đấu',
    status: over.status ?? 'published',
    startsAt: over.startsAt ?? null,
    endsAt: over.endsAt ?? null,
    location: over.location ?? null,
    eventCount: over.eventCount ?? 0,
    phase: over.phase ?? 'upcoming',
    createdAt: over.createdAt ?? null,
    homePromoEnabled: over.homePromoEnabled ?? false,
  }
}

const slugs = (items: PublicTournamentListItem[]) => items.map((i) => i.slug)

test('promo flag false → excluded even when ongoing/upcoming', () => {
  const out = selectPromoActivities([
    item({ slug: 'live', phase: 'ongoing', homePromoEnabled: false }),
    item({ slug: 'soon', phase: 'upcoming', homePromoEnabled: false }),
  ])
  assert.deepEqual(out, [])
})

test('promo flag true + upcoming → included', () => {
  const out = selectPromoActivities([item({ slug: 'soon', phase: 'upcoming', homePromoEnabled: true })])
  assert.deepEqual(slugs(out), ['soon'])
})

test('promo flag true + ongoing → included', () => {
  const out = selectPromoActivities([item({ slug: 'live', phase: 'ongoing', homePromoEnabled: true })])
  assert.deepEqual(slugs(out), ['live'])
})

test('completed → never promoted even with the flag on', () => {
  const out = selectPromoActivities([
    item({ slug: 'done', phase: 'completed', status: 'completed', homePromoEnabled: true }),
    item({ slug: 'live', phase: 'ongoing', homePromoEnabled: true }),
  ])
  assert.deepEqual(slugs(out), ['live'])
})

test('multiple promoted → ongoing before upcoming, then soonest start', () => {
  const out = selectPromoActivities([
    item({ slug: 'up-late', phase: 'upcoming', startsAt: '2026-09-01T00:00:00Z', homePromoEnabled: true }),
    item({ slug: 'live-b', phase: 'ongoing', startsAt: '2026-08-10T00:00:00Z', homePromoEnabled: true }),
    item({ slug: 'up-soon', phase: 'upcoming', startsAt: '2026-08-20T00:00:00Z', homePromoEnabled: true }),
    item({ slug: 'live-a', phase: 'ongoing', startsAt: '2026-08-05T00:00:00Z', homePromoEnabled: true }),
  ])
  // ongoing (soonest first) then upcoming (soonest first).
  assert.deepEqual(slugs(out), ['live-a', 'live-b', 'up-soon', 'up-late'])
})

test('stable tie-break by slug when phase + start are equal', () => {
  const start = '2026-08-20T00:00:00Z'
  const out = selectPromoActivities([
    item({ slug: 'charlie', phase: 'upcoming', startsAt: start, homePromoEnabled: true }),
    item({ slug: 'alpha', phase: 'upcoming', startsAt: start, homePromoEnabled: true }),
    item({ slug: 'bravo', phase: 'upcoming', startsAt: start, homePromoEnabled: true }),
  ])
  assert.deepEqual(slugs(out), ['alpha', 'bravo', 'charlie'])
})

test('missing start date sinks below dated ones within the same phase', () => {
  const out = selectPromoActivities([
    item({ slug: 'no-date', phase: 'upcoming', startsAt: null, homePromoEnabled: true }),
    item({ slug: 'dated', phase: 'upcoming', startsAt: '2026-08-20T00:00:00Z', homePromoEnabled: true }),
  ])
  assert.deepEqual(slugs(out), ['dated', 'no-date'])
})

test('does not mutate the input array', () => {
  const input = [
    item({ slug: 'b', phase: 'upcoming', homePromoEnabled: true }),
    item({ slug: 'a', phase: 'ongoing', homePromoEnabled: true }),
  ]
  const before = slugs(input)
  selectPromoActivities(input)
  assert.deepEqual(slugs(input), before)
})
