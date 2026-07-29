// §14 — Responsive matrix. Across desktop→mobile viewports, the public list, public detail (incl. a
// wide standings table) and the admin list must not overflow the page horizontally, wide tables must
// scroll inside their own container (not the body), and a screenshot is captured as evidence.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { adminStateFile, SCREENSHOT_DIR } from './_env'
import { seedPublishedRoundRobin, cleanupRun, type RoundRobinFixture } from './seed'
import { t } from './helpers'

const VIEWPORTS = [
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'laptop-1280x800', width: 1280, height: 800 },
  { name: 'tablet-1024x768', width: 1024, height: 768 },
  { name: 'tablet-portrait-768x1024', width: 768, height: 1024 },
  { name: 'mobile-390x844', width: 390, height: 844 },
  { name: 'mobile-landscape-932x430', width: 932, height: 430 }, // iPhone 16 Pro Max landscape
]

let fx: RoundRobinFixture
test.beforeAll(async () => {
  fx = await seedPublishedRoundRobin({ completed: true })
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
})
test.afterAll(async () => { await cleanupRun() })

// The page body must never scroll horizontally (a few px of sub-pixel slack is tolerated).
async function expectNoBodyOverflow(page: import('@playwright/test').Page, where: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, `horizontal overflow (${where}): ${overflow}px`).toBeLessThanOrEqual(2)
}

for (const vp of VIEWPORTS) {
  test(`public list has no overflow @ ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto('/giai-dau')
    await expect(page.getByRole('heading', { name: t('tournaments.public.page_title') })).toBeVisible()
    await expectNoBodyOverflow(page, 'public list')
    await page.screenshot({ path: `${SCREENSHOT_DIR}/public-list-${vp.name}.png`, fullPage: true })
  })

  test(`public detail + standings table scrolls in-container @ ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto(`/giai-dau/${fx.tournament.slug}?event=${fx.event.id}&tab=bang-xep-hang`)
    await expect(page.getByRole('table')).toBeVisible()
    await expectNoBodyOverflow(page, 'public detail')

    // The wide standings table lives inside an overflow-x container, so IT may exceed the viewport
    // while the page body does not.
    const container = page.locator('div.overflow-x-auto', { has: page.getByRole('table') }).first()
    await expect(container).toBeVisible()
    await page.screenshot({ path: `${SCREENSHOT_DIR}/public-standings-${vp.name}.png`, fullPage: false })
  })
}

test.describe('admin list responsive', () => {
  test.use({ storageState: adminStateFile })
  for (const vp of VIEWPORTS) {
    test(`admin list has no overflow @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto('/admin/giai-dau')
      await expect(page.getByRole('heading', { name: new RegExp(t('admin_tournaments.list_title')) })).toBeVisible()
      await expectNoBodyOverflow(page, 'admin list')
      await page.screenshot({ path: `${SCREENSHOT_DIR}/admin-list-${vp.name}.png`, fullPage: true })
    })
  }
})
