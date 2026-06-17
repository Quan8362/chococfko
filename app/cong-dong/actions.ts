'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/posts'
import { stripHtml } from '@/lib/sanitize'
import { sanitizeHtml } from '@/lib/sanitizeHtml'
import { notifyNewComment } from '@/lib/notifications/comments'

export type CommentResult = { ok?: true; error?: string } | null

export async function submitComment(
  prevState: CommentResult,
  formData: FormData,
): Promise<CommentResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'login_required' }

  const postId = (formData.get('post_id') as string ?? '').trim()
  const rawContent = (formData.get('content') as string ?? '').trim()

  if (!isUuid(postId)) return { error: 'invalid_post' }
  const textContent = stripHtml(rawContent)
  const hasImage = /<img\b/i.test(rawContent)
  if (!textContent && !hasImage) return { error: 'empty' }
  if (textContent.length > 1000) return { error: 'too_long' }

  const content = sanitizeHtml(rawContent)

  const { data: inserted, error } = await supabase.from('comments').insert({
    post_id: postId,
    user_id: user.id,
    content,
    status: 'approved',
  }).select('id').single()

  if (error || !inserted) return { error: error?.message ?? 'db_error' }

  // Notify other participants of this post's comment thread
  const { data: profile } = await supabase
    .from('profiles').select('display_name, avatar_url').eq('id', user.id).single()
  await notifyNewComment({
    commentTable: 'comments',
    postColumn: 'post_id',
    postId,
    commentId: inserted.id as string,
    targetUrl: `/cong-dong/${postId}?c=${inserted.id}`,
    actorId: user.id,
    actorName: profile?.display_name || user.email?.split('@')[0] || 'Thành viên',
    actorAvatar: profile?.avatar_url ?? null,
  })

  revalidatePath(`/cong-dong/${postId}`)
  return { ok: true }
}

export async function submitPostRating(
  postId: string,
  stars: number,
  review: string,
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'login_required' }
  if (!isUuid(postId)) return { error: 'invalid' }
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return { error: 'invalid' }

  const trimmed = (review ?? '').trim().slice(0, 500)
  const { error } = await supabase
    .from('post_ratings')
    .upsert(
      { post_id: postId, user_id: user.id, stars, review: trimmed || null, updated_at: new Date().toISOString() },
      { onConflict: 'post_id,user_id' },
    )
  if (error) return { error: error.message }

  revalidatePath(`/cong-dong/${postId}`)
  return { ok: true }
}

export async function deleteComment(formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const commentId = (formData.get('comment_id') as string ?? '').trim()
  const postId = (formData.get('post_id') as string ?? '').trim()

  if (!commentId || !postId) return

  await supabase
    .from('comments')
    .delete()
    .eq('id', commentId)
    .eq('user_id', user.id) // user can only delete own comments; RLS also enforces this

  revalidatePath(`/cong-dong/${postId}`)
}
