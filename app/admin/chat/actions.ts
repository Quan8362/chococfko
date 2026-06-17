'use server'

import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { pinMessage, unpinMessage } from '@/app/community/chat/actions'

export async function adminDeleteMessage(id: string): Promise<{ ok?: boolean; error?: string }> {
  const isAdmin = await checkIsAdmin()
  if (!isAdmin) return { error: 'unauthorized' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('community_chat_messages')
    .update({ is_deleted: true })
    .eq('id', id)

  if (error) return { error: 'db_error' }

  revalidatePath('/admin/chat')
  return { ok: true }
}

export async function adminRestoreMessage(id: string): Promise<{ ok?: boolean; error?: string }> {
  const isAdmin = await checkIsAdmin()
  if (!isAdmin) return { error: 'unauthorized' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('community_chat_messages')
    .update({ is_deleted: false })
    .eq('id', id)

  if (error) return { error: 'db_error' }

  revalidatePath('/admin/chat')
  return { ok: true }
}

export async function adminPinMessage(id: string): Promise<{ ok?: boolean; error?: string }> {
  const result = await pinMessage(id)
  if (result.ok) revalidatePath('/admin/chat')
  return result
}

export async function adminUnpinMessage(id: string): Promise<{ ok?: boolean; error?: string }> {
  const result = await unpinMessage(id)
  if (result.ok) revalidatePath('/admin/chat')
  return result
}
