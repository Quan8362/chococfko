import 'server-only'
// SELF-SERVICE tournament creation (Prompt 15F-1). The ONE place the create flow lives. Server-only
// (next/headers via the session client). Unlike every OTHER tournament mutation — which is gated by a
// per-tournament scoped permission — creation cannot be scoped to a tournament that does not exist
// yet, so its authorization is the simplest possible global rule:
//
//   • Anonymous               → denied.
//   • Any authenticated user  → allowed (Site Admin included — they simply become the owner too).
//
// Creation is NOT gated on checkIsAdmin() (that is the whole point of 15F-1). The heavy lifting —
// draft-only status, atomic owner-membership + audit, identity from auth.uid()/JWT — is done by the
// SECURITY DEFINER RPC public.tournament_create_self_service, called with the caller's OWN session so
// a client can never forge the owner id, the created_by, the status or the role.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { validateTournamentInput, type TournamentFormValues } from '@/lib/tournaments/validation'
import type { TournamentMutationResult } from '@/lib/tournaments/admin/types'

// Whether the CURRENT request may create a tournament. Authenticated → yes; anon → no. Exposed so a
// page (e.g. /quan-ly-giai-dau/new) can gate the UI; the RPC re-derives identity server-side anyway.
export async function canCurrentUserCreateTournament(): Promise<boolean> {
  try {
    const { data } = await createClient().auth.getUser()
    return !!data.user
  } catch {
    return false
  }
}

// Map the RPC's typed jsonb code to the shared mutation-result shape the form already understands.
function mapCode(code: string): TournamentMutationResult {
  switch (code) {
    case 'not_authenticated':
      return { ok: false, error: 'forbidden' }
    case 'slug_taken':
      return { ok: false, error: 'slug_taken', fieldErrors: { slug: 'slug_invalid' } }
    case 'invalid':
      return { ok: false, error: 'invalid' }
    default:
      return { ok: false, error: 'unknown' }
  }
}

// Create a DRAFT tournament owned by the current user, atomically (tournament + owner membership +
// audit). Validates with the SAME pure validator the admin/edit paths use, then delegates to the RPC.
export async function createOwnedTournament(
  values: TournamentFormValues,
): Promise<TournamentMutationResult> {
  const supabase = createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, error: 'forbidden' } // anon → denied (page redirects to login)

  const parsed = validateTournamentInput(values)
  if (!parsed.ok) return { ok: false, error: 'invalid', fieldErrors: parsed.errors }
  const { name, slug, startsAt, endsAt, location, rulesUrl } = parsed.value

  const { data, error } = await supabase.rpc('tournament_create_self_service', {
    p_slug: slug,
    p_name: name,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_location: location,
    p_rules_url: rulesUrl,
  })
  if (error) return { ok: false, error: 'unknown' }

  const row = (data ?? {}) as { code?: string; id?: string; slug?: string }
  if (row.code !== 'ok' || !row.id) return mapCode(row.code ?? 'unknown')

  // A freshly-active owner can now manage this tournament — refresh the list + detail surfaces.
  revalidatePath('/quan-ly-giai-dau')
  revalidatePath(`/quan-ly-giai-dau/${row.id}`)
  return { ok: true, id: row.id, slug: row.slug ?? slug }
}
