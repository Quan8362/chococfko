// Accessibility + orientation checks against the REAL poker design showcase
// (/games/poker/preview) — no auth, no DB writes, no mock gameplay. Every assertion targets a
// shipped component: the current-actor seat (`.pk-anim-actor`), the rotate/portrait fallback
// overlay (`.pk-anim-rotate-hint`), and the keyboard-focusable header controls.
//
// Covers the Prompt 18B checks the landscape `responsive` project does not: portrait fallback,
// keyboard & focus-order, and reduced-motion.
import { test, expect } from '@playwright/test'

const PREVIEW = '/games/poker/preview'

// ── Portrait fallback ───────────────────────────────────────────────────────────────────────
// In portrait the product shows a rotate-to-landscape prompt (RotateDeviceOverlay). The preview
// renders that exact component behind a toggle, so we verify the portrait viewports load and the
// real fallback overlay renders.
const PORTRAIT: Record<string, [number, number]> = {
  'small-phone-portrait': [360, 780],
  'large-phone-portrait': [430, 932],
  'tablet-portrait': [834, 1194],
}

for (const [name, [width, height]] of Object.entries(PORTRAIT)) {
  test(`portrait fallback renders @ ${name} (${width}x${height})`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    const resp = await page.goto(PREVIEW, { waitUntil: 'networkidle' })
    expect(resp?.status() ?? 0).toBeLessThan(400)
    await expect(page.locator('body')).toBeVisible()

    // Show the real portrait fallback overlay (the same one the live table shows in portrait).
    // Scope to the preview's own header (inside .poker-root), NOT the global site nav header.
    const rotateHint = page.locator('.pk-anim-rotate-hint')
    if ((await rotateHint.count()) === 0) {
      await page.locator('.poker-root header button').first().click()
    }
    await expect(page.locator('.pk-anim-rotate-hint').first()).toBeVisible()
  })
}

// ── Enhanced portrait fallback (Prompt 29 mobile phase) ─────────────────────────────────────
// The overlay surfaces a read-only action countdown + a safe Leave control. The preview passes
// demo props (a live deadline + a Leave handler) so both render against the shipped component.
test('portrait fallback shows a live action countdown (role=timer)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(PREVIEW, { waitUntil: 'networkidle' })
  const hint = page.locator('.pk-anim-rotate-hint')
  if ((await hint.count()) === 0) await page.locator('.poker-root header button').first().click()
  await expect(page.locator('.pk-anim-rotate-hint').first()).toBeVisible()

  const timer = page.locator('[role="timer"]').first()
  await expect(timer).toBeVisible()
  await expect(timer).toHaveText(/\d/)
})

test('portrait fallback exposes a safe, practical Leave control', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(PREVIEW, { waitUntil: 'networkidle' })
  const hint = page.locator('.pk-anim-rotate-hint')
  if ((await hint.count()) === 0) await page.locator('.poker-root header button').first().click()

  const leave = page.getByTestId('poker-rotate-leave')
  await expect(leave).toBeVisible()
  const box = await leave.boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(28)
})

// ── Keyboard & focus-order ──────────────────────────────────────────────────────────────────
test('header control is reachable in tab order and operable by keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto(PREVIEW, { waitUntil: 'networkidle' })

  const toggle = page.locator('.poker-root header button').first()
  await expect(toggle).toBeVisible()

  // Walk the tab order from the top of the document; the control must be reachable via Tab
  // (i.e. it is in the natural focus order, not mouse-only).
  let reached = false
  for (let i = 0; i < 40 && !reached; i++) {
    await page.keyboard.press('Tab')
    reached = await toggle.evaluate((el) => el === document.activeElement)
  }
  expect(reached, 'header toggle reachable via Tab').toBe(true)

  // Activating it with the keyboard toggles the real rotate/portrait fallback overlay.
  const before = await page.locator('.pk-anim-rotate-hint').count()
  await page.keyboard.press('Enter')
  await expect
    .poll(async () => page.locator('.pk-anim-rotate-hint').count())
    .not.toBe(before)
})

test('tabbing moves focus through multiple real controls (no focus trap on body)', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto(PREVIEW, { waitUntil: 'networkidle' })

  const focusable = new Set<string>()
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab')
    const sig = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body) return ''
      return `${el.tagName}:${(el.textContent || '').trim().slice(0, 24)}`
    })
    if (sig) focusable.add(sig)
  }
  // At least two distinct real controls received focus, and focus never got stuck on <body>.
  expect(focusable.size).toBeGreaterThanOrEqual(2)
})

// ── Reduced motion ──────────────────────────────────────────────────────────────────────────
// Proves the shipped CSS (poker-theme.css @media prefers-reduced-motion) actually neutralises
// animation — and that the check is non-vacuous (the same element genuinely animates otherwise).
async function actorAnimationMs(page: import('@playwright/test').Page): Promise<number> {
  const actor = page.locator('.pk-anim-actor').first()
  await expect(actor).toBeVisible()
  return actor.evaluate((el) => {
    const s = getComputedStyle(el)
    if (s.animationName === 'none') return 0
    const toMs = (v: string) =>
      v.trim().endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000
    return Math.max(0, ...s.animationDuration.split(',').map(toMs).filter((n) => Number.isFinite(n)))
  })
}

test('reduced-motion neutralises the current-actor animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto(PREVIEW, { waitUntil: 'networkidle' })

  const honored = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  expect(honored, 'browser honours reduced-motion emulation').toBe(true)

  expect(await actorAnimationMs(page), 'actor animation is neutralised').toBeLessThanOrEqual(1)
})

test('actor animates when motion is allowed (non-vacuous control)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto(PREVIEW, { waitUntil: 'networkidle' })

  expect(await actorAnimationMs(page), 'actor genuinely animates without reduced-motion').toBeGreaterThan(1)
})
