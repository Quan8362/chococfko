// Live multi-player hand driven through the UI with INDEPENDENT authenticated browser contexts.
//
// Each player runs in its own BrowserContext loaded from its own storageState (auth.setup.ts),
// so the sessions are fully isolated — exactly how two humans on two devices would play. The
// hand is driven entirely through the real table UI using the stable data-testids on the table
// (poker-table / poker-seat / poker-sit-here / poker-buyin* / poker-deal / poker-action-* /
// poker-hero* / poker-community). Every asserted number is AUTHORITATIVE: stacks are read from
// the server-rendered data-stack attributes, never computed client-side.
//
// Requires a THROWAWAY branch target (WRITE_OK ⇒ POKER_E2E_SUPABASE_URL) and a prior `setup`
// run (storageState + players.json manifest). It never touches production by default. The
// service role is used only to mint a fresh empty table (the same way coin-conservation does);
// all gameplay goes through the browser + the authoritative RPCs the server actions call.
import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import {
  SUPABASE_URL, SERVICE_ROLE_KEY, WRITE_OK, stateFileFor, MANIFEST_FILE,
} from './_env'

type PlayerManifest = Record<string, { id: string; email: string }>

const SB = 50
const BB = 100
const BUY_IN = 10_000 // 100 BB — the max on the minted table

function loadManifest(): PlayerManifest {
  if (!fs.existsSync(MANIFEST_FILE)) throw new Error(`missing ${MANIFEST_FILE} — run the \`setup\` project first`)
  return JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')) as PlayerManifest
}

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

// A fresh heads-up table (2 empty seats) owned by the host. Returns the table id.
async function mintHeadsUpTable(hostId: string): Promise<string> {
  const a = admin()
  const tableId = randomUUID()
  const { error: tErr } = await a.from('poker_tables').insert({
    id: tableId, name: `e2e-mp-${tableId.slice(0, 8)}`, created_by: hostId,
    small_blind: SB, big_blind: BB, min_buy_in_bb: 40, max_buy_in_bb: 100, capacity: 2,
  })
  if (tErr) throw new Error(`mint table: ${tErr.message}`)
  const { error: sErr } = await a.from('poker_seats').insert([0, 1].map((seat_index) => ({ table_id: tableId, seat_index })))
  if (sErr) throw new Error(`mint seats: ${sErr.message}`)
  return tableId
}

async function dropTable(tableId: string): Promise<void> {
  await admin().from('poker_tables').delete().eq('id', tableId).then(() => {}, () => {})
}

function attr(page: Page, testId: string, name: string): Promise<string | null> {
  return page.locator(`[data-testid="${testId}"]`).first().getAttribute(name)
}

async function num(page: Page, testId: string, name: string): Promise<number> {
  const v = await attr(page, testId, name)
  return Number(v ?? NaN)
}

// Sit the viewer into `seatIndex` and buy in for `amount` through the UI.
async function sitAndBuyIn(page: Page, seatIndex: number, amount: number): Promise<void> {
  const sit = page.locator(`[data-testid="poker-sit-here"][data-seat-index="${seatIndex}"]`)
  await expect(sit, `sit-here affordance for seat ${seatIndex}`).toBeVisible()
  await sit.click()
  await expect(page.locator('[data-testid="poker-buyin"]')).toBeVisible()
  await page.locator('[data-testid="poker-buyin-amount"]').fill(String(amount))
  await page.locator('[data-testid="poker-buyin-confirm"]').click()
  // The viewer now owns the hero band with the authoritative bought-in stack.
  await expect(page.locator('[data-testid="poker-hero"]')).toHaveAttribute('data-seat-index', String(seatIndex))
  await expect(page.locator('[data-testid="poker-hero"]')).toHaveAttribute('data-stack', String(amount))
}

