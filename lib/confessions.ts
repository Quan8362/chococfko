import type { Scope } from '@/lib/access'

export interface Confession {
  id: string
  title: string
  content: string
  is_anonymous: boolean
  status: string
  community_scope: Scope
  created_at: string
  approved_at: string | null
  comment_count: number
  visible_author_id: string | null
  visible_author_name: string | null
  visible_author_avatar: string | null
}

export interface ConfessionComment {
  id: string
  confession_id: string
  user_id: string | null
  content: string
  is_anonymous: boolean
  status: string
  created_at: string
  author_name: string | null
  author_avatar: string | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isUuid(id: string) { return UUID_RE.test(id) }

export async function getApprovedConfessions(
  sort: 'latest' | 'most_commented' = 'latest',
  scope: Scope = 'community',
): Promise<Confession[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return []
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = createClient()
    let query = supabase
      .from('confessions_public')
      .select('*')
      .eq('status', 'approved')
      .eq('community_scope', scope)
    query = sort === 'most_commented'
      ? query.order('comment_count', { ascending: false })
      : query.order('created_at', { ascending: false })
    const { data, error } = await query.limit(50)
    if (error || !data) return []
    return data as Confession[]
  } catch {
    return []
  }
}

/**
 * True totals for a scope — count of approved confessions and the summed
 * comment_count across ALL of them, independent of the paged list limit.
 */
export async function getConfessionStats(
  scope: Scope = 'community',
): Promise<{ confessions: number; comments: number }> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return { confessions: 0, comments: 0 }
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = createClient()
    const { data, count, error } = await supabase
      .from('confessions_public')
      .select('comment_count', { count: 'exact' })
      .eq('status', 'approved')
      .eq('community_scope', scope)
    if (error || !data) return { confessions: 0, comments: 0 }
    const comments = data.reduce(
      (sum, r) => sum + ((r as { comment_count: number }).comment_count ?? 0),
      0,
    )
    return { confessions: count ?? data.length, comments }
  } catch {
    return { confessions: 0, comments: 0 }
  }
}

export async function getConfessionById(id: string): Promise<Confession | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !isUuid(id)) return null
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('confessions_public')
      .select('*')
      .eq('id', id)
      .single()
    if (error || !data) return null
    return data as Confession
  } catch {
    return null
  }
}

/**
 * Heart-reaction state for a confession: total count and whether the given
 * user has reacted. Degrades to a zero state if the table is absent (migration
 * not yet applied) so the page never breaks.
 */
export async function getConfessionReactionState(
  confessionId: string,
  userId: string | null,
): Promise<{ count: number; reacted: boolean }> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !isUuid(confessionId)) {
    return { count: 0, reacted: false }
  }
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = createClient()
    const { count, error } = await supabase
      .from('confession_reactions')
      .select('*', { count: 'exact', head: true })
      .eq('confession_id', confessionId)
    if (error) return { count: 0, reacted: false }
    let reacted = false
    if (userId) {
      const { data } = await supabase
        .from('confession_reactions')
        .select('user_id')
        .eq('confession_id', confessionId)
        .eq('user_id', userId)
        .maybeSingle()
      reacted = !!data
    }
    return { count: count ?? 0, reacted }
  } catch {
    return { count: 0, reacted: false }
  }
}

export async function getConfessionComments(confessionId: string): Promise<ConfessionComment[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !isUuid(confessionId)) return []
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()

    // Query the base table directly. We deliberately avoid the
    // `confession_comments_with_author` view: it joins `auth.users`, which
    // PostgREST denies ("permission denied for table users") even for the
    // service role, making the whole comment list silently come back empty.
    const { data, error } = await admin
      .from('confession_comments')
      .select('id, confession_id, user_id, content, is_anonymous, status, created_at')
      .eq('confession_id', confessionId)
      .eq('status', 'approved')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
    if (error || !data) return []

    // Resolve author name/avatar for non-anonymous comments from `profiles`,
    // falling back to auth metadata (OAuth users without a profile name).
    const authorIds = Array.from(new Set(
      data.filter((c) => !c.is_anonymous && c.user_id).map((c) => c.user_id as string),
    ))
    const authorById = new Map<string, { name: string | null; avatar: string | null }>()
    if (authorIds.length) {
      const { data: profs } = await admin
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', authorIds)
      for (const p of profs ?? []) {
        authorById.set(p.id, { name: p.display_name?.trim() || null, avatar: p.avatar_url || null })
      }
      // Fill any gaps (missing profile name/avatar) from auth user metadata.
      await Promise.all(authorIds.map(async (uid) => {
        const cur = authorById.get(uid)
        if (cur?.name && cur?.avatar) return
        try {
          const { data: u } = await admin.auth.admin.getUserById(uid)
          const meta = (u?.user?.user_metadata ?? {}) as Record<string, string | undefined>
          authorById.set(uid, {
            name: cur?.name
              || meta.full_name?.trim()
              || meta.name?.trim()
              || u?.user?.email?.split('@')[0]
              || null,
            avatar: cur?.avatar || meta.avatar_url || meta.picture || null,
          })
        } catch { /* keep profile-only data */ }
      }))
    }

    return data.map((c) => {
      const a = !c.is_anonymous && c.user_id ? authorById.get(c.user_id as string) : null
      return {
        id: c.id,
        confession_id: c.confession_id,
        user_id: c.user_id,
        content: c.content,
        is_anonymous: c.is_anonymous,
        status: c.status,
        created_at: c.created_at,
        author_name: c.is_anonymous ? null : (a?.name ?? null),
        author_avatar: c.is_anonymous ? null : (a?.avatar ?? null),
      } as ConfessionComment
    })
  } catch {
    return []
  }
}

export function relativeConfessionDate(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diff < 1) return 'vừa xong'
  if (diff < 60) return `${diff} phút trước`
  const hrs = Math.floor(diff / 60)
  if (hrs < 24) return `${hrs} giờ trước`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days} ngày trước`
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
