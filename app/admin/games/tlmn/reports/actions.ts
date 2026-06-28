'use server'

import { revalidatePath } from 'next/cache'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'

const STATUSES = ['open', 'reviewed', 'dismissed', 'actioned'] as const

// Admin: move a report through its moderation lifecycle. Admin-gated; service role.
export async function updateReportStatus(
  id: string,
  status: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkIsAdmin())) return { ok: false, error: 'forbidden' }
  if (!(STATUSES as readonly string[]).includes(status)) return { ok: false, error: 'invalid' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('game_interaction_reports')
    .update({ status })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/games/tlmn/reports')
  return { ok: true }
}
