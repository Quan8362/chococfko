import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ManageableTournament } from '@/lib/tournaments/members'
import { selectManageableTournaments } from './list-view.ts'

const items: ManageableTournament[] = [
  {
    id: 'draft',
    slug: 'giai-cau-long-fko',
    name: 'Giải Cầu Lông FKO',
    status: 'draft',
    startsAt: '2026-08-05T00:00:00.000Z',
    endsAt: '2026-08-06T00:00:00.000Z',
    location: 'Fukuoka',
    eventCount: 1,
    updatedAt: '2026-08-01T03:00:00.000Z',
    viewerRole: 'owner',
  },
  {
    id: 'published',
    slug: 'summer-open',
    name: 'Summer Open',
    status: 'published',
    startsAt: '2026-09-10T00:00:00.000Z',
    endsAt: '2026-09-11T00:00:00.000Z',
    location: null,
    eventCount: 2,
    updatedAt: '2026-08-02T03:00:00.000Z',
    viewerRole: 'manager',
  },
  {
    id: 'archived',
    slug: 'winter-cup',
    name: 'Winter Cup',
    status: 'archived',
    startsAt: null,
    endsAt: null,
    location: null,
    eventCount: 0,
    updatedAt: '2026-07-01T03:00:00.000Z',
    viewerRole: 'site_admin',
  },
]

test('management search matches name without accents and slug', () => {
  assert.deepEqual(
    selectManageableTournaments(items, 'cau long', 'all', 'updated').map((item) => item.id),
    ['draft'],
  )
  assert.deepEqual(
    selectManageableTournaments(items, 'summer-open', 'all', 'updated').map((item) => item.id),
    ['published'],
  )
})

test('management status filter only returns the selected status', () => {
  assert.deepEqual(
    selectManageableTournaments(items, '', 'archived', 'updated').map((item) => item.id),
    ['archived'],
  )
})

test('management sort supports latest update and nearest competition date', () => {
  assert.deepEqual(
    selectManageableTournaments(items, '', 'all', 'updated').map((item) => item.id),
    ['published', 'draft', 'archived'],
  )
  assert.deepEqual(
    selectManageableTournaments(items, '', 'all', 'starts', Date.parse('2026-08-01T00:00:00.000Z')).map((item) => item.id),
    ['draft', 'published', 'archived'],
  )
})
