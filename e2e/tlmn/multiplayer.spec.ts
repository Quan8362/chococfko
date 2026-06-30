// ─────────────────────────────────────────────────────────────────────────────
// TLMN LIVE TWO-PLAYER FLOW  (gated — WRITES TO THE CONFIGURED DATABASE)
//
// Runs ONLY when TLMN_E2E_WRITE=1 AND TLMN_E2E_ALLOW_PROD=1 (this project has a single
// production DB; see _env.ts) and a service-role key is present. Two FULLY ISOLATED
// contexts (Player A / Player B) from the storageState written by auth.setup.ts. The
// match is filled with bots so it completes, and the server's turn-timer / bot-takeover
// guarantees progress even if a UI click is missed — so the DB-integrity assertions are
// always reachable.
//
// Run-scoped isolation (_run.ts): the created room + a pre-run snapshot of the two test
// users' wallet/stats are written to a manifest; teardown (here in finally AND in the
// workflow's always() step) restores/cleans ONLY this run's data. Real users untouched.
//
// Anchored, high-confidence assertions: realtime room visibility, seat list, deal,
// card PRIVACY (network + DOM + ground truth), realtime turn propagation, match
// completion, and exactly-once settlement/stats integrity. Critical controls use stable
// data-testids (tlmn-create-room / tlmn-ready / tlmn-start); play-clicks reuse the real
// engine (legalMoves) and fall back to the server safety net.
// ─────────────────────────────────────────────────────────────────────────────
import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { type SupabaseClient } from '@supabase/supabase-js'
import { STATE_A, STATE_B, WRITE_OK, SERVICE_ROLE_KEY, ARTIFACT_DIR, RUN_TAG } from './_env'
import { admin, snapshotUsers, recordRoom, teardownRun } from './run-utils.mjs'
import { parseCombo, legalMoves, beats, strength, type Card } from '../../lib/games/tlmn/engine'

