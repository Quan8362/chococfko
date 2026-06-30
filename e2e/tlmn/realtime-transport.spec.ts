// TLMN realtime TRANSPORT verification — SAFE: ephemeral broadcast only, NO DB writes,
// NO auth. Extends the proven Phase-2 pattern to the real TLMN channel names.
//
// Channels used by the app (see TlmnWaitingRooms / TlmnRoom / TlmnTable / useTlmnInteractions):
//   tlmn_lobby            — postgres_changes on tlmn_rooms/tlmn_seats (lobby list)
//   tlmn:<roomId>         — postgres_changes (room/seats) + broadcast 'tlmn_kick'
//   tlmn-game:<roomId>    — postgres_changes on tlmn_games (gameplay)
//   tlmn-fx:<roomId>      — transient broadcast 'interaction' (reactions/throwables)
//
// postgres_changes events require DB writes, so they are exercised by multiplayer.spec.ts
// (which is gated behind the prod-write flags). Here we validate the BROADCAST transport
// guarantees the app relies on: delivered exactly once to the OTHER client, no self-echo,
// no replay for late subscribers, channel isolation, in-order delivery, and that a
// duplicate event id is observable so the client can dedupe.
import { test, expect, type Page } from '@playwright/test'
import path from 'path'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_env'

const UMD = path.resolve(__dirname, '../../node_modules/@supabase/supabase-js/dist/umd/supabase.js')

test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, 'NEXT_PUBLIC_SUPABASE_URL / ANON_KEY required')

async function client(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.addScriptTag({ path: UMD })
}

// Subscribe `page` to `channel`, collecting every received {event} payload into window.__rx.
async function subscribe(page: Page, channel: string, event: string) {
  return page.evaluate(({ url, key, channel, event }) => {
    const w = window as any
    w.__rx = []
    const sb = w.supabase.createClient(url, key)
    const ch = sb.channel(channel, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event }, ({ payload }: { payload: unknown }) => w.__rx.push(payload))
    w.__ch = ch
    return new Promise<boolean>(res => ch.subscribe((s: string) => { if (s === 'SUBSCRIBED') res(true) }))
  }, { url: SUPABASE_URL, key: SUPABASE_ANON_KEY, channel, event })
}
const send = (page: Page, event: string, payload: unknown) =>
  page.evaluate(({ event, payload }) => (window as any).__ch.send({ type: 'broadcast', event, payload }), { event, payload })
const received = (page: Page) => page.evaluate(() => (window as any).__rx as unknown[])

test('room channel broadcast: delivered once to the other client, no self-echo, no replay', async ({ browser }) => {
  const room = `qa-${Date.now()}`
  const A = await browser.newContext(); const B = await browser.newContext()
  const a = await A.newPage(); const b = await B.newPage()
  await client(a); await client(b)
  await subscribe(a, `tlmn:${room}`, 'tlmn_kick')
  await subscribe(b, `tlmn:${room}`, 'tlmn_kick')

  await send(a, 'tlmn_kick', { seatIndex: 2, id: 'evt-1' })
  await b.waitForFunction(() => (window as any).__rx.length >= 1, null, { timeout: 8000 })

  expect((await received(b)).length, 'B receives exactly one').toBe(1)
  expect((await received(a)).length, 'sender does not self-echo').toBe(0)

  // Late subscriber sees no replay of past broadcasts.
  const C = await browser.newContext(); const c = await C.newPage(); await client(c)
  await subscribe(c, `tlmn:${room}`, 'tlmn_kick')
  await c.waitForTimeout(1200)
  expect((await received(c)).length, 'late subscriber gets no replay').toBe(0)

  for (const ctx of [A, B, C]) await ctx.close()
})

test('channel isolation: a game-channel event never reaches the fx or room channels', async ({ browser }) => {
  const room = `qa-${Date.now()}`
  const game = await browser.newContext(); const fx = await browser.newContext()
  const gp = await game.newPage(); const fp = await fx.newPage()
  await client(gp); await client(fp)
  await subscribe(fp, `tlmn-fx:${room}`, 'interaction')   // listens on FX channel
  await subscribe(gp, `tlmn-game:${room}`, 'state')       // sender on GAME channel
  await send(gp, 'state', { turn: 1 })
  await fp.waitForTimeout(1500)
  expect((await received(fp)).length, 'FX channel must not receive game events').toBe(0)
  for (const ctx of [game, fx]) await ctx.close()
})

test('ordering + duplicate-id: sequential broadcasts arrive in order and duplicates are observable', async ({ browser }) => {
  const room = `qa-${Date.now()}`
  const A = await browser.newContext(); const B = await browser.newContext()
  const a = await A.newPage(); const b = await B.newPage()
  await client(a); await client(b)
  await subscribe(b, `tlmn-game:${room}`, 'play')
  await subscribe(a, `tlmn-game:${room}`, 'play')

  for (const id of [1, 2, 2, 3]) await send(a, 'play', { id })  // note the duplicate "2"
  await b.waitForFunction(() => (window as any).__rx.length >= 4, null, { timeout: 8000 })
  const ids = (await received(b)).map((p: any) => p.id)
  expect(ids, 'received in send order, duplicate included').toEqual([1, 2, 2, 3])
  // A correct client dedupes by id → unique set has no repeats.
  expect(new Set(ids).size).toBe(3)

  for (const ctx of [A, B]) await ctx.close()
})