test.describe('live multiplayer table (independent authed contexts)', () => {
  test.skip(!WRITE_OK, 'needs a branch target (POKER_E2E_SUPABASE_URL) + provisioned players')

  test('two independent authed players can each open the poker lobby', async ({ browser }) => {
    const contexts: BrowserContext[] = []
    try {
      for (const key of ['a', 'b']) {
        const ctx = await browser.newContext({ storageState: stateFileFor(key) })
        contexts.push(ctx)
        const page = await ctx.newPage()
        const resp = await page.goto('/games/poker/lobby', { waitUntil: 'domcontentloaded' })
        expect(resp?.status() ?? 0, `lobby load for player ${key}`).toBeLessThan(400)
        await expect(page.locator('body')).toBeVisible()
      }
    } finally {
      for (const c of contexts) await c.close()
    }
  })

  test('two players buy in, play a hand, and settle with authoritative stack deltas + hole-card privacy', async ({ browser }) => {
    const manifest = loadManifest()
    expect(manifest.a?.id && manifest.b?.id, 'manifest has players a & b').toBeTruthy()

    const tableId = await mintHeadsUpTable(manifest.a.id)
    const contexts: BrowserContext[] = []
    try {
      const pages: Record<'a' | 'b', Page> = {} as Record<'a' | 'b', Page>
      for (const key of ['a', 'b'] as const) {
        const ctx = await browser.newContext({ storageState: stateFileFor(key) })
        contexts.push(ctx)
        const page = await ctx.newPage()
        const resp = await page.goto(`/games/poker/${tableId}`, { waitUntil: 'domcontentloaded' })
        expect(resp?.status() ?? 0, `table load for player ${key}`).toBeLessThan(400)
        await expect(page.locator('[data-testid="poker-table"]')).toBeVisible()
        pages[key] = page
      }

      // ── Sit + buy in (independent sessions) ──
      await sitAndBuyIn(pages.a, 0, BUY_IN)
      await sitAndBuyIn(pages.b, 1, BUY_IN)

      // Each player sees the opponent seated with the authoritative buy-in stack.
      await expect(pages.a.locator('[data-testid="poker-seat"][data-seat-index="1"]')).toHaveAttribute('data-stack', String(BUY_IN))
      await expect(pages.b.locator('[data-testid="poker-seat"][data-seat-index="0"]')).toHaveAttribute('data-stack', String(BUY_IN))

      // ── Refresh mid-session re-syncs from the server (no client state lost) ──
      await pages.a.reload({ waitUntil: 'domcontentloaded' })
      await expect(pages.a.locator('[data-testid="poker-hero"]')).toHaveAttribute('data-stack', String(BUY_IN))

      // ── Deal a hand (either seated player may start it) ──
      const deal = pages.a.locator('[data-testid="poker-deal"]')
      await expect(deal).toBeVisible()
      await deal.click()

      // Both clients observe the live hand (authoritative phase flip).
      for (const key of ['a', 'b'] as const) {
        await expect(pages[key].locator('[data-testid="poker-table"]')).toHaveAttribute('data-live', '1')
      }

      // ── Hole-card privacy: each player sees exactly their OWN two hole cards, and NO opponent
      // card is ever rendered face-up. Face-up cards carry aria-label "<rank> of <suit>"; backs
      // carry "face down card". Preflop the board is empty, so the ONLY face-up cards anywhere on
      // a player's page must be that player's own two hole cards. ──
      for (const key of ['a', 'b'] as const) {
        const heroCards = pages[key].locator('[data-testid="poker-hero-cards"]')
        await expect(heroCards).toHaveAttribute('data-count', '2')
        await expect(pages[key].locator('[aria-label*=" of "]')).toHaveCount(2)
        await expect(pages[key].locator('[data-testid="poker-community"]')).toHaveAttribute('data-count', '0')
      }

      // ── Identify the small blind (heads-up: the button/SB acts first preflop) ──
      const turnSeat = await num(pages.a, 'poker-table', 'data-turn-seat')
      const sbKey = (await num(pages.a, 'poker-table', 'data-viewer-seat')) === turnSeat ? 'a' : 'b'
      const bbKey = sbKey === 'a' ? 'b' : 'a'
      const sbPage = pages[sbKey]
      const bbPage = pages[bbKey]

      // ── Duplicate-action protection: the SB double-clicks Fold; the in-flight guard must accept
      // exactly one intent (no double submit, no crash). The hand then resolves normally. ──
      const fold = sbPage.locator('[data-testid="poker-action-fold"]')
      await expect(fold).toBeVisible()
      await Promise.all([fold.click(), fold.click().catch(() => {})])

      // ── Settlement: hand ends, both clients return to a non-live state ──
      for (const key of ['a', 'b'] as const) {
        await expect(pages[key].locator('[data-testid="poker-table"]')).toHaveAttribute('data-live', '0')
      }

      // ── AUTHORITATIVE deltas: SB folded → BB wins the small blind. SB −SB, BB +SB, coins conserved. ──
      const sbStack = await num(sbPage, 'poker-hero', 'data-stack')
      const bbStack = await num(bbPage, 'poker-hero', 'data-stack')
      expect(sbStack, 'SB lost exactly the small blind').toBe(BUY_IN - SB)
      expect(bbStack, 'BB won exactly the small blind').toBe(BUY_IN + SB)
      expect(sbStack + bbStack, 'total coins on the table are conserved').toBe(2 * BUY_IN)
    } finally {
      for (const c of contexts) await c.close()
      await dropTable(tableId)
    }
  })
})
