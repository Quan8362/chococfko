'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Live CURRENT coin balance for the signed-in user. Reads the authoritative wallet via the
// get_wallet RPC, then subscribes to Realtime changes on the user's OWN game_wallets row so
// the derived coin-rank badge upgrades/downgrades the instant the balance changes (a win, an
// admin adjustment, a refund, another game's settlement…). The balance — never a stored
// tier — is the source of truth; callers derive the tier with getCoinTier(balance).
//
// Returns `null` until known (signed out, or before the first fetch resolves).
export function useCoinBalance(): number | null {
  const [balance, setBalance] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null

    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive || !user) return

      const { data } = await supabase.rpc('get_wallet')
      const bal = (data as { balance?: number | string } | null)?.balance
      if (alive && bal != null) setBalance(Number(bal))

      // RLS lets a user read only their OWN wallet row, so this stream is self-scoped.
      channel = supabase
        .channel(`coin-wallet:${user.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'game_wallets', filter: `user_id=eq.${user.id}` },
          payload => {
            const next = (payload.new as { balance?: number | string } | null)?.balance
            if (alive && next != null) setBalance(Number(next))
          },
        )
        .subscribe()
    })()

    return () => {
      alive = false
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  return balance
}
