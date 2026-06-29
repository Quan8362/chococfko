// Two-user (two browser-context) E2E harness for Caro Online realtime play.
//
// PENDING: this needs two real, independent normal accounts. It is gated on two
// Playwright storageState files and SKIPS itself when they are absent, so CI / a
// no-account run stays green. Nothing here stores credentials in source control.
//
// One-time setup (NOT committed):
//   1. npm i -D @playwright/test && npx playwright install
//   2. Sign in as Player A in a browser, save its storage:
//        CARO_A_STORAGE=.auth/a.json   (e.g. via `npx playwright codegen --save-storage`)
//      Sign in as Player B likewise:
//        CARO_B_STORAGE=.auth/b.json
//      (add `.auth/` to .gitignore — it holds session cookies)
//   3. Target a deployment:
//        CARO_BASE_URL=https://chococfko.com
//   4. npx playwright test --config e2e/playwright.config.ts caro.spec.ts
//
// Until then, the authoritative DB behaviour is covered by the rolled-back
// transaction tests and the static guards in lib/caro/caroTimer.test.ts.
import { test, expect, type BrowserContext, type Page } from '@playwright/test'

const A_STORAGE = process.env.CARO_A_STORAGE
const B_STORAGE = process.env.CARO_B_STORAGE
const BASE = process.env.CARO_BASE_URL || 'http://localhost:3000'
const READY = Boolean(A_STORAGE && B_STORAGE)

test.describe('Caro two-user realtime (requires Player A + Player B accounts)', () => {
  test.skip(!READY, 'Set CARO_A_STORAGE and CARO_B_STORAGE to two real accounts to run.')

  let ctxA: BrowserContext
  let ctxB: BrowserContext
  let pageA: Page
  let pageB: Page

  test.beforeAll(async ({ browser }) => {
    ctxA = await browser.newContext({ storageState: A_STORAGE })
    ctxB = await browser.newContext({ storageState: B_STORAGE })
    pageA = await ctxA.newPage()
    pageB = await ctxB.newPage()
  })
  test.afterAll(async () => { await ctxA?.close(); await ctxB?.close() })

  test('full multiplayer flow: create, explicit join, sync, refresh, win, history', async () => {
    // 1. A creates a room.
    await pageA.goto(`${BASE}/games/caro`)
    await pageA.getByRole('button', { name: /tạo phòng|create/i }).click()
    await pageA.waitForURL(/\/games\/caro\/[A-Z0-9]{5}/)
    const url = pageA.url()
    const roomCode = url.split('/').pop() as string

    // 2. B opens the room URL — must NOT auto-join (Player O stays open).
    await pageB.goto(url)
    await expect(pageB.getByRole('button', { name: /tham gia phòng|join room/i })).toBeVisible()

    // 4. Different user ids (sanity: A is host, B is not yet a player).
    //    (Asserted indirectly: B still sees the join button, A does not.)
    await expect(pageA.getByRole('button', { name: /tham gia phòng|join room/i })).toHaveCount(0)

    // 3. B clicks explicit join.
    await pageB.getByRole('button', { name: /tham gia phòng|join room/i }).click()

    // 5/7. X -> O sync: A (X) plays; B (O) sees it and the turn/deadline update.
    const cellsA = pageA.locator('button.w-9')
    await cellsA.nth(0).click()
    await expect(pageB.locator('button.w-9').nth(0)).toContainText(/✕/)

    // 6. O -> X sync: B plays; A sees it.
    await pageB.locator('button.w-9').nth(1).click()
    await expect(cellsA.nth(1)).toContainText(/○/)

    // 8. Refresh does not reset the deadline / state: A reloads mid-game.
    await pageA.reload()
    await expect(cellsA.nth(0)).toContainText(/✕/)

    // 9. Disconnect/reconnect: drop B offline then restore; state reconciles.
    await ctxB.setOffline(true)
    await pageA.locator('button.w-9').nth(15).click()
    await ctxB.setOffline(false)
    await expect(pageB.locator('button.w-9').nth(15)).toContainText(/✕/)

    // 10. Complete a win for X (five in a row on row 0): cols already 0,15-as-noise;
    //     play out a clean five. (Exact sequence depends on board state above; this
    //     is a template — adjust cells to force five-in-a-row in the real run.)
    //     -> assert a finished/win banner appears for both.
    //
    // 11. History finalizes once: navigate both to the lobby and assert the match
    //     appears exactly once in the history list.
    test.info().annotations.push({
      type: 'pending',
      description: 'Win sequence + history-once assertions to be finalized during the real two-account run.',
    })
    void roomCode
  })
})
