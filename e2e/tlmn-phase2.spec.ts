// Phase-2 live(ish) verification for the TLMN throwable system, WITHOUT writing to prod.
//
// Two independent checks:
//  (A) Realtime transport: two separate browser contexts act as two clients on the SAME
//      transient `tlmn-fx:<room>` broadcast channel (the exact channel the hook uses, with
//      broadcast.self=false). Proves an event is delivered exactly once to the OTHER client,
//      the sender does not self-receive, a late subscriber sees no replay, and the gameplay
//      channel (`tlmn-game:<room>`) never receives interaction events (separate channels).
//      Uses the public anon key captured live from the app's own network traffic (no secrets,
//      no DB writes — broadcast is ephemeral).
//  (B) Visual/geometry harness: the dev-only /games/tlmn/__fxverify page mounts the REAL
//      ThrowableLayer / ImpactBurst / ReactionControl / target-selection overlay so the
//      throw arcs, impacts, target rings, pointer-events, responsiveness, reduced-motion,
//      locales and console cleanliness can be exercised + screenshotted.
import { test, expect, type Page } from '@playwright/test'
import path from 'path'

const UMD = path.resolve(__dirname, '../node_modules/@supabase/supabase-js/dist/umd/supabase.js')
const HARNESS = '/games/tlmn/fxverify'

const VIEWPORTS = [
  { name: '667x375', w: 667, h: 375 }, { name: '812x375', w: 812, h: 375 },
  { name: '844x390', w: 844, h: 390 }, { name: '932x430', w: 932, h: 430 },
  { name: '1024x768', w: 1024, h: 768 }, { name: '1180x820', w: 1180, h: 820 },
  { name: '1194x834', w: 1194, h: 834 }, { name: '1366x768', w: 1366, h: 768 },
  { name: '1440x900', w: 1440, h: 900 }, { name: '1920x1080', w: 1920, h: 1080 },
]
const LOCALES = ['vi', 'en', 'ja', 'ko', 'zh']
const ITEMS = ['flower', 'heart', 'applause', 'confetti', 'laugh', 'tomato', 'egg', 'bomb', 'lightning', 'angry']
const IGNORE = [/favicon/i, /Failed to load resource/i, /net::ERR/i, /\[Fast Refresh\]/i, /Download the React DevTools/i]
const collectConsole = (page: Page) => {
  const errs: string[] = []
  page.on('console', m => { if (m.type() === 'error' && !IGNORE.some(r => r.test(m.text()))) errs.push(m.text()) })
  page.on('pageerror', e => errs.push(`pageerror: ${e.message}`))
  return errs
}

