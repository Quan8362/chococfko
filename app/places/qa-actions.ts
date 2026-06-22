'use server'

// Place Q&A + structured info reports + "I visited". Reuses place_comments
// (kind question/answer), the community_notifications system (notifyUsers), the
// moderation status, and profiles — no duplicate comment platform.
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import { notifyUsers } from '@/lib/notifications/user'
import { stripHtml } from '@/lib/sanitize'
import { checkRateLimit } from '@/lib/rateLimitDb'
import { isReportKind, buildQuestionThreads, type QaQuestion, type QaRow } from '@/lib/placeQa'

type Res = { ok?: boolean; error?: string }

function cleanText(raw: string, max = 1000): string {
  return stripHtml((raw ?? '').trim()).slice(0, max)
}

async function actor(adminSb: ReturnType<typeof createAdminClient>, userId: string): Promise<{ name: string | null; avatar: string | null }> {
  try {
    const { data } = await adminSb.from('profiles').select('display_name,avatar_url').eq('id', userId).maybeSingle()
    const p = data as { display_name: string | null; avatar_url: string | null } | null
    return { name: p?.display_name ?? null, avatar: p?.avatar_url ?? null }
  } catch { return { name: null, avatar: null } }
}

// ── Questions & answers ─────────────────────────────────────────────
export async function askQuestion(slug: string, content: string): Promise<Res> {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'login_required' }
  const text = cleanText(content)
  if (!slug || !text) return { error: 'empty' }
  if (!(await checkRateLimit('place_question', { userId: user.id })).ok) return { error: 'rate_limited' }
  const { error } = await sb.from('place_comments').insert({ place_slug: slug, user_id: user.id, content: text, status: 'approved', kind: 'question' })
  if (error) return { error: error.message }
  revalidatePath(`/places/${slug}`)
  return { ok: true }
}

export async function answerQuestion(slug: string, questionId: string, content: string): Promise<Res> {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'login_required' }
  const text = cleanText(content)
  if (!slug || !questionId || !text) return { error: 'empty' }
  if (!(await checkRateLimit('place_answer', { userId: user.id })).ok) return { error: 'rate_limited' }
  const { error } = await sb.from('place_comments').insert({ place_slug: slug, user_id: user.id, content: text, status: 'approved', kind: 'answer', parent_id: questionId })
  if (error) return { error: error.message }

  // Notify the question author + prior answerers (reuses community_notifications + push).
  try {
    const admin = createAdminClient()
    const { data: q } = await admin.from('place_comments').select('user_id').eq('id', questionId).maybeSingle()
    const { data: prior } = await admin.from('place_comments').select('user_id').eq('parent_id', questionId).eq('kind', 'answer')
    const recipients = [
      (q as { user_id: string } | null)?.user_id,
      ...((prior ?? []) as { user_id: string }[]).map((r) => r.user_id),
    ].filter((id): id is string => !!id)
    const a = await actor(admin, user.id)
    await notifyUsers({
      recipientIds: recipients, type: 'place_answer', targetUrl: `/places/${slug}`,
      actorId: user.id, actorName: a.name, actorAvatar: a.avatar,
      push: { title: a.name ? `${a.name} đã trả lời` : 'Có câu trả lời mới', body: 'Câu hỏi địa điểm của bạn có câu trả lời', tag: `place-answer-${questionId}` },
    })
  } catch { /* best-effort */ }

  revalidatePath(`/places/${slug}`)
  return { ok: true }
}

