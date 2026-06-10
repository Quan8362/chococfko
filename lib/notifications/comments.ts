import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUsers } from '@/lib/push/send'

// Notify every OTHER user who has commented on the same post that a new comment
// arrived. People who never commented get nothing. Best-effort — never throws.
export async function notifyNewComment(opts: {
  commentTable: 'comments' | 'confession_comments'
  postColumn: 'post_id' | 'confession_id'
  postId: string
  commentId: string
  targetUrl: string
  actorId: string
  actorName: string | null   // null => anonymous (hide identity)
  actorAvatar: string | null
}): Promise<void> {
  try {
    const admin = createAdminClient()

    // Distinct prior participants (commenters) on this post, excluding the actor.
    const { data: rows } = await admin
      .from(opts.commentTable)
      .select('user_id')
      .eq(opts.postColumn, opts.postId)
      .neq('user_id', opts.actorId)

    const recipients = Array.from(
      new Set((rows ?? []).map(r => r.user_id as string).filter(Boolean)),
    )
    if (recipients.length === 0) return

    const notifRows = recipients.map(rid => ({
      recipient_id: rid,
      type: 'new_comment',
      target_url: opts.targetUrl,
      actor_id: opts.actorId,
      actor_name: opts.actorName,
      actor_avatar: opts.actorAvatar,
    }))
    const { error } = await admin.from('community_notifications').insert(notifRows)
    if (error) console.error('[notifyNewComment] insert error:', error.message)

    // Web Push (works when the tab is backgrounded/closed). Title localised
    // server-side in Vietnamese (matches the rest of the push notifications).
    const who = opts.actorName ?? 'Ai đó'
    await sendPushToUsers(recipients, {
      title: `${who} đã bình luận`,
      body: 'Có bình luận mới ở bài bạn đã tham gia',
      url: opts.targetUrl,
      tag: `comment-${opts.commentId}`,
    })
  } catch (err) {
    console.error('[notifyNewComment] error:', err)
  }
}