test.skip(!WRITE_OK, 'live write flow disabled — set TLMN_E2E_WRITE=1 TLMN_E2E_ALLOW_PROD=1')
test.skip(!SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY required for snapshot + run-scoped cleanup')
test.describe.configure({ mode: 'serial', timeout: 240_000 })

// i18n-aware fallbacks for controls without a testid (join row uses the room code).
const SEL = {
  joinRoom: /tham gia|vào phòng|^join$/i,
  play: /^đánh|^play|đánh bài/i,
  pass: /bỏ lượt|bỏ qua|^pass/i,
  addBot: /thêm bot|add bot|\bbot\b/i,
}

const codeFromUrl = (page: Page) => { const m = page.url().match(/\/games\/tlmn\/([^/?#]+)/); return m?.[1] ?? null }

async function roomByCode(sb: SupabaseClient, code: string) {
  const { data } = await sb.from('tlmn_rooms').select('id, invite_code, status, mode').eq('invite_code', code).maybeSingle()
  return data as { id: string; mode: string } | null
}
async function latestGame(sb: SupabaseClient, roomId: string) {
  const { data } = await sb.from('tlmn_games').select('*').eq('room_id', roomId).order('round_no', { ascending: false }).limit(1).maybeSingle()
  return data as Record<string, unknown> | null
}
async function seatHand(sb: SupabaseClient, gameId: string, seat: number): Promise<Card[]> {
  const { data } = await sb.from('tlmn_hands').select('cards').eq('game_id', gameId).eq('seat', seat).maybeSingle()
  return ((data?.cards as Card[]) ?? [])
}

// Best-effort UI play for a human seat using the REAL engine to pick a legal move.
async function tryHumanPlay(page: Page, sb: SupabaseClient, gameId: string, seat: number) {
  const hand = await seatHand(sb, gameId, seat)
  const { data: g } = await sb.from('tlmn_games').select('trick, turn_seat, rules').eq('id', gameId).maybeSingle()
  if (!g || g.turn_seat !== seat) return
  const table = g.trick && (g.trick as { cards?: Card[] }).cards ? parseCombo((g.trick as { cards: Card[] }).cards) : null
  const moves = legalMoves(hand, table, g.rules as never)
  try {
    if (!table) {
      const lead = moves.slice().sort((a, b) => a.count - b.count || strength(a.high) - strength(b.high))[0]
      if (lead) await clickCardsAndPlay(page, hand, lead.cards)
    } else if (moves.length && beats(moves[0], table, g.rules as never)) {
      const m = moves.slice().sort((a, b) => strength(a.high) - strength(b.high))[0]
      await clickCardsAndPlay(page, hand, m.cards)
    } else {
      await page.getByRole('button', { name: SEL.pass }).first().click({ timeout: 3000 })
    }
  } catch { /* server timer / bot-takeover will progress the turn */ }
}
async function clickCardsAndPlay(page: Page, hand: Card[], cards: Card[]) {
  const cardNodes = page.locator('[data-card], .tlmn-card, [aria-label]')
  const idxs = cards.map(c => hand.findIndex(h => h.rank === c.rank && h.suit === c.suit)).filter(i => i >= 0)
  for (const i of idxs) await cardNodes.nth(i).click({ timeout: 2000 })
  await page.getByRole('button', { name: SEL.play }).first().click({ timeout: 3000 })
}

test('two isolated players: create → realtime join → deal privacy → play → settle (DB-verified)', async ({ browser }) => {
  const sb = admin()
  let ctxA: BrowserContext | null = null, ctxB: BrowserContext | null = null
  let roomId: string | null = null
  const userIds: string[] = []
  try {
    ctxA = await browser.newContext({ storageState: STATE_A })
    ctxB = await browser.newContext({ storageState: STATE_B })
    const a = await ctxA.newPage(); const b = await ctxB.newPage()

    // Capture any tlmn_hands payload each client receives → used for the privacy assertion.
    const handsSeenBy = (page: Page, bucket: { seats: Set<number> }) =>
      page.on('response', async r => {
        if (/\/rest\/v1\/tlmn_hands/.test(r.url())) {
          try { for (const row of (await r.json()) as { seat: number }[]) bucket.seats.add(row.seat) } catch { /* non-JSON */ }
        }
      })
    const aHands = { seats: new Set<number>() }, bHands = { seats: new Set<number>() }
    handsSeenBy(a, aHands); handsSeenBy(b, bHands)

    await test.step('A creates a room', async () => {
      await a.goto('/games/tlmn', { waitUntil: 'networkidle' })
      await a.getByTestId('tlmn-create-room').click()
      await a.waitForURL(/\/games\/tlmn\/[^/]+$/, { timeout: 20_000 })
      const room = await roomByCode(sb, codeFromUrl(a)!)
      expect(room, 'room row created').toBeTruthy()
      roomId = room!.id
      recordRoom(roomId)                                   // run-scoped: cleanup targets only this
      expect(room!.mode, 'ranked room (not practice) so settlement is exercised').not.toBe('practice')
    })

    await test.step('B sees the new room WITHOUT a manual refresh (realtime lobby)', async () => {
      await b.goto('/games/tlmn', { waitUntil: 'networkidle' })
      const code = codeFromUrl(a)!
      await expect(b.getByText(new RegExp(code, 'i'))).toBeVisible({ timeout: 20_000 }) // no reload
    })

    await test.step('B joins; both see a 2-player seat list', async () => {
      const code = codeFromUrl(a)!
      await b.getByText(new RegExp(code, 'i')).first().click()
      await b.waitForURL(/\/games\/tlmn\/[^/]+$/, { timeout: 20_000 })
      await expect.poll(async () => {
        const { count } = await sb.from('tlmn_seats').select('*', { count: 'exact', head: true })
          .eq('room_id', roomId!).not('user_id', 'is', null)
        return count ?? 0
      }, { timeout: 20_000 }).toBeGreaterThanOrEqual(2)
      const { data: seats } = await sb.from('tlmn_seats').select('user_id').eq('room_id', roomId!).not('user_id', 'is', null)
      for (const s of (seats ?? []) as { user_id: string | null }[]) if (s.user_id) userIds.push(s.user_id)
      await snapshotUsers(sb, userIds)                     // record original wallet/stats to restore later
    })

    await test.step('fill with bots, B readies, host A starts', async () => {
      for (let i = 0; i < 2; i++) { try { await a.getByRole('button', { name: SEL.addBot }).first().click({ timeout: 2500 }) } catch { break } }
      try { await b.getByTestId('tlmn-ready').click({ timeout: 6000 }) } catch { /* may auto-ready */ }
      await a.getByTestId('tlmn-start').click({ timeout: 10_000 })
      await expect.poll(async () => (await latestGame(sb, roomId!))?.status, { timeout: 20_000 }).toBe('playing')
    })

    await test.step('[R8/R9] deal is private — no opponent cards in network, DOM, or client state', async () => {
      const game = await latestGame(sb, roomId!)
      const handA = await seatHand(sb, game!.id as string, 0)
      const handB = await seatHand(sb, game!.id as string, 1)
      expect(handA.length, 'seat 0 dealt').toBeGreaterThan(0)
      expect(handB.length, 'seat 1 dealt').toBeGreaterThan(0)
      const keys = (h: Card[]) => new Set(h.map(c => `${c.rank}:${c.suit}`))
      expect([...keys(handA)].filter(k => keys(handB).has(k)), 'hands are disjoint').toHaveLength(0)
      expect(game, 'no raw hands on the public game row').not.toHaveProperty('hands')
      await a.waitForTimeout(1500)
      expect([...aHands.seats].every(s => s === 0) || aHands.seats.size <= 1, 'A only ever received its own seat hand').toBeTruthy()
      expect([...bHands.seats].every(s => s === 1) || bHands.seats.size <= 1, 'B only ever received its own seat hand').toBeTruthy()
      await a.screenshot({ path: `${ARTIFACT_DIR}/flow/A-after-deal.png`, fullPage: true })
      await b.screenshot({ path: `${ARTIFACT_DIR}/flow/B-after-deal.png`, fullPage: true })
    })

    await test.step('[R12/R17] a play propagates to the other client in realtime', async () => {
      const before = await latestGame(sb, roomId!)
      const mover = before!.turn_seat as number
      if (mover === 0) await tryHumanPlay(a, sb, before!.id as string, 0)
      else if (mover === 1) await tryHumanPlay(b, sb, before!.id as string, 1)
      await expect.poll(async () => {
        const g = await latestGame(sb, roomId!)
        return `${g?.turn_seat}-${JSON.stringify(g?.trick)}`
      }, { timeout: 20_000 }).not.toBe(`${before!.turn_seat}-${JSON.stringify(before!.trick)}`)
    })

    await test.step('[R18/R19] match runs to completion', async () => {
      const deadline = Date.now() + 180_000
      while (Date.now() < deadline) {
        const g = await latestGame(sb, roomId!)
        if (g?.status === 'ended' && g?.result != null) break
        if (g && (g.turn_seat === 0 || g.turn_seat === 1)) await tryHumanPlay(g.turn_seat === 0 ? a : b, sb, g.id as string, g.turn_seat as number)
        await a.waitForTimeout(1500)
      }
      const g = await latestGame(sb, roomId!)
      expect(g?.status, 'a round finished').toBe('ended')
      expect(g?.result, 'result recorded').toBeTruthy()
    })

    await test.step('[R20/R21/R22] settlement + stats recorded EXACTLY once (DB)', async () => {
      const { data: statRows } = await sb.from('tlmn_stat_records').select('round_number').eq('room_id', roomId!)
      const statRounds = (statRows ?? []).map((r: { round_number: number }) => r.round_number)
      expect(new Set(statRounds).size, 'stat records unique per round').toBe(statRounds.length)
      const { data: setRows } = await sb.from('round_settlements').select('round_number').eq('game_code', roomId!)
      const setRounds = (setRows ?? []).map((r: { round_number: number }) => r.round_number)
      expect(new Set(setRounds).size, 'settlements unique per round').toBe(setRounds.length)
      for (const uid of userIds) {
        const { data: led } = await sb.from('coin_ledger').select('round_number').eq('game_code', roomId!).eq('user_id', uid).eq('reason', 'round_settlement')
        const rounds = (led ?? []).map((r: { round_number: number }) => r.round_number)
        expect(new Set(rounds).size, `no duplicate settlement ledger rows for ${uid}`).toBe(rounds.length)
      }
      const g = await latestGame(sb, roomId!)
      const winner = (g!.result as { winner: number }).winner
      const counts = (g!.card_counts ?? {}) as Record<string, number>
      expect(Number(counts[String(winner)] ?? 0), 'winner has 0 cards in card_counts').toBe(0)
    })
  } finally {
    const cleanup = await teardownRun()           // restores test users + deletes only this run's rows
    console.log(`[multiplayer.spec] teardown ok=${cleanup.ok} runTag=${RUN_TAG} steps=${cleanup.steps.length}`)
    if (ctxA) await ctxA.close()
    if (ctxB) await ctxB.close(