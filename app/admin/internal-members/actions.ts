'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient, checkIsAdmin } from '@/lib/supabase/admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Grant, revoke, or reactivate FKO-internal membership for a user.
// Admin-only (ADMIN_EMAILS). Users can NEVER add themselves — there is no
// user-facing path to internal_members writes; all writes go through here under
// the service role after an admin check.
export async function changeMembership(formData: FormData): Promise<void> {
  if (!(await checkIsAdmin())) return

  const userId = (formData.get('user_id') as string ?? '').trim()
  const action = (formData.get('action') as string ?? '').trim()
  if (!UUID_RE.test(userId)) return
  if (!['grant', 'revoke', 'reactivate'].includes(action)) return

  // Identify the acting admin (for approved_by / audit).
  let actorId: string | null = null
  try {
    const { data: { user } } = await createClient().auth.getUser()
    actorId = user?.id ?? null
  } catch { /* actorId stays null */ }

  const admin = createAdminClient()
  const now = new Date().toISOString()

  if (action === 'revoke') {
    await admin
      .from('internal_members')
      .update({ status: 'revoked', revoked_at: now })
      .eq('user_id', userId)
  } else {
    // grant or reactivate → active
    await admin
      .from('internal_members')
      .upsert(
        {
          user_id: userId,
          status: 'active',
          approved_by: actorId,
          approved_at: now,
          revoked_at: null,
        },
        { onConflict: 'user_id' },
      )
  }

  await admin.from('internal_member_audit').insert({
    user_id: userId,
    action,
    actor_id: actorId,
  })

  revalidatePath('/admin/internal-members')
}
