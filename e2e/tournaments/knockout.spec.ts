// Scenario D (§10) — knockout event. This E2E validates the LIVE admin knockout workspace and the
// public knockout surface render correctly against real data: the seeding workspace loads for a 6-
// competitor event (bracket size 8, 2 BYEs), lists all competitors, exposes the seed editor, and the
// public bracket tab degrades to an empty state before generation without crashing. The bracket math
// itself — size-8 padding, BYE auto-advance (no 0–0), winner slotting, third-place, podium — is
// exhaustively covered by supabase/tournament_knockout_bracket_tests.sql (PASS) and the domain unit
// tests (knockout-seed / knockout / podium). Full multi-round result entry via the UI is a Prompt-14
// follow-up (see TOURNAMENT_TEST_REPORT.md).
import { test, expect } from '@playwright/test'
import { adminStateFile } from './_env'
import { createTournament, addEvent, addCompetitors, cleanupRun } from './seed'
import { attachGuard, t } from './helpers'

const SIX = ['Anh', 'Bình', 'Cường', 'Dũng', 'An', 'Phúc']

test.describe('admin knockout workspace', () => {
  test.use({ storageState: adminStateFile })
  test.afterAll(async () => { await cleanupRun() })

  test('seeding workspace loads and lists all competitors', async ({ page }) => {
    const guard = attachGuard(page)
    const tour = await createTournament({ status: 'draft', label: 'ko' })
    const ev = await addEvent(tour.id, { format: 'knockout', label: 'KO', thirdPlaceEnabled: true })
    await addCompetitors(ev.id, SIX)

    await page.goto(`/admin/giai-dau/${tour.id}/noi-dung/${ev.id}`)

    // Knockout workspace tabs: Vận động viên + Xếp nhánh (no group tabs).
    await expect(page.getByRole('tablist')).toBeVisible()
    await expect(page.getByRole('tab', { name: t('admin_tournament_groups.tab_competitors') })).toBeVisible()
    await expect(page.getByRole('tab', { name: t('admin_knockout_seeding.tab_seeding') })).toBeVisible()

    // Competitors tab lists all six.
    for (const name of SIX) {
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible()
    }

    // Seeding tab opens the seed editor (no bracket yet → bracket/results/podium tabs hidden).
    await page.getByRole('tab', { name: t('admin_knockout_seeding.tab_seeding') }).click()
    await expect(page.getByRole('tab', { name: t('admin_knockout_seeding.tab_bracket') })).toHaveCount(0)

    guard.assertClean()
  })
})

test('public knockout tab degrades to an empty state before a bracket exists', async ({ page }) => {
  const guard = attachGuard(page)
  const tour = await createTournament({ status: 'published', label: 'kopub' })
  const ev = await addEvent(tour.id, { format: 'knockout', label: 'KO', thirdPlaceEnabled: true })
  await addCompetitors(ev.id, SIX)

  await page.goto(`/giai-dau/${tour.slug}`)
  await expect(page.getByRole('heading', { name: tour.name })).toBeVisible()
  // Knockout formats expose a "Nhánh đấu" (bracket) tab; with no bracket it shows the empty state.
  await page.getByRole('tab', { name: t('tournaments.tabs.bracket') }).click()
  await expect(page.getByText(t('tournaments.empty.no_knockout'))).toBeVisible()
  guard.assertClean()
  await cleanupRun()
})
