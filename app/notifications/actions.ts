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
