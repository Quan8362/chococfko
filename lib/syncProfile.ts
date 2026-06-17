import type { SupabaseClient } from '@supabase/supabase-js'

// Called right after a session is established (OAuth / LINE / email confirm).
// Copies the display name + avatar from the auth provider metadata into the
// `profiles` row, but only fills columns that are still empty — so a name the
// user set manually in /profile is never overwritten. Best-effort: never throws,
// never blocks login.
export async function syncProfileFromAuth(supabase: SupabaseClient): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const meta = (user.user_metadata ?? {}) as Record<string, unknown>
    const metaName =
      (meta.display_name as string | undefined) ||
      (meta.name as string | undefined) ||
      (meta.full_name as string | undefined) ||
      ''
    const metaAvatar =
      (meta.avatar_url as string | undefined) ||
      (meta.picture as string | undefined) ||
      ''
    if (!metaName && !metaAvatar) return

    const { data: existing } = await supabase
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', user.id)
      .maybeSingle()

    const p = existing as { display_name: string | null; avatar_url: string | null } | null

    const patch: { display_name?: string; avatar_url?: string } = {}
    if (!p?.display_name && metaName) patch.display_name = metaName
    if (!p?.avatar_url && metaAvatar) patch.avatar_url = metaAvatar
    if (Object.keys(patch).length === 0) return

    if (p) {
      await supabase.from('profiles').update(patch).eq('id', user.id)
    } else {
      await supabase.from('profiles').insert({ id: user.id, ...patch })
    }
  } catch {
    // best-effort; never block login
  }
}