// ── (A) Realtime transport ────────────────────────────────────────────────────────────
test('realtime: tlmn-fx delivers once to the other client, no self-echo, no replay, separate channel', async ({ browser }) => {
  // Capture the live anon key + url from the app's own Supabase traffic (public key).
  const cap = await browser.newContext()
  const capPage = await cap.newPage()
  let url: string | null = null, key: string | null = null
  capPage.on('request', r => {
    const u = r.url()
    if (/supabase\.co/.test(u) && !key) { try { url = new URL(u).origin } catch {} ; key = r.headers()['apikey'] ?? null }
  })
  await capPage.goto('/games/tlmn', { waitUntil: 'networkidle' })
  expect(url, 'captured supabase url').toBeTruthy()
  expect(key, 'captured anon key').toBeTruthy()
  await cap.close()

  const room = `verify-${Date.now()}`
  const mkClient = async () => {
    const ctx = await browser.newContext()
    const p = await ctx.newPage()
    await p.goto('/', { waitUntil: 'domcontentloaded' })
    await p.addScriptTag({ path: UMD })
    return { ctx, p }
  }
  const A = await mkClient()
  const B = await mkClient()

  // B subscribes to the FX channel; C subscribes to the GAME channel (must NOT receive FX).
  const subscribe = async (p: Page, channel: string) => p.evaluate(({ url, key, channel }) => {
    const w = window as unknown as { supabase: { createClient: (u: string, k: string) => unknown }; __rx: unknown[]; __ch: { send: (m: unknown) => unknown } }
    w.__rx = []
    const sb = w.supabase.createClient(url, key) as { channel: (n: string, o: unknown) => { on: (...a: unknown[]) => unknown; subscribe: (cb: (s: string) => void) => unknown; send: (m: unknown) => unknown } }
    const ch = sb.channel(channel, { config: { broadcast: { self: false } } })
    ;(ch.on as (t: string, f: unknown, cb: (m: { payload: unknown }) => void) => typeof ch)('broadcast', { event: 'interaction' }, ({ payload }) => { w.__rx.push(payload) })
    w.__ch = ch as unknown as { send: (m: unknown) => unknown }
    return new Promise<boolean>(res => ch.subscribe((s: string) => { if (s === 'SUBSCRIBED') res(true) }))
  }, { url, key, channel })

  await subscribe(B.p, `tlmn-fx:${room}`)
  const C = await mkClient()
  await subscribe(C.p, `tlmn-game:${room}`) // gameplay channel — must stay isolated
  await subscribe(A.p, `tlmn-fx:${room}`)

  // A sends ONE interaction event.
  await A.p.evaluate(() => {
    const w = window as unknown as { __ch: { send: (m: unknown) => unknown } }
    w.__ch.send({ type: 'broadcast', event: 'interaction', payload: { v: 1, id: 'evt-A1', kind: 'throwable', key: 'bomb', senderSeat: 0, targetSeat: 2, at: Date.now() } })
  })

  // Allow propagation, then assert delivery semantics.
  await B.p.waitForFunction(() => (window as unknown as { __rx: unknown[] }).__rx.length >= 1, null, { timeout: 5000 })
  const bRx = await B.p.evaluate(() => (window as unknown as { __rx: unknown[] }).__rx)
  const aRx = await A.p.evaluate(() => (window as unknown as { __rx: unknown[] }).__rx)
  const cRx = await C.p.evaluate(() => (window as unknown as { __rx: unknown[] }).__rx)

  expect(bRx.length, 'B receives exactly one event').toBe(1)
  expect((bRx[0] as { id: string }).id).toBe('evt-A1')
  expect((bRx[0] as { key: string }).key).toBe('bomb')
  expect(aRx.length, 'sender does NOT self-receive (broadcast.self=false)').toBe(0)
  expect(cRx.length, 'gameplay channel does NOT receive FX events (separate channel)').toBe(0)

  // No replay: a brand-new late subscriber must receive nothing already-sent.
  const D = await mkClient()
  await subscribe(D.p, `tlmn-fx:${room}`)
  await D.p.waitForTimeout(1200)
  const dRx = await D.p.evaluate(() => (window as unknown as { __rx: unknown[] }).__rx)
  expect(dRx.length, 'late subscriber sees no replay of old events').toBe(0)

  for (const c of [A, B, C, D]) await c.ctx.close()
})

// ── (B) Visual / geometry harness ─────────────────────────────────────────────────────
test.describe('harness — overlay never blocks gameplay + responsive', () => {
  for (const vp of VIEWPORTS) {
    test(`${vp.name}: pointer-events none, controls clickable through throws, no console errors`, async ({ page }) => {
      const errs = collectConsole(page)
      await page.setViewportSize({ width: vp.w, height: vp.h })
      await page.goto(HARNESS, { waitUntil: 'networkidle' })
      // Fire a few throws so the overlay is populated during the checks.
      await page.getByTestId('throw-bomb').click()
      await page.getByTestId('throw-flower').click()
      // The throwable overlay must be pointer-events:none.
      const pe = await page.locator('[data-throwable-layer]').evaluate(el => getComputedStyle(el).pointerEvents)
      expect(pe, 'throwable overlay pointer-events').toBe('none')
      // A gameplay control underneath the overlay stays clickable.
      await page.getByTestId('ctrl-play').click()
      await page.getByTestId('ctrl-pass').click()
      expect(await page.getByTestId('ctrl-hits').innerText()).toBe('2')
      await page.screenshot({ path: `e2e/screenshots/p2-${vp.name}.png` })
      expect(errs, `console errors: ${errs.join(' | ')}`).toHaveLength(0)
    })
  }
})

