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

export type PreviewQuestion = {
  qType: string
  sourceType: string
  sourceId: string
  prompt: string
  promptSub: string | null
  options: { key: string; text: string }[]
  correctKey: string
  difficulty: string
  rawSource: string | null // admin-only: raw gloss/source to verify cleaning
}

// Admin-only preview of freshly generated questions for a level. Includes the
// correct answer + raw source value — this NEVER goes through the public game.
export async function previewJp60Questions(level: string, count = 8): Promise<{ ok: boolean; questions?: PreviewQuestion[] }> {
  if (!(await checkIsAdmin())) return { ok: false }
  const admin = createAdminClient()
  const { generateQuestions } = await import('@/lib/games/jp60/generate')
  const n = Math.min(20, Math.max(1, Math.floor(count)))
  let qs
  try {
    qs = await generateQuestions(admin, { level: level as any, count: n, locale: 'vi' })
  } catch {
    return { ok: false }
  }

  // Fetch raw source values (admin-only) so the cleaning can be visually verified.
  const raw = new Map<string, string>()
  const byType: Record<string, string[]> = { vocabulary: [], kanji: [], grammar: [] }
  for (const q of qs) if (byType[q.sourceType]) byType[q.sourceType].push(q.sourceId)
  const fetchRaw = async (type: string, table: string, col: string) => {
    if (!byType[type]?.length) return
    const { data } = await admin.from(table).select(`id,${col}`).in('id', byType[type])
    for (const r of (data ?? []) as any[]) {
      const v = type === 'grammar' ? (r.meaning_vi ?? r.meaning_en) : (Array.isArray(r[col]) ? (r[col][0]?.vi ?? r[col][0]?.en ?? '') : '')
      raw.set(`${type}:${r.id}`, String(v ?? ''))
    }
  }
  await Promise.all([
    fetchRaw('vocabulary', 'japanese_words', 'meanings'),
    fetchRaw('kanji', 'japanese_kanji', 'meanings'),
    fetchRaw('grammar', 'japanese_grammar', 'meaning_vi'),
  ])

  return {
    ok: true,
    questions: qs.map((q) => ({
      qType: q.qType,
      sourceType: q.sourceType,
      sourceId: q.sourceId,
      prompt: q.prompt,
      promptSub: q.promptSub,
      options: q.options,
      correctKey: q.correctKey,
      difficulty: q.difficulty,
      rawSource: raw.get(`${q.sourceType}:${q.sourceId}`) ?? null,
    })),
  }
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
