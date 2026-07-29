// §17 — Console & network assertions across the critical public routes. No uncaught/hydration errors,
// no request loops, no unexpected 401/403 on valid guest flows, no service-role key or production host
// in any browser request, and no audit-log read from a public page.
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

test('public list + detail are clean (no errors, no leaks, only local supabase)', async ({ page }) => {
  const guard = attachGuard(page)

  await page.goto('/giai-dau')
  await expect(page.getByRole('heading', { name: t('tournaments.public.page_title') })).toBeVisible()

  await page.goto(`/giai-dau/${fx.tournament.slug}`)
  await expect(page.getByRole('heading', { name: fx.tournament.name })).toBeVisible()

  // Walk every available tab to exercise each panel's client code.
  for (const key of ['schedule', 'standings', 'competitors', 'overview'] as const) {
    const tab = page.getByRole('tab', { name: t(`tournaments.tabs.${key}`) })
    if (await tab.count()) {
      await tab.click()
      await expect(tab).toHaveAttribute('aria-selected', 'true')
    }
  }

  guard.assertClean()
  assertNoAuditLogRequests(guard)
  assertOnlyLocalSupabase(guard)
})

test('no 401/403 on the valid anonymous read flow', async ({ page }) => {
  const bad: string[] = []
  page.on('response', (r) => {
    if ((r.status() === 401 || r.status() === 403) && /\/rest\/v1\//.test(r.url())) bad.push(`${r.status()} ${r.url()}`)
  })
  await page.goto(`/giai-dau/${fx.tournament.slug}`)
  await expect(page.getByRole('heading', { name: fx.tournament.name })).toBeVisible()
  await page.getByRole('tab', { name: t('tournaments.tabs.standings') }).click()
  await expect(page.getByRole('table')).toBeVisible()
  expect(bad, `unexpected auth failures on a valid guest flow:\n${bad.join('\n')}`).toEqual([])
})

test('no request storm: a static detail view settles to a bounded request count', async ({ page }) => {
  const guard = attachGuard(page)
  await page.goto(`/giai-dau/${fx.tournament.slug}`)
  await expect(page.getByRole('heading', { name: fx.tournament.name })).toBeVisible()
  const before = guard.requests.length
  // Idle for a moment with no interaction — a runaway effect/poll would balloon this.
  await page.waitForTimeout(3000)
  const grew = guard.requests.length - before
  expect(grew, `idle detail view issued ${grew} extra requests (possible loop)`).toBeLessThan(15)
})
