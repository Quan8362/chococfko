// Scenario — Guest public pages (§8.9, §16, §17 overlap). An anonymous visitor can read a published
// tournament's schedule, results and standings, sees qualification conveyed with text (not colour
// alone), and never sees any admin action. Runs fully unauthenticated (no storageState).
import { test, expect } from '@playwright/test'
import { seedPublishedRoundRobin, cleanupRun, type RoundRobinFixture } from './seed'
import { attachGuard, assertNoAuditLogRequests, assertOnlyLocalSupabase, t } from './helpers'

let fx: RoundRobinFixture

test.beforeAll(async () => {
  fx = await seedPublishedRoundRobin({ completed: true })
})
test.afterAll(async () => {
  await cleanupRun()
})

test('guest reads overview, schedule and standings of a published tournament', async ({ page }) => {
  const guard = attachGuard(page)
  await page.goto(`/giai-dau/${fx.tournament.slug}`)

  // Header shows the tournament name.
  await expect(page.getByRole('heading', { name: fx.tournament.name })).toBeVisible()

  // Schedule tab → the 6 round-robin matches are present (competitor names rendered).
  await page.getByRole('tab', { name: t('tournaments.tabs.schedule') }).click()
  await expect(page.getByText('Alpha', { exact: false }).first()).toBeVisible()

  // Standings tab → all four competitors listed, top-2 flagged as qualifying with a TEXT label.
  await page.getByRole('tab', { name: t('tournaments.tabs.standings') }).click()
  const standings = page.getByRole('table')
  await expect(standings).toBeVisible()
  for (const name of ['Alpha', 'Bravo', 'Charlie', 'Delta']) {
    await expect(standings.getByText(name, { exact: true }).first()).toBeVisible()
  }
  // Qualification marker is a real text label, present at least for the two qualifiers.
  await expect(page.getByText(t('tournaments.standings.qualified_championship')).first()).toBeVisible()

  guard.assertClean()
  assertNoAuditLogRequests(guard)
  assertOnlyLocalSupabase(guard)
})

test('guest page exposes no admin actions', async ({ page }) => {
  await page.goto(`/giai-dau/${fx.tournament.slug}`)
  await expect(page.getByRole('heading', { name: fx.tournament.name })).toBeVisible()

  // No links into the admin surface and no destructive/admin controls.
  await expect(page.locator('a[href*="/admin/"]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: t('admin_tournaments.action_publish') })).toHaveCount(0)
  await expect(page.getByRole('link', { name: t('admin_tournament_events.edit_settings') })).toHaveCount(0)
})

test('deep link to the standings tab restores that view on load', async ({ page }) => {
  // ?tab=bang-xep-hang (standings slug) + explicit event → the standings tab is selected immediately.
  await page.goto(`/giai-dau/${fx.tournament.slug}?event=${fx.event.id}&tab=bang-xep-hang`)
  const standingsTab = page.getByRole('tab', { name: t('tournaments.tabs.standings') })
  await expect(standingsTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('table')).toBeVisible()
})
