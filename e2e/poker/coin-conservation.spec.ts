// Headless multi-player coin-conservation integration test.
//
// Drives a COMPLETE 3-player hand through the SAME authoritative RPCs the server actions call:
//   ensure_wallet → poker_sit_down (as each player) → poker_start_hand → poker_commit_action ×3
//   → poker_settle_hand → poker_stand_up (as each player), asserting the TOTAL-COIN invariant
//   (Σ wallets + Σ escrow == constant) at every step and that per-player net deltas sum to zero.
//
// This is the automated twin of supabase/poker_full_hand_conservation_test.sql. It needs a
// service-role key for a THROWAWAY branch (WRITE_OK) — it never touches production by default.
// No browser page is used; it talks straight to the DB via supabase-js.
import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { SUPABASE_URL, SUPABASE_ANON_KEY, SERVICE_ROLE_KEY, WRITE_OK } from './_env'

type Admin = SupabaseClient

async function totalCoins(admin: Admin, userIds: string[], tableId: string): Promise<number> {
  const { data: wallets } = await admin.from('game_wallets').select('balance').in('user_id', userIds)
  const { data: seats } = await admin.from('poker_seats').select('stack, committed_total, pending_topup').eq('table_id', tableId)
  const w = (wallets ?? []).reduce((s, r: { balance: number }) => s + Number(r.balance), 0)
  const e = (seats ?? []).reduce((s, r: { stack: number; committed_total: number; pending_topup: number }) =>
    s + Number(r.stack) + Number(r.committed_total) + Number(r.pending_topup), 0)
  return w + e
}

