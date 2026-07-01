// Smoke: the public poker surfaces render without a client-side crash or console error.
// No auth, no DB writes. (The lobby reads tables; point BASE_URL's app at a branch that has
// the poker schema — otherwise the lobby query errors and this correctly fails.)
import { test, expect } from '@playwright/test'

const PUBLIC_ROUTES = [
  '/games/poker',
  '/games/poker/rules',
  '/games/poker/glossary',
  '/games/poker/preview',
]

for (const route of PUBLIC_ROUTES) {
  test(`renders ${route} with no console errors`, async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', (e) => errors.push(String(e)))

    const resp = await page.goto(route, { waitUntil: 'domcontentloaded' })
    expect(resp?.status(), `HTTP status for ${route}`).toBeLessThan(400)
    await expect(page.locator('body')).toBeVisible()
    // Ignore benign favicon/network noise; fail on real app/runtime errors.
    const real = errors.filter((e) => !/favicon|manifest|net::ERR/i.test(e))
    expect(real, `console errors on ${route}:\n${real.join('\n')}`).toEqual([])
  })
}
