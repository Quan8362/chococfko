// TLMN responsive checks — SAFE: no auth, no DB writes. Covers the four required
// viewport groups against the public lobby and the dev FX/geometry harness
// (/games/tlmn/fxverify), which mounts the REAL table overlay + controls.
//
// In-match table responsiveness (cards/hand/result dialog on a live board) requires an
// active game and is screenshotted by multiplayer.spec.ts when the write flow runs.
import { test, expect, type Page } from '@playwright/test'
import { ARTIFACT_DIR } from './_env'

const VIEWPORTS = [
  { group: 'mobile', name: 'iphone-se-375x667', w: 375, h: 667 },
  { group: 'large-mobile', name: 'iphone-pro-430x932', w: 430, h: 932 },
  { group: 'tablet', name: 'ipad-820x1180', w: 820, h: 1180 },
  { group: 'desktop', name: 'desktop-1280x800', w: 1280, h: 800 },
]

const IGNORE = [/favicon/i, /Failed to load resource/i, /net::ERR/i, /\[Fast Refresh\]/i, /Download the React DevTools/i]
function consoleErrors(page: Page) {
  const errs: string[] = []
  page.on('console', m => { if (m.type() === 'error' && !IGNORE.some(r => r.test(m.text()))) errs.push(m.text()) })
  page.on('pageerror', e => errs.push(`pageerror: ${e.message}`))
  return errs
}
async function noHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)
}

for (const vp of VIEWPORTS) {
  test(`${vp.group} (${vp.w}x${vp.h}): lobby fits with no horizontal scroll`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h })
    await page.goto('/games/tlmn', { waitUntil: 'networkidle' })
    await page.screenshot({ path: `${ARTIFACT_DIR}/responsive/lobby-${vp.name}.png`, fullPage: true })
    expect(await noHorizontalScroll(page), 'no horizontal overflow on lobby').toBeTruthy()
  })

  test(`${vp.group} (${vp.w}x${vp.h}): table harness fits, controls visible + clickable`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h })
    await page.goto('/games/tlmn/fxverify', { waitUntil: 'networkidle' })
    // The harness exposes the real gameplay controls under the throwable overlay.
    await expect(page.getByTestId('ctrl-play')).toBeVisible()
    await expect(page.getByTestId('ctrl-pass')).toBeVisible()
    // Overlay must not block the hand controls underneath.
    await page.getByTestId('throw-bomb').click()
    await page.getByTestId('ctrl-play').click()
    await page.screenshot({ path: `${ARTIFACT_DIR}/responsive/harness-${vp.name}.png`, fullPage: true })
    expect(await noHorizontalScroll(page), 'no horizontal overflow on harness').toBeTruthy()
  })
}
