'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/posts'

export type CommentResult = { ok?: true; error?: string } | null

export async function submitComment(
  prevState: CommentResult,
  formData: FormData,
): Promise<CommentResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'login_required' }

  const postId = (formData.get('post_id') as string ?? '').trim()
  const content = (formData.get('content') as string ?? '').trim()

  if (!isUuid(postId)) return { error: 'invalid_post' }
  if (!content) return { error: 'empty' }
  if (content.length > 1000) return { error: 'too_long' }

  const { error } = await supabase.from('comments').insert({
    post_id: postId,
    user_id: user.id,
    content,
    status: 'approved',
  })

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
