// Responsive: the poker table design showcase (/games/poker/preview) is usable across the
// landscape matrix the QA brief requires. Asserts NO horizontal overflow (clipped controls)
// and captures a screenshot per viewport for visual review. No auth, no DB writes.
import { test, expect } from '@playwright/test'
import path from 'node:path'
import { ARTIFACT_DIR } from './_env'

// name → [width, height]. Landscape orientations per the QA brief.
const VIEWPORTS: Record<string, [number, number]> = {
  'small-phone-landscape': [667, 375],   // iPhone SE class
  'large-iphone-landscape': [844, 390],  // iPhone 12/13/14 class
  'iphone-16-pro-max': [932, 430],       // largest phone class
  'android-landscape': [851, 393],       // common Android class
  'small-tablet-landscape': [1024, 768], // iPad
  'large-tablet-landscape': [1194, 834], // iPad Pro 11"
  'desktop-1366': [1366, 768],
  'desktop-1920': [1920, 1080],
  'wider-desktop': [2560, 1440],
}

for (const [name, [width, height]] of Object.entries(VIEWPORTS)) {
  test(`preview has no horizontal overflow @ ${name} (${width}x${height})`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    const resp = await page.goto('/games/poker/preview', { waitUntil: 'networkidle' })
    expect(resp?.status() ?? 0).toBeLessThan(400)
    await expect(page.locator('body')).toBeVisible()

    // No clipped controls: the document must not scroll horizontally beyond a tiny tolerance.
    const overflow = await page.evaluate(() => {
      const el = document.scrollingElement || document.documentElement
      return el.scrollWidth - el.clientWidth
    })
    expect(overflow, `horizontal overflow at ${name}`).toBeLessThanOrEqual(2)

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'responsive', `poker-preview-${name}.png`), fullPage: false })
  })
}