test.describe('harness — behaviours', () => {
  test('all 10 items render a flying projectile + impact burst', async ({ page }) => {
    await page.goto(HARNESS, { waitUntil: 'networkidle' })
    for (const key of ITEMS) {
      await page.getByTestId(`throw-${key}`).click()
      // An impact burst (or static, under reduced motion) appears within the lifetime. The
      // .tlmn-impact wrapper is a 0×0 anchor (children animate outward), so assert on the
      // core glyph / static span, which have a real box.
      await expect(page.locator('.tlmn-impact-core, .tlmn-impact-static').first()).toBeVisible({ timeout: 2000 })
      await page.waitForTimeout(150)
    }
  })

  test('all 7 seat-to-seat trajectories animate without error', async ({ page }) => {
    const errs = collectConsole(page)
    await page.goto(HARNESS, { waitUntil: 'networkidle' })
    for (const id of ['top-left', 'top-right', 'left-right', 'right-left', 'bottom-top', 'bottom-left', 'bottom-right']) {
      await page.getByTestId(`traj-${id}`).click()
      await page.waitForTimeout(120)
    }
    await page.screenshot({ path: 'e2e/screenshots/p2-trajectories.png' })
    expect(errs).toHaveLength(0)
  })

  test('target rings: armed over all 3 opponents, clickable, backdrop + Escape cancel cleanly', async ({ page }) => {
    await page.goto(HARNESS, { waitUntil: 'networkidle' })
    await page.getByTestId('arm-target').click()
    await expect(page.locator('.tlmn-target-ring')).toHaveCount(3)
    // Pick rings sit at the three opponent anchors (not at the bottom/self seat).
    const seat0 = await page.locator('[data-seat-name="0"]').boundingBox()
    for (const idx of [1, 2, 3]) {
      const ring = await page.getByTestId(`target-${idx}`).boundingBox()
      expect(ring, `ring ${idx} present`).toBeTruthy()
      if (ring && seat0) expect(Math.abs((ring.y + ring.height / 2) - (seat0.y))).toBeGreaterThan(20)
    }
    await page.screenshot({ path: 'e2e/screenshots/p2-targeting.png' })
    // Escape cancels.
    await page.keyboard.press('Escape')
    await expect(page.locator('.tlmn-target-ring')).toHaveCount(0)
    // Backdrop click cancels.
    await page.getByTestId('arm-target').click()
    await expect(page.locator('.tlmn-target-ring')).toHaveCount(3)
    await page.getByTestId('target-backdrop').click({ position: { x: 5, y: 200 } })
    await expect(page.locator('.tlmn-target-ring')).toHaveCount(0)
  })

  test('concurrency cap: ≤3 active throws even when 4 fire at once', async ({ page }) => {
    await page.goto(HARNESS, { waitUntil: 'networkidle' })
    await page.getByTestId('burst-3').click() // fires 4
    expect(Number(await page.getByTestId('throw-count').innerText())).toBeLessThanOrEqual(3)
  })

  test('reduced-motion: impact renders as a static glyph (no flight)', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    await page.goto(HARNESS, { waitUntil: 'networkidle' })
    await page.getByTestId('throw-bomb').click()
    await expect(page.locator('.tlmn-impact-static').first()).toBeVisible({ timeout: 2000 })
    await page.screenshot({ path: 'e2e/screenshots/p2-reduced-motion.png' })
    await ctx.close()
  })

  test('zoom 80/100/125%: no horizontal overflow, controls clickable', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 })
    for (const z of ['0.8', '1', '1.25']) {
      await page.goto(HARNESS, { waitUntil: 'networkidle' })
      await page.evaluate(zoom => { (document.documentElement.style as unknown as { zoom: string }).zoom = zoom }, z)
      await page.getByTestId('throw-bomb').click()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)
      expect(overflow, `overflow at zoom ${z}`).toBeFalsy()
      await page.getByTestId('ctrl-play').click()
    }
  })

  test('opponent menu → mute toggle + report dialog (Phase 4) with no raw keys', async ({ page }) => {
    await page.goto(HARNESS, { waitUntil: 'networkidle' })
    await page.getByTestId('open-menu').click()
    // Menu shows Mute + Report (real OpponentMenu component).
    const menu = page.getByText(/Mute this player|Tắt tiếng/i)
    await expect(menu.first()).toBeVisible()
    await expect(page.getByText(/Report|Báo cáo/i).first()).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/p4-opponent-menu.png' })
    // Open the report dialog → 5 reasons, no raw keys.
    await page.getByText(/Report|Báo cáo/i).first().click()
    const dlg = page.getByRole('dialog')
    await expect(dlg).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/p4-report-dialog.png' })
    const dlgText = await dlg.innerText()
    expect(dlgText).not.toMatch(/react_report_/)
    // Submit a reason → confirmation.
    await page.getByText(/Spam/i).first().click()
    await expect(page.getByTestId('report-sent')).toBeVisible()
  })

  for (const locale of LOCALES) {
    test(`locale ${locale}: item names + targeting prompt are translated (no raw keys)`, async ({ page }) => {
      await page.context().addCookies([{ name: 'NEXT_LOCALE', value: locale, url: 'http://localhost:3000' }])
      await page.goto(HARNESS, { waitUntil: 'networkidle' })
      await page.getByTestId('reaction-btn').click()
      await page.getByRole('tab').nth(4).click() // the items tab
      const panel = await page.getByRole('dialog').innerText()
      expect(panel, `raw item key in ${locale}`).not.toMatch(/react_item_|react_tab_/)
      await page.getByTestId('arm-target').click()
      const body = await page.locator('body').innerText()
      expect(body).not.toMatch(/react_(pick_target|cancel|send_item_to)/)
    })
  }
})
