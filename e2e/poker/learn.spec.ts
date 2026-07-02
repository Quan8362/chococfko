// Beginner LEARNING experience E2E — onboarding tour, training table, hand-ranking guide.
// No auth, no DB writes, no mock gameplay: the pages are reached via the e2e app-under-test
// (POKER_ENABLED=true for the test server only, set in poker.config.ts). The training table runs
// the real, in-memory learning sandbox (no wallet/coin/Supabase). Selectors use stable data-testid
// hooks so assertions are locale-independent (the default locale is Vietnamese).
import { test, expect, type Page, type ConsoleMessage } from '@playwright/test'
import path from 'node:path'
import { ARTIFACT_DIR } from './_env'

const LEARN = '/games/poker/learn'
const TRAINING = '/games/poker/training'
const RANKINGS = '/games/poker/learn/rankings'

// Collect page console errors so every test can assert "no console errors". Ignore benign network
// noise (e.g. an anon Supabase read that the gated page makes) — we only fail on real page errors.
function trackErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() !== 'error') return
    const text = m.text()
    if (/Failed to load resource|net::ERR|status of 4\d\d|status of 5\d\d/i.test(text)) return
    errors.push(`console.error: ${text}`)
  })
  return errors
}

function noHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const el = document.scrollingElement || document.documentElement
    return el.scrollWidth - el.clientWidth
  })
}

// ── The three updated table background assets load and are the correct art ─────────────────────
test('the three poker table backgrounds load (200 + valid webp)', async ({ request }) => {
  const expected: Record<string, string> = {
    '/poker-desktop.webp': 'desktop',
    '/poker-tablet.webp': 'tablet',
    '/poker-mobile.webp': 'mobile',
  }
  for (const src of Object.keys(expected)) {
    const res = await request.get(src)
    expect(res.status(), `${src} loads`).toBe(200)
    const buf = await res.body()
    expect(buf.length, `${src} non-trivial`).toBeGreaterThan(10_000)
    expect(buf.subarray(0, 4).toString('latin1'), `${src} RIFF`).toBe('RIFF')
    expect(buf.subarray(8, 12).toString('latin1'), `${src} WEBP`).toBe('WEBP')
  }
})

// The live table renders the correct background per layout (preview showcase uses the real
// TableBackground). Assert the felt <img> actually resolves the expected asset and paints.
test('preview renders a table background image that decodes (no broken asset)', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto('/games/poker/preview', { waitUntil: 'networkidle' })
  const img = page.locator('.pk-felt-surface img').first()
  await expect(img).toBeVisible()
  const ok = await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0 && /poker-(desktop|tablet|mobile)\.webp/.test(el.currentSrc || el.src))
  expect(ok, 'background img decoded from a poker-*.webp').toBe(true)
})

// ── Onboarding tour: auto-show, next/back, persistence, skip, restart, don't-show-again ────────
test('onboarding auto-shows on first visit and walks next/back', async ({ page }) => {
  const errors = trackErrors(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(LEARN, { waitUntil: 'networkidle' })

  const dialog = page.getByTestId('pk-onboarding')
  await expect(dialog, 'tour auto-shows for a fresh visitor').toBeVisible()
  await expect(dialog).toHaveAttribute('data-step', '0')

  await page.getByTestId('pk-onb-next').click()
  await expect(dialog).toHaveAttribute('data-step', '1')
  await page.getByTestId('pk-onb-next').click()
  await expect(dialog).toHaveAttribute('data-step', '2')
  await page.getByTestId('pk-onb-back').click()
  await expect(dialog).toHaveAttribute('data-step', '1')

  expect(errors, errors.join('\n')).toEqual([])
})

test('onboarding resumes at the saved step after reload (persistence)', async ({ page }) => {
  await page.goto(LEARN, { waitUntil: 'networkidle' })
  await page.getByTestId('pk-onb-next').click()
  await page.getByTestId('pk-onb-next').click()
  await expect(page.getByTestId('pk-onboarding')).toHaveAttribute('data-step', '2')
  // Skip closes but keeps the resume point.
  await page.getByTestId('pk-onb-skip').click()
  await expect(page.getByTestId('pk-onboarding')).toHaveCount(0)

  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.getByTestId('pk-onboarding'), 'still eligible after skip').toBeVisible()
  await expect(page.getByTestId('pk-onboarding')).toHaveAttribute('data-step', '2')
})

