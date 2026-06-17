import { createClient } from '@supabase/supabase-js'

/**
 * Cookie-free anon Supabase client for public, published-only reads.
 *
 * Unlike `@/lib/supabase/server`'s `createClient()` (which reads request cookies
 * for auth), this never touches `next/headers`, so it is safe to call inside
 * `unstable_cache(...)` and other cache scopes where dynamic data sources throw.
 * It runs as the anon role and is subject to RLS — use only for public data.
 */
export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}
