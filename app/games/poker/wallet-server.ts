// ── Poker wallet bootstrap (server-only; shared virtual-coin faucet) ────────────────────────────
//
// Poker shares the ONE persistent "xu" wallet (game_wallets / coin_ledger) with TLMN — see
// docs/poker/economy/faucets-and-sinks.md (F1 signup grant, LIVE, shared). TLMN seeds the wallet on
// its entry path (ensureWallet in app/games/tlmn), but the poker cash path historically only READ the
// balance (get_wallet). A brand-new public player who reaches poker BEFORE ever playing TLMN has no
// game_wallets row yet, so:
//   • poker_sit_down raises `no_wallet`, and
//   • the quick-play entry gate reads a 0 balance → `below_entry_gate`.
// That left "Chơi nhanh" / "Tạo bàn" visible but non-functional for poker-first users once public
// play opened (27G-U2). Calling the shared, idempotent ensure_wallet RPC at the cash entry points
// grants the one-time signup faucet exactly like TLMN's entry — the SAME faucet, so coin
// conservation (Σ game_wallets.balance == coin_ledger net delta) is unchanged.
//
// auth.uid()-scoped (user cookie client, never the admin client): it only ever creates the CALLER's
// own wallet and is a no-op once the wallet exists. NOT a 'use server' action surface — a plain
// server-only helper the poker server actions call internally.

import { createClient } from '@/lib/supabase/server'

// Ensure the caller's shared wallet exists (granting the one-time signup faucet on first use) and
// return the current balance. Returns 0 for an unauthenticated caller or a degraded RPC.
export async function ensurePokerWallet(): Promise<number> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0
  const { data, error } = await supabase.rpc('ensure_wallet')
  if (error || !data) return 0
  const bal = (data as { balance?: number | string }).balance
  return bal != null ? Number(bal) : 0
}
