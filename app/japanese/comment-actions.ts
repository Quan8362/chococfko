'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient, checkIsAdmin } from '@/lib/supabase/admin'
import { notifyUsers } from '@/lib/notifications/user'

export type JpItemType = 'word' | 'grammar'

export type JpComment = {
  id: string
  item_type: string
  item_id: string
  parent_id: string | null
  user_id: string
  content: string
  is_anonymous: boolean
  created_at: string
  author_name: string | null
  author_avatar: string | null
}

export type JpCommentResult = { ok?: true; error?: string } | null

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_LEN = 1000

// ── Read ──────────────────────────────────────────────────────
export async function getJapaneseComments(
  itemType: JpItemType,
  itemId: string,
): Promise<JpComment[]> {
  if (!UUID_RE.test(itemId)) return []
  const supabase = createClient()
  const { data } = await supabase
    .from('japanese_comments_with_author')
    .select('id,item_type,item_id,parent_id,user_id,content,is_anonymous,created_at,author_name,author_avatar')
    .eq('item_type', itemType)
    .eq('item_id', itemId)
    .eq('status', 'approved')
    .order('created_at', { ascending: true })
    .limit(500)
  return (data as JpComment[] | null) ?? []
}

// ── Counts (for list cards) ───────────────────────────────────
// Trả về map { itemId: số bình luận } cho tất cả item của một loại có bình luận.
export async function getJapaneseCommentCounts(
  itemType: JpItemType,
): Promise<Record<string, number>> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('japanese_comments')
    .select('item_id')
    .eq('item_type', itemType)
    .eq('status', 'approved')
    .limit(20000)
  if (error || !data) return {}
  const counts: Record<string, number> = {}
  for (const row of data as { item_id: string }[]) {
    counts[row.item_id] = (counts[row.item_id] ?? 0) + 1
  }
  return counts
}

// ── Create ────────────────────────────────────────────────────
export async function submitJapaneseComment(
  _prev: JpCommentResult,
  formData: FormData,
): Promise<JpCommentResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'login_required' }

  const itemType = (formData.get('item_type') as string ?? '') as JpItemType
  const itemId = (formData.get('item_id') as string ?? '').trim()
  const content = (formData.get('content') as string ?? '').trim()
  const isAnonymous = formData.get('is_anonymous') === 'true'
  const path = (formData.get('path') as string ?? '').trim()
  const parentRaw = (formData.get('parent_id') as string ?? '').trim()

  if (itemType !== 'word' && itemType !== 'grammar') return { error: 'invalid' }
  if (!UUID_RE.test(itemId)) return { error: 'invalid' }
  if (!content) return { error: 'empty' }
  if (content.length > MAX_LEN) return { error: 'too_long' }

  // Resolve reply target → giữ tối đa 1 cấp lồng (reply của reply gắn về gốc).
  let parentId: string | null = null
  let parentOwnerId: string | null = null
  if (parentRaw && UUID_RE.test(parentRaw)) {
    const { data: parent } = await supabase
      .from('japanese_comments')
      .select('id, item_id, parent_id, user_id')
      .eq('id', parentRaw)
      .eq('item_id', itemId)
      .eq('status', 'approved')
      .maybeSingle()
    if (parent) {
      parentId = (parent.parent_id as string | null) ?? (parent.id as string)
      parentOwnerId = (parent.user_id as string | null) ?? null
    }
  }

  const { error } = await supabase.from('japanese_comments').insert({
    item_type: itemType,
    item_id: itemId,
    parent_id: parentId,
    user_id: user.id,
    content,
    is_anonymous: isAnonymous,
    status: 'approved',
  })

  if (error) return { error: error.message }

  // Thông báo cho chủ bình luận khi có người trả lời (best-effort, không chặn).
  if (parentOwnerId && parentOwnerId !== user.id) {
    let actorName: string | null = null
    let actorAvatar: string | null = null
    if (!isAnonymous) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle()
      actorName = profile?.display_name || user.email?.split('@')[0] || null
      actorAvatar = profile?.avatar_url ?? null
    }
    const snippet = content.length > 80 ? content.slice(0, 80) + '…' : content
    await notifyUsers({
      recipientIds: [parentOwnerId],
      type: 'new_reply',
      targetUrl: path ? `${path}#comments` : null,
      actorId: user.id,
      actorName,
      actorAvatar,
      push: {
        title: actorName ? `${actorName} đã trả lời bình luận của bạn` : 'Có người trả lời bình luận của bạn',
        body: snippet,
        tag: `jp-reply-${parentId ?? itemId}`,
      },
    })
  }

  if (path) revalidatePath(path)
  return { ok: true }
}

// ── Delete (soft) ─────────────────────────────────────────────
export async function deleteJapaneseComment(formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const commentId = (formData.get('comment_id') as string ?? '').trim()
  const path = (formData.get('path') as string ?? '').trim()
  if (!UUID_RE.test(commentId)) return

  const admin = createAdminClient()
  const { data: comment } = await admin
    .from('japanese_comments')
    .select('user_id')
    .eq('id', commentId)
    .single()
  if (!comment) return

  const isOwner = comment.user_id === user.id
  const isAdmin = await checkIsAdmin()
  if (!isOwner && !isAdmin) return

  await admin
    .from('japanese_comments')
    .update({ status: 'deleted', deleted_at: new Date().toISOString() })
    .eq('id', commentId)

  if (path) revalidatePath(path)
}
