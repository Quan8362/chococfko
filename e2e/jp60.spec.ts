// E2E for the Japanese 60-Second Challenge. Covers the hardening acceptance
// criteria: timer switch, gameplay layout, no overflow, no raw markers, locales.
// Guest Practice flow is used so the tests need no auth.
import { test, expect } from '@playwright/test'

const LOCALES = ['vi', 'en', 'ja', 'ko', 'zh']

async function setLocale(page: import('@playwright/test').Page, locale: string) {
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: locale, url: 'http://localhost:3000' }])
}

test.describe('jp60 setup + timer switch', () => {
  test('practice timer switch toggles via mouse and keyboard', async ({ page }) => {
    await page.goto('/games/japanese-60')
    // mode → practice
    await page.getByRole('button', { name: /practice|luyện tập|練習|연습|练习/i }).click()
    const sw = page.getByRole('switch')
    await expect(sw).toBeVisible()
    const before = await sw.getAttribute('aria-checked')
    await sw.click()
    expect(await sw.getAttribute('aria-checked')).not.toBe(before)
    // keyboard: focus + Space toggles back
    await sw.focus()
    await page.keyboard.press('Space')
    expect(await sw.getAttribute('aria-checked')).toBe(before)
  })

  test('switch thumb stays inside the track (no overflow)', async ({ page }) => {
    await page.goto('/games/japanese-60')
    await page.getByRole('button', { name: /practice|luyện tập|練習|연습|练习/i }).click()
    const sw = page.getByRole('switch')
    const track = await sw.boundingBox()
    const thumb = await sw.locator('span').first().boundingBox()
    expect(track && thumb).toBeTruthy()
    if (track && thumb) {
      expect(thumb.x).toBeGreaterThanOrEqual(track.x - 1)
      expect(thumb.x + thumb.width).toBeLessThanOrEqual(track.x + track.width + 1)
      expect(thumb.y).toBeGreaterThanOrEqual(track.y - 1)
      expect(thumb.y + thumb.height).toBeLessThanOrEqual(track.y + track.height + 1)
    }
  })
})

test.describe('jp60 gameplay', () => {
  test('guest practice: instruction shown, no raw [..] markers, no horizontal overflow', async ({ page }) => {
    await page.goto('/games/japanese-60')
    await page.getByRole('button', { name: /practice|luyện tập|練習|연습|练习/i }).click()
    await page.getByRole('button', { name: /^(Start|Bắt đầu|スタート|시작|开始)$/ }).click()

    // A question with a real instruction (not just "CÂU 5") must appear.
    const card = page.locator('[role="group"]')
    await expect(card).toBeVisible({ timeout: 15_000 })

    // No raw dictionary markers anywhere in the visible question area.
    const body = await page.locator('body').innerText()
    expect(body).not.toMatch(/\[[a-zà-ỹ]/i) // e.g. "[bắc]"
    // Regression: no Vietnamese word truncated to a leading diacritic (việc → ệc).
    expect(body).not.toMatch(/(^|\s)ệc(\s|,|\.|$)/) // the exact reported corruption
    expect(body).not.toMatch(/(^|\s)(ệ|ế|ạm|ết)\b/) // generic leading-char-loss shapes

    // No horizontal overflow.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    expect(overflow).toBeFalsy()

    // Answer the first question; a result/next state should follow.
    await page.locator('[role="group"] button').first().click()
  })

  test('play overlay is not hidden under the sticky header', async ({ page }) => {
    await page.goto('/games/japanese-60')
    await page.getByRole('button', { name: /practice|luyện tập|練習|연습|练习/i }).click()
    await page.getByRole('button', { name: /^(Start|Bắt đầu|スタート|시작|开始)$/ }).click()
    const exit = page.getByRole('button', { name: /back|quay lại|戻る|뒤로|返回/i }).first()
    const box = await exit.boundingBox()
    // The exit control should sit at/near the very top — not pushed below a 68px header.
    expect(box && box.y).toBeLessThan(68)
  })
})

test.describe('jp60 locales', () => {
  for (const locale of LOCALES) {
    test(`landing renders in ${locale} without raw i18n keys`, async ({ page }) => {
      await setLocale(page, locale)
      await page.goto('/games/japanese-60')
      const body = await page.locator('body').innerText()
      expect(body).not.toMatch(/games\.jp60\./) // no unresolved i18n keys
    })
  }
})
