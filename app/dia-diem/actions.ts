'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { stripHtml } from '@/lib/sanitize'
import { sanitizeHtml } from '@/lib/sanitizeHtml'

export type CommentResult = { ok?: true; error?: string } | null

export async function submitPlaceComment(
  prevState: CommentResult,
  formData: FormData,
): Promise<CommentResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'login_required' }

  const slug = (formData.get('place_slug') as string ?? '').trim()
  const raw = (formData.get('content') as string ?? '').trim()
  if (!slug) return { error: 'invalid' }

  const text = stripHtml(raw)
  const hasImage = /<img\b/i.test(raw)
  if (!text && !hasImage) return { error: 'empty' }
  if (text.length > 1000) return { error: 'too_long' }
  const content = sanitizeHtml(raw)

  const { error } = await supabase
    .from('place_comments')
    .insert({ place_slug: slug, user_id: user.id, content, status: 'approved' })

  if (error) return { error: error.message }
  revalidatePath(`/dia-diem/${slug}`)
  return { ok: true }
}

export async function deletePlaceComment(formData: FormData): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const commentId = (formData.get('comment_id') as string ?? '').trim()
  const slug = (formData.get('place_slug') as string ?? '').trim()
  if (!commentId) return

  await supabase.from('place_comments').delete().eq('id', commentId).eq('user_id', user.id)
  if (slug) revalidatePath(`/dia-diem/${slug}`)
}

export async function submitPlaceRating(
  slug: string,
  stars: number,
  review: string,
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'login_required' }
  if (!slug) return { error: 'invalid' }
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return { error: 'invalid' }

  const trimmed = (review ?? '').trim().slice(0, 500)
  const { error } = await supabase
    .from('place_ratings')
    .upsert(
      { place_slug: slug, user_id: user.id, stars, review: trimmed || null, updated_at: new Date().toISOString() },
      { onConflict: 'place_slug,user_id' },
    )
  if (error) return { error: error.message }

  revalidatePath(`/dia-diem/${slug}`)
  return { ok: true }
}
