// Scenario C (§9) — organiser tie resolution, presentation half. Over a completed group with an
// organiser qualification override, the guest standings show the "BTC phân định" (organiser-resolved)
// label but NEVER the internal reason/metadata, and the admin workspace surfaces the tie/resolution
// tab. Tie DETECTION, the resolve dialog, and the permutation-only payload guard are covered by the
// SQL harness (tournament_scoring_tests.sql) + domain unit tests (tie-resolution.test.ts).
import { test, expect } from '@playwright/test'
import { adminStateFile } from './_env'
import { seedPublishedRoundRobin, saveQualificationOverride, cleanupRun, type RoundRobinFixture } from './seed'
import { t } from './helpers'

const INTERNAL_REASON = 'INTERNAL-ONLY-REASON-do-not-leak-7f3a'

let fx: RoundRobinFixture
test.beforeAll(async () => {
  fx = await seedPublishedRoundRobin({ completed: true })
  // Organiser resolves the qualification order for the group (reason is an internal note).
  await saveQualificationOverride(fx.event.id, fx.groupId, fx.expectedOrder, INTERNAL_REASON)
})
test.afterAll(async () => { await cleanupRun() })

test('guest sees the organiser-resolved label but not the internal reason', async ({ page }) => {
  await page.goto(`/giai-dau/${fx.tournament.slug}?event=${fx.event.id}&tab=bang-xep-hang`)
  await expect(page.getByRole('table')).toBeVisible()

  // The "BTC phân định" badge is shown…
  await expect(page.getByText(t('tournaments.standings.organizer_resolved')).first()).toBeVisible()
  // …but the internal reason is never exposed to the public.
  await expect(page.getByText(INTERNAL_REASON)).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText(INTERNAL_REASON)
})

test.describe('admin recognises the resolution', () => {
  test.use({ storageState: adminStateFile })
  test('the tie/resolution tab is available on the event workspace', async ({ page }) => {
    await page.goto(`/admin/giai-dau/${fx.tournament.id}/noi-dung/${fx.event.id}`)
    // needsTieAttention (an override exists) → the "Phân định" tab is present.
    await expect(page.getByRole('tab', { name: t('admin_group_standings.tab_ties') })).toBeVisible()
  })
})
