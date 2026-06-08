import { createBrowserClient } from '@supabase/ssr'

// Singleton: one instance per browser session.
// Multiple instances cause JWT refresh race conditions that silently kill
// realtime subscriptions when the access token expires (~every hour).
let _client: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _client
}
