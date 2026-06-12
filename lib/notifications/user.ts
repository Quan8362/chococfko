import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUsers } from '@/lib/push/send'

// Per-user community notifications (DM, mention, new marketplace listing, comment).
// Backed by the existing `community_notifications` table + Web Push. Best-effort:
// never throws, never blocks the action that triggered it.

export type CommunityNotification = {
  id: string
  recipient_id: string
  type: string
  target_url: string | null
  actor_id: string | null
  actor_name: string | null
  actor_avatar: string | null
  is_read: boolean
  created_at: string
}

type PushInfo = { title: string; body?: string; tag?: string }

// ── Notify a specific set of users ────────────────────────────────────────────
export async function notifyUsers(opts: {
  recipientIds: string[]
  type: string
  targetUrl?: string | null
  actorId?: string | null
  actorName?: string | null
  actorAvatar?: string | null
  push?: PushInfo            // omit to insert the bell row without an OS push
}): Promise<void> {
  try {
    const recipients = Array.from(new Set(
      opts.recipientIds.filter(id => id && id !== opts.actorId),
    ))
    if (recipients.length === 0) return

    const admin = createAdminClient()
    const rows = recipients.map(rid => ({
      recipient_id: rid,
      type: opts.type,
      target_url: opts.targetUrl ?? null,
      actor_id: opts.actorId ?? null,
      actor_name: opts.actorName ?? null,
      actor_avatar: opts.actorAvatar ?? null,
    }))
    const { error } = await admin.from('community_notifications').insert(rows)
    if (error) console.error('[notifyUsers] insert error:', error.message)

    if (opts.push) {
      await sendPushToUsers(recipients, {
        title: opts.push.title,
        body: opts.push.body,
        url: opts.targetUrl ?? '/',
        tag: opts.push.tag,
      })
    }
  } catch (err) {
    console.error('[notifyUsers] error:', err)
  }
}

// ── Broadcast to every user (e.g. a new marketplace listing) ──────────────────
const ALL_USERS_TTL = 5 * 60 * 1000
let allUserCache: { ids: string[]; expires: number } | null = null

async function getAllUserIds(): Promise<string[]> {
  if (allUserCache && allUserCache.expires > Date.now()) return allUserCache.ids
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (error) return allUserCache?.ids ?? []
    const ids = (data?.users ?? []).map(u => u.id)
    allUserCache = { ids, expires: Date.now() + ALL_USERS_TTL }
    return ids
  } catch {
    return allUserCache?.ids ?? []
  }
}

export async function broadcastToAllUsers(opts: {
  type: string
  targetUrl?: string | null
  actorId?: string | null
  actorName?: string | null
  actorAvatar?: string | null
  excludeUserId?: string | null
  push?: PushInfo
}): Promise<void> {
  const ids = await getAllUserIds()
  const recipients = ids.filter(id => id !== opts.excludeUserId)
  await notifyUsers({ ...opts, recipientIds: recipients })
}

// ── Read helpers (service role; rows are scoped by recipient_id) ───────────────
export async function getCommunityUnreadCount(userId: string): Promise<number> {
  try {
    const admin = createAdminClient()
    const { count } = await admin
      .from('community_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .eq('is_read', false)
    return count ?? 0
  } catch { return 0 }
}

export async function getCommunityNotifications(userId: string, limit = 12): Promise<CommunityNotification[]> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('community_notifications')
      .select('*')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)
    return (data ?? []) as CommunityNotification[]
  } catch { return [] }
}
