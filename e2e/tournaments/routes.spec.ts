// §16 — Public routes & error handling. Published slug renders; draft/archived/missing slugs resolve
// to the not-found view (never leaking that a draft exists); deep links + reload preserve the
// event/tab selection; empty states and invalid queries never crash.
//
// NOTE: with `dynamic = 'force-dynamic'`, Next dev serves notFound() as HTTP 200 while rendering the
// not-found UI (a documented dev quirk; a production build returns 404). These tests therefore assert
// on the NOT-FOUND CONTENT (stable across dev/prod) and additionally record the status.
import { test, expect } from '@playwright/test'
import { seedPublishedRoundRobin, createTournament, cleanupRun, type RoundRobinFixture } from './seed'
import { t } from './helpers'

let fx: RoundRobinFixture
let draftSlug: string
let archivedSlug: string
let emptyPublishedSlug: string

test.beforeAll(async () => {
  fx = await seedPublishedRoundRobin({ completed: true })
  draftSlug = (await createTournament({ status: 'draft', label: 'draft' })).slug
  archivedSlug = (await createTournament({ status: 'archived', label: 'arch' })).slug
  emptyPublishedSlug = (await createTournament({ status: 'published', label: 'empty' })).slug
})
test.afterAll(async () => {
  await cleanupRun()
})

async function expectNotFound(page: import('@playwright/test').Page, slug: string) {
  const res = await page.goto(`/giai-dau/${slug}`)
  // Content assertion (dev/prod stable): the not-found title is shown and no tournament detail renders.
  await expect(page).toHaveTitle(new RegExp(t('tournaments.public.not_found_title')))
  await expect(page.getByRole('tablist')).toHaveCount(0)
  // Status is 404 in a production build; tolerated 200 under `force-dynamic` dev.
  expect([200, 404]).toContain(res?.status() ?? 0)
}

test('public list page renders', async ({ page }) => {
  await page.goto('/giai-dau')
  await expect(page.getByRole('heading', { name: t('tournaments.public.page_title') })).toBeVisible()
})

test('published slug renders the detail', async ({ page }) => {
  await page.goto(`/giai-dau/${fx.tournament.slug}`)
  await expect(page.getByRole('heading', { name: fx.tournament.name })).toBeVisible()
  await expect(page.getByRole('tablist')).toBeVisible()
})

test('draft slug → not found', async ({ page }) => {
  await expectNotFound(page, draftSlug)
})

test('archived slug → not found', async ({ page }) => {
  await expectNotFound(page, archivedSlug)
})

test('non-existent slug → not found', async ({ page }) => {
  await expectNotFound(page, 'khong-ton-tai-xyz-123')
})

test('reload preserves the deep-linked event + tab', async ({ page }) => {
  await page.goto(`/giai-dau/${fx.tournament.slug}?event=${fx.event.id}&tab=bang-xep-hang`)
  await expect(page.getByRole('tab', { name: t('tournaments.tabs.standings') })).toHaveAttribute('aria-selected', 'true')
  await page.reload()
  await expect(page.getByRole('tab', { name: t('tournaments.tabs.standings') })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('table')).toBeVisible()
})

test('published tournament with no events shows an empty state, not a crash', async ({ page }) => {
  await page.goto(`/giai-dau/${emptyPublishedSlug}`)
  await expect(page.getByText(t('tournaments.empty.no_events'))).toBeVisible()
})

test('invalid ?event query falls back safely to the first event', async ({ page }) => {
  await page.goto(`/giai-dau/${fx.tournament.slug}?event=00000000-0000-0000-0000-000000000000`)
  // Falls back to the real first event — detail still renders with tabs, no error.
  await expect(page.getByRole('heading', { name: fx.tournament.name })).toBeVisible()
  await expect(page.getByRole('tablist')).toBeVisible()
})
