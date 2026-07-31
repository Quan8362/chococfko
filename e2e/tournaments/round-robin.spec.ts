// Scenario B (§8) — round-robin group workspace through the admin UI. Over a group whose 4 members
// are assigned, the admin previews the schedule (exactly 6 matches for 4 players), generates it, and
// the results + standings tabs appear with all four competitors. The accessible drag/drop FALLBACK
// control (a "move to group" <select>) is asserted present (§15). Result-driven standings order +
// qualification labels are verified over a completed fixture in public.spec.ts and the SQL harness.
import { test, expect } from '@playwright/test'
import { adminStateFile } from './_env'
import { seedRoundRobinReadyToGenerate, cleanupRun, type RoundRobinFixture } from './seed'
import { attachGuard, t } from './helpers'

test.use({ storageState: adminStateFile })

let fx: RoundRobinFixture
test.beforeAll(async () => { fx = await seedRoundRobinReadyToGenerate() })
test.afterAll(async () => { await cleanupRun() })

test('preview shows 6 matches, generate builds the schedule, standings list all four', async ({ page }) => {
  const guard = attachGuard(page)
  await page.goto(`/admin/giai-dau/${fx.tournament.id}/noi-dung/${fx.event.id}`)

  // Open the "Chia bảng" (groups) tab.
  await page.getByRole('tab', { name: t('admin_tournament_groups.tab_groups') }).click()

  // The accessible fallback for drag/drop exists (a "move to group" select on each chip).
  await expect(page.getByLabel(t('admin_group_assignment.move_to')).first()).toBeVisible()

  // Preview → the dialog summarises exactly 6 matches for a 4-player group.
  await page.getByRole('button', { name: t('admin_group_assignment.preview_cta') }).click()
  const preview = page.getByRole('dialog')
  await expect(preview).toBeVisible()
  await expect(preview.getByText(t('admin_round_robin_preview.summary', { groups: 1, matches: 6 }))).toBeVisible()
  await preview.getByRole('button', { name: t('admin_round_robin_preview.close') }).first().click()
  await expect(preview).toBeHidden()

  // Generate the schedule → results + standings tabs become available.
  await page.getByRole('button', { name: t('admin_group_matches.generate_cta') }).click()
  const standingsTab = page.getByRole('tab', { name: t('admin_group_standings.tab_standings') })
  await expect(standingsTab).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('tab', { name: t('admin_group_standings.tab_results') })).toBeVisible()

  // Standings tab lists every competitor.
  await standingsTab.click()
  for (const name of ['Alpha', 'Bravo', 'Charlie', 'Delta']) {
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible()
  }

  guard.assertClean()
})
