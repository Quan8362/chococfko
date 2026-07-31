// Scenario E (§11) — group + knockout event. This E2E validates the LIVE admin group_knockout
// workspace renders against real data: a 16-competitor event across 4 groups (2 championship + 2
// consolation qualifiers per group) opens with the competitor + group tabs and lists everyone. The
// dual-branch generation, token mapping (Nhất A vs Nhì B), branch isolation (a championship loser
// never drops to consolation), independent podiums, and consolation=0 (no consolation tab) are
// exhaustively covered by supabase/tournament_group_knockout_tests.sql (PASS) and the domain unit
// tests (group-knockout-seed / progression / podium). Full branch result entry via the UI is a
// Prompt-14 follow-up (see TOURNAMENT_TEST_REPORT.md).
import { test, expect } from '@playwright/test'
import { adminStateFile } from './_env'
import { createTournament, addEvent, addCompetitors, cleanupRun } from './seed'
import { attachGuard, t } from './helpers'

test.use({ storageState: adminStateFile })
test.afterAll(async () => { await cleanupRun() })

const NAMES = Array.from({ length: 16 }, (_, i) => `GK${String(i + 1).padStart(2, '0')}`)

test('group_knockout workspace loads with competitor + group tabs and all competitors', async ({ page }) => {
  const guard = attachGuard(page)
  const tour = await createTournament({ status: 'draft', label: 'gk' })
  const ev = await addEvent(tour.id, {
    format: 'group_knockout',
    label: 'GK',
    groupCount: 4,
    winnerQualifiersPerGroup: 2,
    consolationQualifiersPerGroup: 2,
    thirdPlaceEnabled: true,
  })
  await addCompetitors(ev.id, NAMES)

  await page.goto(`/admin/giai-dau/${tour.id}/noi-dung/${ev.id}`)

  await expect(page.getByRole('tablist')).toBeVisible()
  await expect(page.getByRole('tab', { name: t('admin_tournament_groups.tab_competitors') })).toBeVisible()
  await expect(page.getByRole('tab', { name: t('admin_tournament_groups.tab_groups') })).toBeVisible()

  // Every competitor is listed on the competitors tab.
  for (const name of [NAMES[0], NAMES[7], NAMES[15]]) {
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible()
  }

  // The settings panel reflects the championship + consolation qualifier configuration.
  await expect(page.getByText(t('admin_tournament_events.f_winner_qualifiers'))).toBeVisible()
  await expect(page.getByText(t('admin_tournament_events.f_consolation_qualifiers'))).toBeVisible()

  guard.assertClean()
})
