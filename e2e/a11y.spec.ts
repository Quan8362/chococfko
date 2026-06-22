// Explore Platform — automated accessibility smoke (axe-core) on PUBLIC pages.
//
// NOT part of the app build. To run:
//   npm i -D @playwright/test @axe-core/playwright
//   npx playwright install
//   EXPLORE_BASE_URL=https://chococfko.com npx playwright test --config e2e/playwright.config.ts a11y.spec.ts
//
// Axe catches a subset of WCAG issues only. A clean run is necessary, NOT
// sufficient — the manual keyboard / focus / reduced-motion audit in
// docs/explore-platform-release-hardening.md §8 still applies.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const BASE = process.env.EXPLORE_BASE_URL || process.env.JP60_BASE_URL || 'http://localhost:3000'

const PUBLIC_PAGES: { name: string; path: string }[] = [
  { name: 'homepage', path: '/' },
  { name: 'places', path: '/places' },
  { name: 'events', path: '/events' },
  { name: 'collections', path: '/collections' },
]

for (const pg of PUBLIC_PAGES) {
  test(`a11y: ${pg.name} has no critical/serious violations`, async ({ page }) => {
    await page.goto(`${BASE}${pg.path}`, { waitUntil: 'domcontentloaded' })
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    )
    // Attach details for the HTML report when it fails.
    if (blocking.length) {
      console.log(JSON.stringify(blocking.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })), null, 2))
    }
    expect(blocking, `${pg.name} critical/serious a11y violations`).toEqual([])
  })
}
