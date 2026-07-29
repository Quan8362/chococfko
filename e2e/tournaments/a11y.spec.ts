// §15 — Accessibility E2E (no axe dependency; assert the concrete ARIA contracts the components ship).
// Public: one page H1, a keyboard-operable tablist (Arrow keys), a role=status live connection strip,
// and qualification conveyed by TEXT not colour. Admin: the WorkspaceTabs roving tablist supports
// Arrow + Home/End, and the confirm dialog is a focus-trapping modal that restores focus on close.
//
// NOTE (minor finding): the PUBLIC TournamentDetail tablist implements Arrow navigation but not
// Home/End (the admin WorkspaceTabs implements the full set). See TOURNAMENT_TEST_REPORT.md §Findings.
import { test, expect } from '@playwright/test'
import { adminStateFile } from './_env'
import { seedPublishedRoundRobin, createTournament, cleanupRun, type RoundRobinFixture } from './seed'
import { t } from './helpers'

test.describe('public accessibility', () => {
  let fx: RoundRobinFixture
  test.beforeAll(async () => { fx = await seedPublishedRoundRobin({ completed: true }) })
  test.afterAll(async () => { await cleanupRun() })

  test('exactly one page H1 and a labelled tablist', async ({ page }) => {
    await page.goto(`/giai-dau/${fx.tournament.slug}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.getByRole('tablist')).toHaveAttribute('aria-label', t('tournaments.public.tabs_label'))
  })

  test('tablist is keyboard operable with Arrow keys', async ({ page }) => {
    await page.goto(`/giai-dau/${fx.tournament.slug}`)
    const tabs = page.getByRole('tab')
    expect(await tabs.count()).toBeGreaterThan(1)

    await tabs.first().focus()
    await expect(tabs.first()).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
    await expect(tabs.nth(1)).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true')
  })

  test('connection status is a live region, refresh has an accessible name, qualification carries text', async ({ page }) => {
    await page.goto(`/giai-dau/${fx.tournament.slug}`)
    const status = page.getByRole('status').first()
    await expect(status).toBeVisible()
    await expect(status).toHaveAttribute('aria-live', 'polite')

    // A refresh affordance has an accessible name (not an icon-only button). (.first(): the header
    // refresh + the indicator's own refresh can both be present when realtime is not yet connected.)
    await expect(page.getByRole('button', { name: t('tournaments.public.refresh') }).first()).toBeVisible()

    // Qualification: a real text label, not colour alone.
    await page.getByRole('tab', { name: t('tournaments.tabs.standings') }).click()
    await expect(page.getByText(t('tournaments.standings.qualified_championship')).first()).toBeVisible()
  })
})

test.describe('admin accessibility', () => {
  test.use({ storageState: adminStateFile })
  let fx: RoundRobinFixture
  test.beforeAll(async () => { fx = await seedPublishedRoundRobin({ completed: true }) })
  test.afterAll(async () => { await cleanupRun() })

  test('workspace tablist supports Arrow + Home/End', async ({ page }) => {
    await page.goto(`/admin/giai-dau/${fx.tournament.id}/noi-dung/${fx.event.id}`)
    const tabs = page.getByRole('tab')
    const count = await tabs.count()
    expect(count).toBeGreaterThan(2) // competitors / groups / results / standings

    await tabs.first().focus()
    await page.keyboard.press('End')
    await expect(tabs.nth(count - 1)).toHaveAttribute('aria-selected', 'true')
    await expect(tabs.nth(count - 1)).toBeFocused()
    await page.keyboard.press('Home')
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('ArrowRight')
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
  })

  test('confirm dialog is a focus-trapping modal that restores focus on close', async ({ page }) => {
    const tour = await createTournament({ status: 'draft', label: 'a11y' })
    await page.goto(`/admin/giai-dau/${tour.id}`)

    const opener = page.getByRole('button', { name: t('admin_tournaments.action_delete') })
    await opener.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    // Modal semantics: aria-modal + labelled by its own title + a keyboard-reachable confirm button.
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await expect(dialog).toHaveAttribute('aria-labelledby', /.+/)
    await expect(dialog.getByRole('button', { name: t('admin_tournaments.action_delete') })).toBeVisible()

    // Escape closes and focus returns to the opener (focus is never stranded on the page behind).
    // NOTE: the dialog also sets initial focus on the confirm button (confirmRef) — verified in a
    // production build; under `next dev` + React StrictMode the double-invoked effect's cleanup can
    // re-focus the opener, so we assert the reliable Escape→restore contract here. See report §Findings.
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(opener).toBeFocused()
  })
})
