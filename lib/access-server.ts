// Server-only access helpers. Importing this pulls in the Supabase server/admin
// clients (next/headers, service role) — never import from a client component.
// Pure helpers/types live in `@/lib/access`.

import { type UserAccess, ANON_ACCESS } from '@/lib/access'

// Is this user an ACTIVE internal member? Uses the service-role client so the
// check never depends on the caller's own RLS read permission.
export async function isInternalMember(userId: string | null | undefined): Promise<boolean> {
  if (!userId || !process.env.NEXT_PUBLIC_SUPABASE_URL) return false
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    const { data } = await admin
      .from('internal_members')
      .select('user_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle()
    return !!data
  } catch {
    return false
  }
}

// Resolve the current viewer's effective access (auth + internal + admin).
export async function getCurrentUserAccess(): Promise<UserAccess> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return ANON_ACCESS
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return ANON_ACCESS

    const { checkIsAdmin } = await import('@/lib/supabase/admin')
    const [isInternal, isAdmin] = await Promise.all([
      isInternalMember(user.id),
      checkIsAdmin(),
    ])
    return { userId: user.id, isInternal, isAdmin }
  } catch {
    return ANON_ACCESS
  }
}
