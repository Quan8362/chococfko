// Scenario G (§13) — public realtime. A guest viewing a published tournament establishes a live
// connection (role=status reaches "connected"), and an admin-side change is delivered over the
// subscribed channel and refetched into the guest view WITHOUT a manual reload. Tournament tables
// (tournaments, tournament_matches, tournament_match_games, …) are in the supabase_realtime
// publication, so a score edit travels the same path this test exercises via a tournament-row change.
import { test, expect } from '@playwright/test'
import { seedPublishedRoundRobin, admin, cleanupRun, type RoundRobinFixture } from './seed'
import { t } from './helpers'

let fx: RoundRobinFixture
test.beforeAll(async () => { fx = await seedPublishedRoundRobin({ completed: true }) })
test.afterAll(async () => { await cleanupRun() })

test('guest connects live and receives an admin change without reloading', async ({ page }) => {
  await page.goto(`/giai-dau/${fx.tournament.slug}`)
  await expect(page.getByRole('heading', { name: fx.tournament.name })).toBeVisible()

  // The connection indicator (role=status) reaches the "connected" state.
  const status = page.getByRole('status').first()
  await expect(status).toContainText(t('tournaments.realtime.connected'), { timeout: 25_000 })

  // An admin edits the tournament (same realtime channel a score edit uses). No page.reload() here.
  const renamed = `${fx.tournament.name} • LIVE`
  const { error } = await admin().from('tournaments').update({ name: renamed }).eq('id', fx.tournament.id)
  expect(error).toBeNull()

  // The guest view refetches on the realtime signal and shows the new name.
  await expect(page.getByRole('heading', { name: renamed })).toBeVisible({ timeout: 25_000 })
})

test('two guests viewing the same tournament both reflect a live change', async ({ browser }) => {
  const a = await browser.newContext()
  const b = await browser.newContext()
  const pa = await a.newPage()
  const pb = await b.newPage()
  try {
    await pa.goto(`/giai-dau/${fx.tournament.slug}`)
    await pb.goto(`/giai-dau/${fx.tournament.slug}`)
    await expect(pa.getByRole('status').first()).toContainText(t('tournaments.realtime.connected'), { timeout: 25_000 })
    await expect(pb.getByRole('status').first()).toContainText(t('tournaments.realtime.connected'), { timeout: 25_000 })

    const renamed = `${fx.tournament.name} • BOTH`
    await admin().from('tournaments').update({ name: renamed }).eq('id', fx.tournament.id)

    await expect(pa.getByRole('heading', { name: renamed })).toBeVisible({ timeout: 25_000 })
    await expect(pb.getByRole('heading', { name: renamed })).toBeVisible({ timeout: 25_000 })
  } finally {
    await a.close()
    await b.close()
  }
})