test('3-player full hand conserves coins end-to-end', async () => {
  test.skip(!WRITE_OK, 'needs a branch target (POKER_E2E_SUPABASE_URL) or POKER_E2E_ALLOW_PROD=1')
  expect(SERVICE_ROLE_KEY, 'service-role key required').not.toEqual('')

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

  // Provision three ephemeral players + funded wallets, and sign each in for player-scoped RPCs.
  const players: { id: string; email: string; client: Admin }[] = []
  for (let i = 0; i < 3; i++) {
    const email = `qa.poker.conserve.${randomUUID()}@chococfko.test`
    const password = `Qa!${randomUUID()}`
    const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    expect(error, `create user ${email}`).toBeNull()
    const id = created!.user!.id
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    await client.auth.signInWithPassword({ email, password })
    await client.rpc('ensure_wallet') // 1,000,000 signup grant
    players.push({ id, email, client })
  }
  const ids = players.map((p) => p.id)

  // A fresh 3-max table (SB50/BB100) with three empty seats.
  const tableId = randomUUID()
  await admin.from('poker_tables').insert({
    id: tableId, name: 'e2e-conserve', created_by: players[0].id,
    small_blind: 50, big_blind: 100, min_buy_in_bb: 40, max_buy_in_bb: 100, capacity: 3,
  })
  await admin.from('poker_seats').insert([0, 1, 2].map((seat_index) => ({ table_id: tableId, seat_index })))

  try {
    const INITIAL = await totalCoins(admin, ids, tableId)
    expect(INITIAL).toBe(3_000_000)

    // Each player buys in 10,000 via the player-scoped RPC.
    for (let i = 0; i < 3; i++) {
      const { error } = await players[i].client.rpc('poker_sit_down', { p_table_id: tableId, p_seat_index: i, p_buy_in: 10000 })
      expect(error, `sit_down seat ${i}`).toBeNull()
    }
    expect(await totalCoins(admin, ids, tableId)).toBe(INITIAL)

    // Start the hand (service role): button 0, SB seat1 (50), BB seat2 (100).
    const { data: started, error: startErr } = await admin.rpc('poker_start_hand', {
      p_table_id: tableId, p_hand_no: 1, p_button_seat: 0, p_turn_seat: 0,
      p_turn_deadline: new Date(Date.now() + 20_000).toISOString(),
      p_current_bet: 100, p_min_raise: 100, p_last_full_raise: 100,
      p_pots: { main: { amount: 150, eligibleSeatIndexes: [0, 1, 2] }, sides: [] },
      p_engine_state: { v: 1, handNo: 1, street: 'PREFLOP', actionSeq: 0 },
      p_seats: [
        { seat_index: 0, user_id: players[0].id, stack: 10000, committed_this_street: 0, committed_total: 0, all_in: false },
        { seat_index: 1, user_id: players[1].id, stack: 9950, committed_this_street: 50, committed_total: 50, all_in: false },
        { seat_index: 2, user_id: players[2].id, stack: 9900, committed_this_street: 100, committed_total: 100, all_in: false },
      ],
      p_hole: [
        { seat_index: 0, user_id: players[0].id, cards: ['As', 'Kd'] },
        { seat_index: 1, user_id: players[1].id, cards: ['7c', '2d'] },
        { seat_index: 2, user_id: players[2].id, cards: ['Th', 'Tc'] },
      ],
      p_deck: { stub: ['9h', '9s', '9d', '9c', '8h'], seed: 42, deal_index: 11, burns: [] },
      p_blinds: [
        { seat_index: 1, user_id: players[1].id, type: 'post_sb', amount: 50 },
        { seat_index: 2, user_id: players[2].id, type: 'post_bb', amount: 100 },
      ],
    })
    expect(startErr, 'start_hand').toBeNull()
    const handId = (started as { hand_id: string }).hand_id
    expect(await totalCoins(admin, ids, tableId)).toBe(INITIAL)

    // Preflop: seat0 calls, seat1 completes, seat2 checks — each a conserving stack→pot move.
    const commits = [
      { seq: 0, seat: 0, stack: 9900, cts: 100, ct: 100, la: 'call', type: 'call', amt: 100, uid: players[0].id },
      { seq: 1, seat: 1, stack: 9900, cts: 100, ct: 100, la: 'call', type: 'call', amt: 50, uid: players[1].id },
      { seq: 2, seat: 2, stack: 9900, cts: 100, ct: 100, la: 'check', type: 'check', amt: null, uid: players[2].id },
    ]
    for (const c of commits) {
      const { data, error } = await admin.rpc('poker_commit_action', {
        p_hand_id: handId, p_expected_seq: c.seq, p_idem: `commit-${c.seq}`,
        p_hand: { action_seq: c.seq + 1, current_bet: 100, engine_state: { actionSeq: c.seq + 1 } },
        p_seats: [{ seat_index: c.seat, stack: c.stack, committed_this_street: c.cts, committed_total: c.ct, all_in: false, last_action: c.la }],
        p_audit: { seat_index: c.seat, user_id: c.uid, type: c.type, amount: c.amt },
      })
      expect(error, `commit seq ${c.seq}`).toBeNull()
      expect((data as { ok: boolean }).ok).toBe(true)
      expect(await totalCoins(admin, ids, tableId)).toBe(INITIAL)
    }

    // Settle the 300 pot to seat0 (conservation guard enforces 300 == 300).
    const { data: settled, error: settleErr } = await admin.rpc('poker_settle_hand', {
      p_hand_id: handId, p_payouts: [{ seatIndex: 0, amount: 300 }], p_refunds: [], p_total_contributed: 300,
    })
    expect(settleErr, 'settle').toBeNull()
    expect((settled as { settled: boolean }).settled).toBe(true)
    expect(await totalCoins(admin, ids, tableId)).toBe(INITIAL)

    // Everyone cashes out.
    for (let i = 0; i < 3; i++) {
      const { error } = await players[i].client.rpc('poker_stand_up', { p_table_id: tableId, p_seat_index: i })
      expect(error, `stand_up seat ${i}`).toBeNull()
    }
    expect(await totalCoins(admin, ids, tableId)).toBe(INITIAL)

    // Final wallets: winner +200, losers -100 each; deltas sum to zero.
    const { data: finalW } = await admin.from('game_wallets').select('user_id, balance').in('user_id', ids)
    const bal = Object.fromEntries((finalW ?? []).map((r: { user_id: string; balance: number }) => [r.user_id, Number(r.balance)]))
    expect(bal[players[0].id]).toBe(1_000_200)
    expect(bal[players[1].id]).toBe(999_900)
    expect(bal[players[2].id]).toBe(999_900)
    const net = (bal[players[0].id] - 1e6) + (bal[players[1].id] - 1e6) + (bal[players[2].id] - 1e6)
    expect(net).toBe(0)
  } finally {
    // Best-effort cleanup (branch is disposable, but keep it tidy).
    await admin.from('poker_tables').delete().eq('id', tableId)
    for (const p of players) await admin.auth.admin.deleteUser(p.id).catch(() => {})
  }
})
