'use server'

import { revalidatePath } from 'next/cache'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

async function getAdminUserId(): Promise<string | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function markAsRead(id: string): Promise<void> {
  if (!(await checkIsAdmin())) return
  const userId = await getAdminUserId()
  if (!userId) return

  const admin = createAdminClient()
  await admin
    .from('admin_notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('recipient_id', userId)

  revalidatePath('/admin/notifications')
}

export async function markAllAsRead(): Promise<void> {
  if (!(await checkIsAdmin())) return
  const userId = await getAdminUserId()
  if (!userId) return

  const admin = createAdminClient()
  await admin
    .from('admin_notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('recipient_id', userId)
    .eq('is_read', false)

  revalidatePath('/admin/notifications')
}