test('don’t-show-again suppresses the tour; restart re-opens it from the hub', async ({ page }) => {
  await page.goto(LEARN, { waitUntil: 'networkidle' })
  await page.getByTestId('pk-onb-dontshow').click()
  await expect(page.getByTestId('pk-onboarding')).toHaveCount(0)

  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.getByTestId('pk-onboarding'), 'no auto-show after opt-out').toHaveCount(0)

  // "Open later from Help" — the hub CTA re-opens it.
  await page.getByTestId('pk-open-tour').click()
  await expect(page.getByTestId('pk-onboarding')).toBeVisible()
  await page.getByTestId('pk-onb-skip').click()

  // Restart re-enables and re-opens from step 0.
  await page.getByTestId('pk-restart-tour').click()
  await expect(page.getByTestId('pk-onboarding')).toBeVisible()
  await expect(page.getByTestId('pk-onboarding')).toHaveAttribute('data-step', '0')
})

test('onboarding dialog is keyboard/focus accessible and Escape closes it', async ({ page }) => {
  await page.goto(LEARN, { waitUntil: 'networkidle' })
  const dialog = page.getByTestId('pk-onboarding')
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('role', 'dialog')
  await expect(dialog).toHaveAttribute('aria-modal', 'true')

  // Next is reachable via Tab (focus not trapped on body) and operable by keyboard.
  const next = page.getByTestId('pk-onb-next')
  let reached = false
  for (let i = 0; i < 12 && !reached; i++) {
    await page.keyboard.press('Tab')
    reached = await next.evaluate((el) => el === document.activeElement)
  }
  expect(reached, 'Next reachable via Tab').toBe(true)

  await page.keyboard.press('Escape')
  await expect(dialog, 'Escape pauses/closes the tour').toHaveCount(0)
})

// ── Training table: play a real (in-memory) hand to settlement via the suggested line ──────────
test('training table plays a scripted hand to a post-hand explanation', async ({ page }) => {
  const errors = trackErrors(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(TRAINING, { waitUntil: 'networkidle' })

  // TRAINING badge + no real coins message present.
  await expect(page.getByText(/TRAINING|BÀN TẬP|練習|연습|练习/i).first()).toBeVisible()

  // Choose the "fold" lesson (shortest deterministic line) and play the suggested moves.
  await page.getByTestId('pk-scenario-fold').click()
  await expect(page.getByTestId('pk-training-felt')).toBeVisible()

  const posthand = page.getByTestId('pk-posthand')
  for (let i = 0; i < 8 && (await posthand.count()) === 0; i++) {
    const suggested = page.getByTestId('pk-suggested')
    if ((await suggested.count()) === 0) break
    await suggested.first().click()
  }
  await expect(posthand, 'hand reached settlement + explanation').toBeVisible()
  expect(errors, errors.join('\n')).toEqual([])
})

// ── Hand-ranking guide ─────────────────────────────────────────────────────────────────────────
test('hand-ranking guide lists nine categories with example cards', async ({ page }) => {
  const errors = trackErrors(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(RANKINGS, { waitUntil: 'networkidle' })
  const list = page.getByTestId('pk-rankings')
  await expect(list).toBeVisible()
  await expect(list.locator('> li')).toHaveCount(9)
  // Cards render as the shared component (role=img aria-label "… of …").
  await expect(list.locator('[role="img"]').first()).toBeVisible()
  expect(errors, errors.join('\n')).toEqual([])
})

// ── Responsive matrix: no horizontal overflow on learn/training/rankings ───────────────────────
const VIEWPORTS: Record<string, [number, number]> = {
  desktop: [1366, 768],
  'tablet-landscape': [1024, 768],
  'small-phone-landscape': [667, 375],
  'large-phone-landscape': [932, 430],
  portrait: [390, 844],
}

for (const [name, [width, height]] of Object.entries(VIEWPORTS)) {
  test(`no horizontal overflow across learning pages @ ${name} (${width}x${height})`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    for (const [label, url] of [['learn', LEARN], ['training', TRAINING], ['rankings', RANKINGS]] as const) {
      const resp = await page.goto(url, { waitUntil: 'networkidle' })
      expect(resp?.status() ?? 0, `${label} @ ${name} status`).toBeLessThan(400)
      // Dismiss the tour on the hub so it can't skew the measurement.
      const skip = page.getByTestId('pk-onb-skip')
      if ((await skip.count()) > 0) await skip.click()
      const overflow = await noHorizontalOverflow(page)
      expect(overflow, `${label} horizontal overflow @ ${name}`).toBeLessThanOrEqual(2)
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'learn', `${label}-${name}.png`) })
    }
  })
}

// ── Reduced motion: the training/onboarding UI still works with reduced motion ─────────────────
test('reduced-motion: onboarding + training remain functional', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(LEARN, { waitUntil: 'networkidle' })
  await expect(page.getByTestId('pk-onboarding')).toBeVisible()
  await page.getByTestId('pk-onb-next').click()
  await expect(page.getByTestId('pk-onboarding')).toHaveAttribute('data-step', '1')

  await page.goto(TRAINING, { waitUntil: 'networkidle' })
  await page.getByTestId('pk-scenario-fold').click()
  await expect(page.getByTestId('pk-training-felt')).toBeVisible()
})
