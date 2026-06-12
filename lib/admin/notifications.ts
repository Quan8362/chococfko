// Server-only: Admin notification helpers using service role client

import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUsers } from '@/lib/push/send'

export type NotificationType =
  | 'new_pending_post'
  | 'new_pending_place'
  | 'new_pending_confession'
  | 'new_pending_listing'

export type AdminNotification = {
  id: string
  type: NotificationType
  title: string
  message: string | null
  target_type: string | null
  target_id: string | null
  target_url: string | null
  recipient_id: string | null
  actor_id: string | null
  is_read: boolean
  created_at: string
  read_at: string | null
}

// ── Look up admin user IDs from ADMIN_EMAILS env var ──────────────────────────
// Uses listUsers (first 1000 users) which covers any realistic site size.
// Cached per server instance (5 min TTL) so we don't scan the whole user list
// on every single post/place/confession submission.
const ADMIN_CACHE_TTL = 5 * 60 * 1000
let adminIdCache: { ids: string[]; expires: number } | null = null

export async function getAdminUserIds(): Promise<string[]> {
  const raw = process.env.ADMIN_EMAILS ?? ''
  const adminEmails = new Set(raw.split(',').map(e => e.trim()).filter(Boolean))
  if (!adminEmails.size) return []

  if (adminIdCache && adminIdCache.expires > Date.now()) return adminIdCache.ids

  const admin = createAdminClient()

  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) {
    console.error('[notification] listUsers error:', error.message)
    return adminIdCache?.ids ?? []
  }

  const ids = (data?.users ?? [])
    .filter(u => u.email && adminEmails.has(u.email))
    .map(u => u.id)
  adminIdCache = { ids, expires: Date.now() + ADMIN_CACHE_TTL }
  return ids
}

// ── Create one notification per admin — non-critical, errors are logged ───────
export async function createAdminNotification(params: {
  type: NotificationType
  title: string
  message?: string | null
  target_type?: string | null
  target_id?: string | null
  target_url?: string | null
  actor_id?: string | null
}): Promise<void> {
  try {
    const adminUserIds = await getAdminUserIds()
    if (!adminUserIds.length) {
      console.warn('[notification] No admin users found — check ADMIN_EMAILS env var')
      return
    }

    const admin = createAdminClient()
    const rows = adminUserIds.map(recipientId => ({
      type:         params.type,
      title:        params.title,
      message:      params.message ?? null,
      target_type:  params.target_type ?? null,
      target_id:    params.target_id ?? null,
      target_url:   params.target_url ?? null,
      recipient_id: recipientId,
      actor_id:     params.actor_id ?? null,
    }))

    const { error } = await admin.from('admin_notifications').insert(rows)
    if (error) console.error('[notification] insert error:', error.message)

    // Background/closed-tab push to every admin recipient
    const recipientsToExclude = params.actor_id ? new Set([params.actor_id]) : new Set<string>()
    await sendPushToUsers(
      adminUserIds.filter(id => !recipientsToExclude.has(id)),
      {
        title: params.title,
        body: params.message ?? undefined,
        url: params.target_url ?? '/admin',
        tag: `admin-${params.type}-${params.target_id ?? ''}`,
      },
    )
  } catch (err) {
    console.error('[notification] unexpected error:', err)
  }
}

// ── Read helpers (all filtered by recipient_id) ───────────────────────────────

export async function getUnreadNotifications(
  recipientId: string,
  limit = 10,
): Promise<AdminNotification[]> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('admin_notifications')
      .select('*')
      .eq('recipient_id', recipientId)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) console.error('[notification] getUnread error:', error.message)
    return (data ?? []) as AdminNotification[]
  } catch { return [] }
}

export async function getUnreadCount(recipientId: string): Promise<number> {
  try {
    const admin = createAdminClient()
    const { count, error } = await admin
      .from('admin_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', recipientId)
      .eq('is_read', false)
    if (error) console.error('[notification] getUnreadCount error:', error.message)
    return count ?? 0
  } catch { return 0 }
}

export async function getAllNotifications(
  recipientId: string,
  limit = 50,
): Promise<AdminNotification[]> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('admin_notifications')
      .select('*')
      .eq('recipient_id', recipientId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) console.error('[notification] getAll error:', error.message)
    return (data ?? []) as AdminNotification[]
  } catch { return [] }
}
