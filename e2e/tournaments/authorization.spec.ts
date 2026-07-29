// Scenario A (§7.1–7.3) — admin authorization gate. Anonymous and non-admin users are bounced from
// /admin/giai-dau; the admin lands on the management surface. Defense-in-depth: the /admin layout AND
// every page re-guard via checkIsAdmin (email ∈ ADMIN_EMAILS).
import { test, expect } from '@playwright/test'
import { adminStateFile, userStateFile } from './_env'
import { t } from './helpers'

const ADMIN_LIST = '/admin/giai-dau'

test.describe('anonymous', () => {
  test('is redirected away from the admin tournament surface', async ({ page }) => {
    await page.goto(ADMIN_LIST)
    // redirect() sends unauthenticated visitors to the site root.
    await expect(page).toHaveURL(/\/$/)
    await expect(page).not.toHaveURL(/\/admin\/giai-dau/)
    await expect(page.getByRole('link', { name: t('admin_tournaments.create_cta') })).toHaveCount(0)
  })
})

test.describe('signed-in non-admin', () => {
  test.use({ storageState: userStateFile })
  test('cannot reach the admin tournament surface', async ({ page }) => {
    await page.goto(ADMIN_LIST)
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('link', { name: t('admin_tournaments.create_cta') })).toHaveCount(0)
  })
})

test.describe('admin', () => {
  test.use({ storageState: adminStateFile })

  test('reaches the management list and the create form', async ({ page }) => {
    await page.goto(ADMIN_LIST)
    await expect(page).toHaveURL(/\/admin\/giai-dau/)
    await expect(page.getByRole('heading', { name: new RegExp(t('admin_tournaments.list_title')) })).toBeVisible()

    const createCta = page.getByRole('link', { name: t('admin_tournaments.create_cta') }).first()
    await expect(createCta).toBeVisible()
    await createCta.click()
    await expect(page).toHaveURL(/\/admin\/giai-dau\/new/)
    await expect(page.getByRole('heading', { name: t('admin_tournaments.form_new_title') })).toBeVisible()
  })
})
