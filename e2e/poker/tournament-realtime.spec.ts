// Live TOURNAMENT table driven through the UI with INDEPENDENT authenticated browser contexts.
//
// Two throwaway players (a, b), each in its own BrowserContext + storageState (auth.setup.ts), sit
// at the SAME heads-up tournament table and play real hands through the live surface. Everything is
// AUTHORITATIVE: hand #, turn, pot, board, stacks and completeness are read from the server-rendered
// data-* attributes on the tournament table (tnmt-table / tnmt-seat / tnmt-hero* / tnmt-board /
// tnmt-pot) — never computed client-side. Hole-card privacy is asserted structurally: the only
// face-up cards on each page are that player's OWN two cards; the opponent renders face-down.
//
// The tournament is provisioned via the service role (create → 2 entries → seat_draw → RUNNING),
// exactly the state the audited operator flow produces; all GAMEPLAY goes through the browser + the
// server actions' authoritative RPCs. Requires a THROWAWAY branch target (WRITE_OK) + a prior
// `setup` run. Never touches production by default.
import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { SUPABASE_URL, SERVICE_ROLE_KEY, WRITE_OK, stateFileFor, MANIFEST_FILE } from './_env'

type PlayerManifest = Record<string, { id: string; email: string }>

const SB = 25
const BB = 50
const START = 5000

function loadManifest(): PlayerManifest {
  if (!fs.existsSync(MANIFEST_FILE)) throw new Error(`missing ${MANIFEST_FILE} — run the \`setup\` project first`)
  return JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')) as PlayerManifest
}

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

const CONFIG = {
  blindStructure: { levels: [{ smallBlind: SB, bigBlind: BB, ante: 0 }, { smallBlind: 50, bigBlind: 100, ante: 0 }] },
  payoutStructure: { kind: 'winner_take_all' },
}

// Provision a heads-up tournament seated + RUNNING for players a & b. Returns the tournament id.
async function provisionSeatedTournament(aId: string, bId: string): Promise<string> {
  const a = admin()
  const id = randomUUID()
  const { error: tErr } = await a.from('poker_tournaments').insert({
    id, title: `e2e-tnmt-${id.slice(0, 8)}`, state: 'STARTING',
    entry_fee: 1000, starting_stack: START, min_entries: 2, max_entries: 2, seats_per_table: 2,
    guaranteed_prize_pool: 0, config: CONFIG,
  })
  if (tErr) throw new Error(`create tournament: ${tErr.message}`)
  const { error: eErr } = await a.from('poker_tournament_entries').insert([
    { tournament_id: id, user_id: aId, seq: 0, state: 'REGISTERED', chips: 0, entry_fee: 1000 },
    { tournament_id: id, user_id: bId, seq: 0, state: 'REGISTERED', chips: 0, entry_fee: 1000 },
  ])
  if (eErr) throw new Error(`create entries: ${eErr.message}`)
  const { error: sErr } = await a.rpc('poker_tournament_seat_draw', { p_tournament_id: id })
  if (sErr) throw new Error(`seat_draw: ${sErr.message}`)
  const { error: rErr } = await a.from('poker_tournaments').update({ state: 'RUNNING' }).eq('id', id)
  if (rErr) throw new Error(`begin play: ${rErr.message}`)
  return id
}

async function dropTournament(id: string): Promise<void> {
  await admin().from('poker_tournaments').delete().eq('id', id).then(() => {}, () => {})
}

function attr(page: Page, testId: string, name: string): Promise<string | null> {
  return page.locator(`[data-testid="${testId}"]`).first().getAttribute(name)
}
async function num(page: Page, testId: string, name: string): Promise<number> {
  return Number((await attr(page, testId, name)) ?? NaN)
}

