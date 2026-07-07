import 'server-only' // marks this service-role module server-only (repo convention) — never bundle it client-side
import { createClient } from '@supabase/supabase-js'

// Service role client — bypasses RLS. Chỉ dùng server-side trong admin routes.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function checkIsAdmin(): Promise<boolean> {
  const raw = process.env.ADMIN_EMAILS ?? ''
  if (!raw) return false
  const adminList = raw.split(',').map((e) => e.trim()).filter(Boolean)
  if (!adminList.length) return false

  try {
    const { createClient: createUserClient } = await import('@/lib/supabase/server')
    const supabase = createUserClient()
    const { data: { user } } = await supabase.auth.getUser()
    return !!user?.email && adminList.includes(user.email)
  } catch {
    return false
  }
}
