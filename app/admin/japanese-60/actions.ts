'use server'

import { revalidatePath } from 'next/cache'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Jp60Settings } from '@/app/games/japanese-60/actions'

async function requireAdminId(): Promise<string | null> {
  if (!(await checkIsAdmin())) return null
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function saveJp60Settings(settings: Jp60Settings): Promise<{ ok: boolean }> {
  if (!(await checkIsAdmin())) return { ok: false }
  const admin = createAdminClient()
  // Whitelist the shape so an admin form can't inject arbitrary keys.
  const value: Jp60Settings = {
    enabled: !!settings.enabled,
    modes: {
      daily: !!settings.modes?.daily,
      rush: !!settings.modes?.rush,
      practice: !!settings.modes?.practice,
    },
    levels: {
      N5: !!settings.levels?.N5, N4: !!settings.levels?.N4, N3: !!settings.levels?.N3,
      N2: !!settings.levels?.N2, N1: !!settings.levels?.N1, MIXED: !!settings.levels?.MIXED,
    },
    duration_sec: Math.min(180, Math.max(15, Math.floor(settings.duration_sec || 60))),
    daily_questions: Math.min(20, Math.max(5, Math.floor(settings.daily_questions || 10))),
  }
  await admin.from('jp60_config').upsert({ key: 'settings', value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  revalidatePath('/admin/japanese-60')
  revalidatePath('/games/japanese-60')
  return { ok: true }
}

export async function resolveJp60Report(id: string, status: 'reviewed' | 'dismissed'): Promise<{ ok: boolean }> {
  const adminId = await requireAdminId()
  if (!adminId) return { ok: false }
  const admin = createAdminClient()
  await admin.from('jp60_question_reports').update({ status, reviewed_by: adminId, reviewed_at: new Date().toISOString() }).eq('id', id)
  revalidatePath('/admin/japanese-60')
  return { ok: true }
}

export async function disableJp60Item(sourceType: string, sourceId: string, reason: string): Promise<{ ok: boolean }> {
  const adminId = await requireAdminId()
  if (!adminId) return { ok: false }
  const admin = createAdminClient()
  await admin.from('jp60_disabled_items').upsert(
    { source_type: sourceType, source_id: sourceId, reason: reason?.slice(0, 200) ?? null, disabled_by: adminId },
    { onConflict: 'source_type,source_id' }
  )
  revalidatePath('/admin/japanese-60')
  return { ok: true }
}

export async function invalidateJp60Session(sessionId: string): Promise<{ ok: boolean }> {
  if (!(await checkIsAdmin())) return { ok: false }
  const admin = createAdminClient()
  // Flag the session and drop it from ranked leaderboards (without deleting history).
  await admin.from('jp60_sessions').update({ suspicious: true, suspicious_reason: 'admin_invalidated' }).eq('id', sessionId)
  await admin.from('jp60_results').update({ suspicious: true, ranked: false }).eq('session_id', sessionId)
  revalidatePath('/admin/japanese-60')
  return { ok: true }
}