test.describe('live tournament table (independent authed contexts)', () => {
  test.skip(!WRITE_OK, 'needs a branch target (POKER_E2E_SUPABASE_URL) + provisioned players')

  test('two seated players play a hand with realtime sync, hole-card privacy, and a next-hand transition', async ({ browser }) => {
    const manifest = loadManifest()
    expect(manifest.a?.id && manifest.b?.id, 'manifest has players a & b').toBeTruthy()

    const id = await provisionSeatedTournament(manifest.a.id, manifest.b.id)
    const contexts: BrowserContext[] = []
    try {
      const pages: Record<'a' | 'b', Page> = {} as Record<'a' | 'b', Page>
      for (const key of ['a', 'b'] as const) {
        const ctx = await browser.newContext({ storageState: stateFileFor(key), viewport: { width: 1280, height: 720 } })
        contexts.push(ctx)
        const page = await ctx.newPage()
        const resp = await page.goto(`/games/poker/tournaments/${id}/table`, { waitUntil: 'domcontentloaded' })
        expect(resp?.status() ?? 0, `table load for player ${key}`).toBeLessThan(400)
        await expect(page.locator('[data-testid="tnmt-table"]')).toBeVisible()
        pages[key] = page
      }

      // ── Hand 1 auto-opens (server-authoritative next-hand). Both clients observe it live. ──
      for (const key of ['a', 'b'] as const) {
        await expect(pages[key].locator('[data-testid="tnmt-table"]')).toHaveAttribute('data-hand-no', '1', { timeout: 20_000 })
        await expect(pages[key].locator('[data-testid="tnmt-table"]')).toHaveAttribute('data-live', '1')
      }

      // ── Hole-card privacy: each page shows EXACTLY its own two face-up cards; the opponent is
      // face-down; the board is empty preflop. Face-up cards carry aria-label "<rank> of <suit>". ──
      for (const key of ['a', 'b'] as const) {
        await expect(pages[key].locator('[data-testid="tnmt-hero-cards"]')).toHaveAttribute('data-count', '2')
        await expect(pages[key].locator('[aria-label*=" of "]')).toHaveCount(2)
        await expect(pages[key].locator('[data-testid="tnmt-board"]')).toHaveAttribute('data-count', '0')
      }

      // ── Cross-context agreement: turn seat + board agree across both independent sessions. ──
      const turnA = await num(pages.a, 'tnmt-table', 'data-turn-seat')
      const turnB = await num(pages.b, 'tnmt-table', 'data-turn-seat')
      expect(turnA, 'both clients agree on the current turn seat').toBe(turnB)

      // ── Refresh recovery: reload player B mid-hand — state restores from the server (identity,
      // seat, own cards, hand number) with no stale action replayed. ──
      await pages.b.reload({ waitUntil: 'domcontentloaded' })
      await expect(pages.b.locator('[data-testid="tnmt-table"]')).toHaveAttribute('data-hand-no', '1')
      await expect(pages.b.locator('[data-testid="tnmt-hero-cards"]')).toHaveAttribute('data-count', '2')
      await expect(pages.b.locator('[aria-label*=" of "]')).toHaveCount(2)

      // ── The SB (heads-up: button acts first preflop) folds. Double-click exercises the in-flight
      // duplicate-submit guard (exactly one intent accepted, no crash). ──
      const viewerA = await num(pages.a, 'tnmt-table', 'data-viewer-seat')
      const sbKey = viewerA === turnA ? 'a' : 'b'
      const sbPage = pages[sbKey]
      const bbKey = sbKey === 'a' ? 'b' : 'a'
      const fold = sbPage.locator('[data-testid="poker-action-fold"]')
      await expect(fold).toBeVisible()
      await Promise.all([fold.click(), fold.click().catch(() => {})])

      // ── Next-hand transition: the hand settles once and hand 2 auto-opens for BOTH clients
      // (server-authoritative; a duplicate ensure from either client is an idempotent no-op). ──
      for (const key of ['a', 'b'] as const) {
        await expect(pages[key].locator('[data-testid="tnmt-table"]')).toHaveAttribute('data-hand-no', '2', { timeout: 20_000 })
      }

      // ── AUTHORITATIVE conservation: after the fold + a fresh hand's blinds, the chips on the
      // table are conserved — the live behind-stacks PLUS the chips committed to the pot sum to
      // 2×START (a fold moves chips WITHIN the table; nothing is minted/burned). `tnmt-hero`
      // data-stack is the LIVE behind-stack, so hand 2's just-posted blinds sit in `tnmt-pot`
      // (data-amount = potTotal), not in the stacks — the pot must be counted for conservation. ──
      const stackA2 = await num(pages.a, 'tnmt-hero', 'data-stack')
      const stackB2 = await num(pages.b, 'tnmt-hero', 'data-stack')
      const pot2 = await num(pages.a, 'tnmt-pot', 'data-amount')
      expect(stackA2 + stackB2 + pot2, 'tournament chips are conserved across the hand').toBe(2 * START)
      // The folder never profited from folding: its live behind-stack cannot exceed its start.
      const folderStart = START
      const folderStack = sbKey === 'a' ? stackA2 : stackB2
      expect(folderStack, 'the folder cannot gain chips').toBeLessThanOrEqual(folderStart)

      // Privacy still holds in the new hand: exactly two own face-up cards per page.
      for (const key of ['a', 'b'] as const) {
        await expect(pages[key].locator('[aria-label*=" of "]')).toHaveCount(2)
      }
      void bbKey
    } finally {
      for (const c of contexts) await c.close()
      await dropTournament(id)
    }
  })
})
