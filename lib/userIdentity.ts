import { createAdminClient } from '@/lib/supabase/admin'

export type UserIdentity = { name: string | null; avatarUrl: string | null }

// Resolves a member's display name + avatar. Many users sign in via OAuth, so
// their `profiles` row often has null display_name/avatar_url while the real
// values live in auth.users metadata. We prefer the profile, then fall back to
// the auth metadata (display_name/name/full_name, avatar_url/picture), then the
// email local-part. Returns null name only when nothing at all is available.
export async function getUserIdentity(id: string): Promise<UserIdentity> {
  try {
    const admin = createAdminClient()
    const [profileRes, authRes] = await Promise.all([
      admin.from('profiles').select('display_name, avatar_url').eq('id', id).maybeSingle(),
      admin.auth.admin.getUserById(id),
    ])

    const profile = profileRes.data as { display_name: string | null; avatar_url: string | null } | null
    const authUser = authRes.data?.user
    const meta = (authUser?.user_metadata ?? {}) as Record<string, unknown>

    const name =
      profile?.display_name ||
      (meta.display_name as string | undefined) ||
      (meta.name as string | undefined) ||
      (meta.full_name as string | undefined) ||
      authUser?.email?.split('@')[0] ||
      null

    const avatarUrl =
      profile?.avatar_url ||
      (meta.avatar_url as string | undefined) ||
      (meta.picture as string | undefined) ||
      null

    return { name, avatarUrl }
  } catch {
    return { name: null, avatarUrl: null }
  }
}
