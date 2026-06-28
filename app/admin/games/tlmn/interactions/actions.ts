'use server'

import { revalidatePath } from 'next/cache'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'

// Admin: create/update one interaction catalog row (cost / free-limit / cooldown / enabled /
// sort_order). Admin-gated; mutates via the service role (bypasses RLS). No code deploy
// needed to adjust the economy or disable an item.
export async function upsertInteractionCatalog(input: {
  key: string
  kind: 'phrase' | 'throwable'
  category: string | null
  coin_cost: number
  free_daily_limit: number
  cooldown_ms: number
  is_enabled: boolean
  sort_order: number
}): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkIsAdmin())) return { ok: false, error: 'forbidden' }
  if (!input.key || (input.kind !== 'phrase' && input.kind !== 'throwable')) {
    return { ok: false, error: 'invalid' }
  }
  const admin = createAdminClient()
  const { error } = await admin
    .from('game_interaction_catalog')
    .upsert(
      {
        key: input.key,
        kind: input.kind,
        category: input.category,
        coin_cost: Math.max(0, Math.floor(input.coin_cost || 0)),
        free_daily_limit: Math.max(0, Math.floor(input.free_daily_limit || 0)),
        cooldown_ms: Math.max(0, Math.floor(input.cooldown_ms || 0)),
        is_enabled: !!input.is_enabled,
        sort_order: Math.floor(input.sort_order || 0),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    )
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/games/tlmn/interactions')
  return { ok: true }
}
