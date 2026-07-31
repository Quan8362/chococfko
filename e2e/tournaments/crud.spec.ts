// Scenario A (§7.4–7.10) — tournament CRUD + lifecycle through the admin UI. Create draft, field
// validation, edit, optimistic-concurrency (stale version) conflict, publish gate (needs an event),
// publish success, archive, and delete-empty-draft.
import { test, expect } from '@playwright/test'
import { adminStateFile, RUN_PREFIX } from './_env'
import { createTournament, addEvent, admin, cleanupRun } from './seed'
import { t } from './helpers'

test.use({ storageState: adminStateFile })
test.afterAll(async () => { await cleanupRun() })

const NEW = '/admin/giai-dau/new'
const datetimeInputs = (page: import('@playwright/test').Page) => page.locator('input[type="datetime-local"]')

test.describe('validation', () => {
  test('blocks empty name and out-of-order dates without navigating', async ({ page }) => {
    await page.goto(NEW)
    // Empty name → error, stays on the form.
    await page.getByRole('button', { name: t('admin_tournaments.save_create') }).click()
    await expect(page.getByText(t('admin_tournaments.field_name_required'))).toBeVisible()
    await expect(page).toHaveURL(/\/new/)

    // End before start → dates error.
    await page.getByPlaceholder(t('admin_tournaments.f_name_ph')).fill(`${RUN_PREFIX} Validation`)
    await datetimeInputs(page).nth(0).fill('2026-08-10T10:00')
    await datetimeInputs(page).nth(1).fill('2026-08-01T10:00')
    await page.getByRole('button', { name: t('admin_tournaments.save_create') }).click()
    await expect(page.getByText(t('admin_tournaments.field_dates_order'))).toBeVisible()
    await expect(page).toHaveURL(/\/new/)
  })
})

test.describe('create + edit', () => {
  test('creates a draft then edits its name', async ({ page }) => {
    await page.goto(NEW)
    const name = `${RUN_PREFIX} Create ${Date.now().toString(36)}`
    await page.getByPlaceholder(t('admin_tournaments.f_name_ph')).fill(name)
    await datetimeInputs(page).nth(0).fill('2026-09-01T09:00')
    await datetimeInputs(page).nth(1).fill('2026-09-03T18:00')
    await page.getByRole('button', { name: t('admin_tournaments.save_create') }).click()

    // Redirects to the new tournament's detail page.
    await expect(page).toHaveURL(/\/admin\/giai-dau\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { name })).toBeVisible()
    await expect(page.getByText(t('admin_tournaments.status_draft'), { exact: false }).first()).toBeVisible()

    // Edit → change name → persists.
    await page.getByRole('link', { name: t('admin_tournaments.action_edit') }).first().click()
    await expect(page).toHaveURL(/\/edit$/)
    const edited = `${name} EDITED`
    const nameInput = page.getByPlaceholder(t('admin_tournaments.f_name_ph'))
    await nameInput.fill(edited)
    await page.getByRole('button', { name: t('admin_tournaments.save_update') }).click()
    await expect(page).toHaveURL(/\/admin\/giai-dau\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { name: edited })).toBeVisible()
  })
})

test.describe('optimistic concurrency', () => {
  test('a stale edit surfaces a version conflict and does not overwrite', async ({ page }) => {
    const tour = await createTournament({ status: 'draft', label: 'stale' })
    await page.goto(`/admin/giai-dau/${tour.id}/edit`)
    await expect(page.getByPlaceholder(t('admin_tournaments.f_name_ph'))).toHaveValue(tour.name)

    // Someone else updates the row out-of-band → updated_at moves past the value the form loaded.
    await admin().from('tournaments').update({ location: 'Osaka (out-of-band)' }).eq('id', tour.id)

    await page.getByPlaceholder(t('admin_tournaments.f_name_ph')).fill(`${tour.name} STALE`)
    await page.getByRole('button', { name: t('admin_tournaments.save_update') }).click()

    // Conflict message + a reload affordance; the form did NOT navigate away (no silent overwrite).
    await expect(page.getByText(t('admin_tournaments.err_version_conflict'))).toBeVisible()
    await expect(page.getByRole('button', { name: t('admin_tournaments.reload') })).toBeVisible()
    await expect(page).toHaveURL(/\/edit$/)
  })
})

test.describe('publish lifecycle', () => {
  test('publish is blocked with no event, then succeeds after one is added', async ({ page }) => {
    const tour = await createTournament({ status: 'draft', label: 'pub' })
    await page.goto(`/admin/giai-dau/${tour.id}`)

    // No event → publish gate.
    await page.getByRole('button', { name: t('admin_tournaments.action_publish') }).click()
    await expect(page.getByText(t('admin_tournaments.err_needs_event'))).toBeVisible()

    // Add an event, reload, publish → status becomes published.
    await addEvent(tour.id, { format: 'round_robin', label: 'RR' })
    await page.reload()
    await page.getByRole('button', { name: t('admin_tournaments.action_publish') }).click()
    await expect(page.getByText(t('admin_tournaments.status_published'), { exact: false }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: t('admin_tournaments.action_publish') })).toHaveCount(0)
  })
})

test.describe('archive + delete', () => {
  test('deletes an empty draft via the confirm dialog', async ({ page }) => {
    const tour = await createTournament({ status: 'draft', label: 'del' })
    await page.goto(`/admin/giai-dau/${tour.id}`)

    await page.getByRole('button', { name: t('admin_tournaments.action_delete') }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(t('admin_tournaments.confirm_delete_title'))).toBeVisible()
    await dialog.getByRole('button', { name: t('admin_tournaments.action_delete') }).click()

    // Returns to the list; the tournament is gone.
    await expect(page).toHaveURL(/\/admin\/giai-dau(\?.*)?$/)
    await expect(page.getByRole('heading', { name: tour.name })).toHaveCount(0)
  })

  test('archives a published tournament via the confirm dialog', async ({ page }) => {
    const tour = await createTournament({ status: 'published', label: 'arch' })
    await addEvent(tour.id, { format: 'round_robin', label: 'RR' })
    await page.goto(`/admin/giai-dau/${tour.id}`)

    await page.getByRole('button', { name: t('admin_tournaments.action_archive') }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(t('admin_tournaments.confirm_archive_title'))).toBeVisible()
    await dialog.getByRole('button', { name: t('admin_tournaments.action_archive') }).click()

    await expect(page.getByText(t('admin_tournaments.status_archived'), { exact: false }).first()).toBeVisible()
  })
})
