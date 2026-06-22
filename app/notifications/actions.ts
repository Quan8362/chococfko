'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function markCommunityRead(id: string): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !id) return
  const admin = createAdminClient()
  await admin
    .from('community_notifications')
    .update({ is_read: true })
    .eq('id', id)
    .eq('recipient_id', user.id)
}

export async function markAllCommunityRead(): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const admin = createAdminClient()
  await admin
    .from('community_notifications')
    .update({ is_read: true })
    .eq('recipient_id', user.id)
    .eq('is_read', false)
}

// ── Notification preferences (Phase 7) ────────────────────────────────────────

/** Current user's explicit preference overrides (type → enabled). */
export async function getMyNotifPrefs(): Promise<Record<string, boolean>> {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return {}
  const { getUserPrefs } = await import('@/lib/notifications/prefs')
  return getUserPrefs(user.id)
}

/** Set one preference for the current user (own-rows via RLS-respecting upsert). */
export async function setMyNotifPref(type: string, enabled: boolean): Promise<{ ok: boolean }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }
  const { CONFIGURABLE_TYPES } = await import('@/lib/notifications/prefs')
  if (!(CONFIGURABLE_TYPES as readonly string[]).includes(type)) return { ok: false }
  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from('notification_preferences')
      .upsert({ user_id: user.id, type, enabled, updated_at: new Date().toISOString() }, { onConflict: 'user_id,type' })
    return { ok: !error }
  } catch {
    return { ok: false }
  }
}
