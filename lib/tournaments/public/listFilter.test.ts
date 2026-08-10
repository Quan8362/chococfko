import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  filterAndSortTournaments,
  matchesQuery,
  normalizeText,
  phaseCounts,
  type DiscoveryItem,
} from './listFilter.ts'

function item(over: Partial<DiscoveryItem>): DiscoveryItem {
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
    dateLabel: over.dateLabel ?? '',
  }
}

test('normalizeText folds Vietnamese accents, đ and case', () => {
  assert.equal(normalizeText('Đà Nẵng'), 'da nang')
  assert.equal(normalizeText('  FÚKÙ  '), 'fuku')
  assert.equal(normalizeText('Giải Bóng Đá'), 'giai bong da')
})

test('matchesQuery matches name or location, accent/case-insensitive', () => {
  const it = item({ name: 'Giải Cầu Lông Mùa Hè', location: 'Đà Nẵng' })
  assert.ok(matchesQuery(it, ''), 'empty query matches everything')
  assert.ok(matchesQuery(it, '   '), 'whitespace query matches everything')
  assert.ok(matchesQuery(it, 'cau long'), 'matches name accent-insensitively')
  assert.ok(matchesQuery(it, 'DA NANG'), 'matches location accent/case-insensitively')
  assert.ok(!matchesQuery(it, 'bóng đá'), 'non-substring does not match')
})

test('matchesQuery tolerates a null location', () => {
  const it = item({ name: 'Test', location: null })
  assert.ok(matchesQuery(it, 'test'))
  assert.ok(!matchesQuery(it, 'fuku'))
})

test('phaseCounts tallies each phase plus total', () => {
  const items = [
    item({ phase: 'ongoing' }),
    item({ phase: 'ongoing' }),
    item({ phase: 'upcoming' }),
    item({ phase: 'completed' }),
  ]
  assert.deepEqual(phaseCounts(items), { all: 4, ongoing: 2, upcoming: 1, completed: 1 })
})

test('filter by phase narrows to the selected bucket', () => {
  const items = [
    item({ slug: 'a', phase: 'ongoing' }),
    item({ slug: 'b', phase: 'upcoming' }),
    item({ slug: 'c', phase: 'completed' }),
  ]
  const ongoing = filterAndSortTournaments(items, { query: '', phase: 'ongoing', sort: 'recommended' })
  assert.deepEqual(ongoing.map((i) => i.slug), ['a'])
  const all = filterAndSortTournaments(items, { query: '', phase: 'all', sort: 'recommended' })
  assert.equal(all.length, 3)
})

test('search by name and by location', () => {
  const items = [
    item({ slug: 'a', name: 'Giải Fuku Mở Rộng', location: 'Tokyo' }),
    item({ slug: 'b', name: 'Cúp Mùa Đông', location: 'Fukuoka' }),
    item({ slug: 'c', name: 'Khác', location: 'Osaka' }),
  ]
  const byName = filterAndSortTournaments(items, { query: 'fuku', phase: 'all', sort: 'recommended' })
  // 'fuku' appears in a's name and b's location.
  assert.deepEqual(byName.map((i) => i.slug).sort(), ['a', 'b'])
})

test('recommended sort preserves incoming (server-curated) order', () => {
  const items = [
    item({ slug: 'x', startsAt: '2026-03-01T00:00:00Z' }),
    item({ slug: 'y', startsAt: '2026-01-01T00:00:00Z' }),
    item({ slug: 'z', startsAt: '2026-02-01T00:00:00Z' }),
  ]
  const out = filterAndSortTournaments(items, { query: '', phase: 'all', sort: 'recommended' })
  assert.deepEqual(out.map((i) => i.slug), ['x', 'y', 'z'])
})

test('start_asc and start_desc order by start date, unknown dates last', () => {
  const items = [
    item({ slug: 'mar', startsAt: '2026-03-01T00:00:00Z' }),
    item({ slug: 'jan', startsAt: '2026-01-01T00:00:00Z' }),
    item({ slug: 'tbd', startsAt: null }),
    item({ slug: 'feb', startsAt: '2026-02-01T00:00:00Z' }),
  ]
  const asc = filterAndSortTournaments(items, { query: '', phase: 'all', sort: 'start_asc' })
  assert.deepEqual(asc.map((i) => i.slug), ['jan', 'feb', 'mar', 'tbd'])
  const desc = filterAndSortTournaments(items, { query: '', phase: 'all', sort: 'start_desc' })
  assert.deepEqual(desc.map((i) => i.slug), ['mar', 'feb', 'jan', 'tbd'])
})

test('newest sort orders by createdAt descending, unknown last', () => {
  const items = [
    item({ slug: 'old', createdAt: '2026-01-01T00:00:00Z' }),
    item({ slug: 'new', createdAt: '2026-05-01T00:00:00Z' }),
    item({ slug: 'none', createdAt: null }),
    item({ slug: 'mid', createdAt: '2026-03-01T00:00:00Z' }),
  ]
  const out = filterAndSortTournaments(items, { query: '', phase: 'all', sort: 'newest' })
  assert.deepEqual(out.map((i) => i.slug), ['new', 'mid', 'old', 'none'])
})

test('combined query + phase + sort', () => {
  const items = [
    item({ slug: 'a', name: 'Giải A', phase: 'ongoing', startsAt: '2026-02-01T00:00:00Z' }),
    item({ slug: 'b', name: 'Giải B', phase: 'ongoing', startsAt: '2026-01-01T00:00:00Z' }),
    item({ slug: 'c', name: 'Giải A', phase: 'completed', startsAt: '2026-01-15T00:00:00Z' }),
  ]
  const out = filterAndSortTournaments(items, { query: 'giải a', phase: 'ongoing', sort: 'start_asc' })
  assert.deepEqual(out.map((i) => i.slug), ['a'])
})
