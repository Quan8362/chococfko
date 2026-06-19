'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient, checkIsAdmin } from '@/lib/supabase/admin'
import { isUuid } from '@/lib/confessions'
import { stripHtml } from '@/lib/sanitize'
import { sanitizeHtml } from '@/lib/sanitizeHtml'
import { createAdminNotification } from '@/lib/admin/notifications'
import { notifyNewComment } from '@/lib/notifications/comments'
import { getCurrentUserAccess } from '@/lib/access-server'
import { resolvePostScope } from '@/lib/access'

export type ConfessionResult = { ok?: true; error?: string } | null

export async function submitConfession(
  prevState: ConfessionResult,
  formData: FormData,
): Promise<ConfessionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'login_required' }

  const title = (formData.get('title') as string ?? '').trim()
  const rawContent = (formData.get('content') as string ?? '').trim()
  const isAnonymous = formData.get('is_anonymous') !== 'false'

  if (!title || title.length < 5) return { error: 'title_too_short' }
  if (title.length > 120) return { error: 'title_too_long' }

  // Strip HTML to measure real text length
  const textContent = stripHtml(rawContent)
  if (!textContent) return { error: 'content_empty' }
  if (textContent.length < 10) return { error: 'content_too_short' }
  if (textContent.length > 3000) return { error: 'content_too_long' }

  // Sanitize before storing
  const content = sanitizeHtml(rawContent)

  // Resolve the requested scope against the viewer's access. A community user
  // who forges 'fko_internal' is forced back to community; RLS double-checks.
  const access = await getCurrentUserAccess()
  const community_scope = resolvePostScope(formData.get('scope') as string | null, access)

  const { data: confessionData, error } = await supabase
    .from('confessions')
    .insert({
      title,
      content,
      author_id: user.id,
      is_anonymous: isAnonymous,
      status: 'pending',
      community_scope,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  const displayName = (user.user_metadata?.display_name as string | undefined)
    || user.email?.split('@')[0]
    || 'Ẩn danh'

  await createAdminNotification({
    type: 'new_pending_confession',
    title: 'FKO Confession mới cần duyệt',
    message: `${displayName}: ${title}`,
    target_type: 'confession',
    target_id: confessionData?.id ?? null,
    target_url: '/admin/confessions?tab=pending',
    actor_id: user.id,
  })

  revalidatePath('/confessions')
  return { ok: true }
}

export type CommentResult = { ok?: true; error?: string } | null

export async function submitConfessionComment(
  prevState: CommentResult,
  formData: FormData,
): Promise<CommentResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'login_required' }

  const confessionId = (formData.get('confession_id') as string ?? '').trim()
  const rawContent = (formData.get('content') as string ?? '').trim()
  const isAnonymous = formData.get('is_anonymous') !== 'false'

  if (!isUuid(confessionId)) return { error: 'invalid_confession' }

  const textContent = stripHtml(rawContent)
  const hasImage = /<img\b/i.test(rawContent)
  if (!textContent && !hasImage) return { error: 'content_empty' }
  if (textContent.length > 1000) return { error: 'too_long' }

  const content = sanitizeHtml(rawContent)

  const { data: inserted, error } = await supabase.from('confession_comments').insert({
    confession_id: confessionId,
    user_id: user.id,
    content,
    is_anonymous: isAnonymous,
    status: 'approved',
  }).select('id').single()

  if (error || !inserted) return { error: error?.message ?? 'db_error' }

  // Notify other participants. Hide identity if the comment is anonymous.
  let actorName: string | null = null
  let actorAvatar: string | null = null
  if (!isAnonymous) {
    const { data: profile } = await supabase
      .from('profiles').select('display_name, avatar_url').eq('id', user.id).single()
    actorName = profile?.display_name || user.email?.split('@')[0] || 'Thành viên'
    actorAvatar = profile?.avatar_url ?? null
  }
  await notifyNewComment({
    commentTable: 'confession_comments',
    postColumn: 'confession_id',
    postId: confessionId,
    commentId: inserted.id as string,
    targetUrl: `/confessions/${confessionId}?c=${inserted.id}`,
    actorId: user.id,
    actorName,
    actorAvatar,
  })

  revalidatePath(`/confessions/${confessionId}`)
  return { ok: true }
}

export async function deleteConfessionComment(formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const commentId = (formData.get('comment_id') as string ?? '').trim()
  const confessionId = (formData.get('confession_id') as string ?? '').trim()
  if (!commentId || !confessionId) return

  const admin = createAdminClient()
  const { data: comment } = await admin
    .from('confession_comments')
    .select('user_id')
    .eq('id', commentId)
    .single()

  if (!comment) return

  const isOwner = comment.user_id === user.id
  const isAdmin = await checkIsAdmin()
  if (!isOwner && !isAdmin) return

  await admin
    .from('confession_comments')
    .update({ deleted_at: new Date().toISOString(), status: 'deleted' })
    .eq('id', commentId)

  revalidatePath(`/confessions/${confessionId}`)
}
