// Phase-1 verification smoke for the TLMN interaction system.
//
// SCOPE NOTE: the in-game table (TlmnTable + reaction control + phrase bubbles) only
// renders for an authenticated, SEATED player in a room whose status is 'playing'. That
// path is OAuth-gated (Google/Facebook/LINE) and cannot be reached in CI without real
// credentials. This spec therefore verifies the publicly-reachable surface — the
// /games/tlmn lobby — across the required viewports and all 5 locales: it confirms the
// changed bundle/i18n namespace renders with no console errors, no raw i18n keys, and no
// horizontal overflow. The in-game realtime behaviour is covered by the deterministic
// unit tests in lib/games/tlmn/interactions.test.ts + the manual two-session protocol.
import { test, expect, type Page } from '@playwright/test'

const REQUIRED_VIEWPORTS = [
  { name: '667x375', w: 667, h: 375 },
  { name: '812x375', w: 812, h: 375 },
  { name: '844x390', w: 844, h: 390 },
  { name: '932x430', w: 932, h: 430 },
  { name: '1024x768', w: 1024, h: 768 },
  { name: '1180x820', w: 1180, h: 820 },
  { name: '1366x768', w: 1366, h: 768 },
  { name: '1440x900', w: 1440, h: 900 },
  { name: '1920x1080', w: 1920, h: 1080 },
]
const LOCALES = ['vi', 'en', 'ja', 'ko', 'zh']

function collectConsole(page: Page) {
  const errors: string[] = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
  return errors
}

// Benign dev-server/browser noise unrelated to the feature. NB: hydration + duplicate-key
// warnings are intentionally NOT ignored — those must fail the check.
const IGNORE: RegExp[] = [
  /favicon/i, /Failed to load resource/i, /net::ERR/i, /\[Fast Refresh\]/i,
  /Download the React DevTools/i,
]
const isReal = (msg: string) => !IGNORE.some(rx => rx.test(msg))

test.describe('TLMN lobby — viewports', () => {
  for (const vp of REQUIRED_VIEWPORTS) {
    test(`renders clean at ${vp.name}`, async ({ page }) => {
      const errors = collectConsole(page)
      await page.setViewportSize({ width: vp.w, height: vp.h })
      await page.goto('/games/tlmn', { waitUntil: 'networkidle' })
      await expect(page.locator('h1')).toBeVisible()
      // No horizontal overflow at any required size.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
      expect(overflow, `horizontal overflow at ${vp.name}`).toBeFalsy()
      await page.screenshot({ path: `e2e/screenshots/tlmn-lobby-${vp.name}.png`, fullPage: false })
      const real = errors.filter(isReal)
      expect(real, `console errors at ${vp.name}: ${real.join(' | ')}`).toHaveLength(0)
    })
  }
})

test.describe('TLMN lobby — locales', () => {
  for (const locale of LOCALES) {
    test(`no raw i18n keys in ${locale}`, async ({ page }) => {
      await page.context().addCookies([{ name: 'NEXT_LOCALE', value: locale, url: 'http://localhost:3000' }])
      await page.goto('/games/tlmn', { waitUntil: 'networkidle' })
      const body = await page.locator('body').innerText()
      // Neither the games.tlmn namespace prefix nor any reaction key may leak as raw text.
      expect(body, `raw namespace in ${locale}`).not.toMatch(/games\.tlmn\./)
      expect(body, `raw react key in ${locale}`).not.toMatch(/react_(phrase|tab|btn|panel|cooldown|mute)/)
    })
  }
})
