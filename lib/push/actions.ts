'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function savePushSubscription(sub: {
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string
}): Promise<{ ok?: true; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  // Use the admin client (service role) so an endpoint can be re-assigned to the
  // currently logged-in user. A push endpoint belongs to the BROWSER, not the
  // account — when a different account logs in on the same browser, RLS would
  // otherwise block the upsert (the row still belongs to the previous account),
  // leaving the new account with no subscription (subs=0) and no push.
  const admin = createAdminClient()
  const { error } = await admin
    .from('push_subscriptions')
    .upsert(
      {
        user_id: user.id,
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        user_agent: sub.userAgent ?? null,
      },
      { onConflict: 'endpoint' },
    )

  if (error) return { error: 'db_error' }
  return { ok: true }
}

export async function removePushSubscription(endpoint: string): Promise<{ ok?: true }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: true }
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', user.id)
  return { ok: true }
}
