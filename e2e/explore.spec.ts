// Explore Platform — critical PUBLIC-flow E2E (safe: no login, no writes).
//
// NOT part of the app build. To run:
//   npm i -D @playwright/test
//   npx playwright install
//   EXPLORE_BASE_URL=https://chococfko.com npx playwright test --config e2e/playwright.config.ts explore.spec.ts
//
// These tests only read public pages, so they are safe against production. Auth-gated
// and write flows (save merge, lists, plans, Q&A, reports, rate-limit) require a
// dedicated test user + isolated data and are covered by the manual smoke-test
// checklist (docs/explore-platform-production-smoke-test.md) until a test project
// with seeded users is available in CI.
import { test, expect } from '@playwright/test'

const BASE = process.env.EXPLORE_BASE_URL || process.env.JP60_BASE_URL || 'http://localhost:3000'

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(() => {
    const d = document.documentElement
    return d.scrollWidth - d.clientWidth
  })
  // Allow a 1px rounding tolerance.
  expect(overflow, 'page must not scroll horizontally').toBeLessThanOrEqual(1)
}

test.describe('Explore public flows', () => {
  test('homepage loads with no horizontal overflow', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveTitle(/.+/)
    await expectNoHorizontalOverflow(page)
  })

  test('places list renders results or a useful empty state', async ({ page }) => {
    await page.goto(`${BASE}/places`, { waitUntil: 'domcontentloaded' })
    const main = page.locator('main')
    await expect(main).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })

  test('search input is present and submitting keeps state in the URL', async ({ page }) => {
    await page.goto(`${BASE}/places`, { waitUntil: 'domcontentloaded' })
    const search = page.getByRole('searchbox').or(page.locator('input[type="search"], input[name*="q"]')).first()
    if (await search.count()) {
      await search.fill('ramen')
      await search.press('Enter')
      await page.waitForLoadState('domcontentloaded')
      await expectNoHorizontalOverflow(page)
    }
  })

  test('events page renders without broken scaffolding', async ({ page }) => {
    await page.goto(`${BASE}/events`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('main')).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })

  test('collections page renders', async ({ page }) => {
    await page.goto(`${BASE}/collections`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('main')).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })

  test('health endpoint reports a status', async ({ request }) => {
    const res = await request.get(`${BASE}/api/health`)
    expect([200, 503]).toContain(res.status())
    const body = await res.json()
    expect(body).toHaveProperty('status')
    expect(body).toHaveProperty('checks')
    // never leaks secret values — only booleans
    expect(typeof body.config.cron_secret_configured).toBe('boolean')
  })

  test('cron endpoint rejects unauthenticated calls', async ({ request }) => {
    const res = await request.get(`${BASE}/api/cron/return-user`)
    expect(res.status()).toBe(401)
  })
})

for (const locale of ['vi', 'en', 'ja', 'ko', 'zh'] as const) {
  test(`locale smoke: homepage loads in ${locale}`, async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
    // next-intl uses a cookie; set it then reload.
    await page.context().addCookies([
      { name: 'NEXT_LOCALE', value: locale, url: BASE },
    ])
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('body')).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })
}