/** Mark/unmark an answer helpful — allowed for the QUESTION author or an admin. */
export async function markHelpful(slug: string, answerId: string, helpful: boolean): Promise<Res> {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'login_required' }
  const admin = createAdminClient()
  const { data: ans } = await admin.from('place_comments').select('id,user_id,parent_id,kind').eq('id', answerId).maybeSingle()
  const a = ans as { id: string; user_id: string; parent_id: string | null; kind: string } | null
  if (!a || a.kind !== 'answer' || !a.parent_id) return { error: 'invalid' }
  const { data: q } = await admin.from('place_comments').select('user_id').eq('id', a.parent_id).maybeSingle()
  const questionOwner = (q as { user_id: string } | null)?.user_id
  const isAdmin = await checkIsAdmin()
  if (user.id !== questionOwner && !isAdmin) return { error: 'forbidden' }
  if (!isAdmin && !(await checkRateLimit('helpful_mark', { userId: user.id })).ok) return { error: 'rate_limited' }

  const { error } = await admin.from('place_comments').update({ helpful, helpful_marked_by: helpful ? user.id : null }).eq('id', answerId)
  if (error) return { error: error.message }
  if (helpful && a.user_id !== user.id) {
    const act = await actor(admin, user.id)
    await notifyUsers({ recipientIds: [a.user_id], type: 'place_answer_helpful', targetUrl: `/places/${slug}`, actorId: user.id, actorName: act.name, actorAvatar: act.avatar, push: { title: 'Câu trả lời hữu ích', body: 'Câu trả lời của bạn được đánh dấu hữu ích' } })
  }
  revalidatePath(`/places/${slug}`)
  return { ok: true }
}

/** Hide a question/answer/comment (admin/moderator only). */
export async function hideComment(slug: string, commentId: string): Promise<Res> {
  if (!(await checkIsAdmin())) return { error: 'forbidden' }
  const { error } = await createAdminClient().from('place_comments').update({ status: 'hidden' }).eq('id', commentId)
  if (error) return { error: error.message }
  revalidatePath(`/places/${slug}`)
  return { ok: true }
}

/** Delete your own question/answer. */
export async function deleteQa(slug: string, commentId: string): Promise<Res> {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'login_required' }
  await sb.from('place_comments').delete().eq('id', commentId).eq('user_id', user.id)
  revalidatePath(`/places/${slug}`)
  return { ok: true }
}

export async function getPlaceQuestions(slug: string): Promise<QaQuestion[]> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('place_comments_with_author')
      .select('id,user_id,content,created_at,author_name,author_avatar,kind,parent_id,helpful,status')
      .eq('place_slug', slug)
      .in('kind', ['question', 'answer'])
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
    return buildQuestionThreads((data ?? []) as QaRow[])
  } catch { return [] }
}

// ── Structured information reports (review queue; never edits place data) ──
export async function submitReport(slug: string, kind: string, detail: string): Promise<Res> {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'login_required' }
  if (!slug || !isReportKind(kind)) return { error: 'invalid' }
  if (!(await checkRateLimit('place_report', { userId: user.id })).ok) return { error: 'rate_limited' }
  const { error } = await sb.from('place_reports').insert({ place_slug: slug, user_id: user.id, kind, detail: cleanText(detail, 1000) || null, status: 'pending' })
  if (error) return { error: error.message }
  return { ok: true }
}

// ── "I visited this place" (private; spam-guarded by PK) ──
export async function reportVisit(slug: string): Promise<Res> {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'login_required' }
  if (!slug) return { error: 'invalid' }
  const { error } = await sb.from('place_visits').upsert({ user_id: user.id, place_slug: slug }, { onConflict: 'user_id,place_slug', ignoreDuplicates: true })
  if (error) return { error: error.message }
  revalidatePath(`/places/${slug}`)
  return { ok: true }
}

export async function removeVisit(slug: string): Promise<Res> {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'login_required' }
  await sb.from('place_visits').delete().eq('user_id', user.id).eq('place_slug', slug)
  revalidatePath(`/places/${slug}`)
  return { ok: true }
}

/** Public aggregate visit count + whether the current viewer visited (no who/when exposed). */
export async function getVisitInfo(slug: string): Promise<{ count: number; visited: boolean }> {
  try {
    const admin = createAdminClient()
    const { count } = await admin.from('place_visits').select('user_id', { count: 'exact', head: true }).eq('place_slug', slug)
    let visited = false
    const { data: { user } } = await createClient().auth.getUser()
    if (user) {
      const { data } = await admin.from('place_visits').select('user_id').eq('place_slug', slug).eq('user_id', user.id).maybeSingle()
      visited = !!data
    }
    return { count: count ?? 0, visited }
  } catch { return { count: 0, visited: false } }
}
