'use server'

// TLMN persistent virtual-coin ("xu") wallet — server actions.
// PLAY-MONEY ONLY: no purchase, no cashout, no real-currency conversion.
//
// All balance mutations live in Postgres SECURITY DEFINER functions
// (migration_tlmn_run7_economy.sql). These actions are thin wrappers:
//   • ensure/get/claim use the USER-SCOPED (anon, cookie) client so the RPC's
//     auth.uid() is the caller — RLS + the definer functions enforce "self only".
//   • settle_round is NEVER called here; it runs from the trusted round-end path in
//     actions.ts via the service-role client (the browser can't call it — REVOKEd).

import { createClient } from '@/lib/supabase/server'

export type WalletState = {
  balance: number
  lastDailyGrantAt: string | null
  canClaimDaily: boolean
  nextClaimAt: string | null
}

// Create the wallet on first use (grants SIGNUP_GRANT once). Idempotent.
// Returns the balance and whether this call created the wallet (for the welcome toast).
export async function ensureWallet(): Promise<{ balance: number; isNew: boolean }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { balance: 0, isNew: false }

  const { data, error } = await supabase.rpc('ensure_wallet')
  if (error || !data) return { balance: 0, isNew: false }
  const row = data as { balance: number; is_new: boolean }
  return { balance: Number(row.balance ?? 0), isNew: !!row.is_new }
}

// Authoritative wallet snapshot + daily-claim eligibility (server-computed).
export async function getWallet(): Promise<WalletState | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase.rpc('get_wallet')
  if (error || !data) return null
  const row = data as {
    balance: number; last_daily_grant_at: string | null
    can_claim_daily: boolean; next_claim_at: string | null
  }
  return {
    balance: Number(row.balance ?? 0),
    lastDailyGrantAt: row.last_daily_grant_at ?? null,
    canClaimDaily: !!row.can_claim_daily,
    nextClaimAt: row.next_claim_at ?? null,
  }
}

// Claim the daily refill. Eligibility is RE-CHECKED server-side (broke + cooldown);
// an ineligible call returns a stable error code instead of granting.
export async function claimDailyCoins():
  Promise<{ balance: number; nextClaimAt: string | null } | { error: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_logged_in' }

  const { data, error } = await supabase.rpc('claim_daily_coins')
  if (error) {
    const msg = error.message || ''
    if (msg.includes('not_broke')) return { error: 'not_broke' }
    if (msg.includes('cooldown_active')) return { error: 'cooldown_active' }
    if (msg.includes('no_wallet')) return { error: 'no_wallet' }
    return { error: 'claim_failed' }
  }
  const row = data as { balance: number; next_claim_at: string | null }
  return { balance: Number(row.balance ?? 0), nextClaimAt: row.next_claim_at ?? null }
}
