// Server-side poker feature-flag resolution + capability gates.
//
// Reads the real process.env (server-only) and the current viewer's access
// (auth + ADMIN_EMAILS). Enforcement lives HERE (server actions + the route
// layout) so a disabled feature cannot be reached by a hand-crafted POST — the
// flag is authoritative, not a client-side convenience. Admins bypass the public
// gates for the admin-only production-visibility rollout stage; bot/tournament
// stay hard-off for everyone (see lib/games/poker/flags.ts).

import { getCurrentUserAccess } from '@/lib/access-server'
import type { UserAccess } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import {
  resolvePokerFlags,
  pokerVisibleTo,
  pokerCan,
  isAlphaTester,
  POKER_ALPHA_TESTERS_ENV,
  type PokerFlags,
  type PokerCapability,
  type PokerViewer,
} from '@/lib/games/poker/flags'

export interface PokerAccess {
  flags: PokerFlags
  access: UserAccess
  visible: boolean
  isAlphaTester: boolean
  // True Alpha screens should be labelled; convenience for the UI badge.
  isAlpha: boolean
}

// Resolve the viewer's email once (server-only) to decide tester allowlist
// membership. Best-effort: any failure resolves to "not a tester" (closed).
async function currentUserEmail(): Promise<string | null> {
  try {
    const supabase = createClient()
    const { data } = await supabase.auth.getUser()
    return data.user?.email ?? null
  } catch {
    return null
  }
}

export async function getPokerAccess(): Promise<PokerAccess> {
  const [access, email] = await Promise.all([getCurrentUserAccess(), currentUserEmail()])
  const flags = resolvePokerFlags(process.env)
  const tester = isAlphaTester(email, process.env[POKER_ALPHA_TESTERS_ENV])
  const viewer: PokerViewer = { isAdmin: access.isAdmin, isAlphaTester: tester }
  return {
    flags,
    access,
    visible: pokerVisibleTo(flags, viewer),
    isAlphaTester: tester,
    isAlpha: flags.alpha,
  }
}

function viewerOf(a: PokerAccess): PokerViewer {
  return { isAdmin: a.access.isAdmin, isAlphaTester: a.isAlphaTester }
}

// Convenience for pages/components that already hold a PokerAccess.
export function pokerAccessCan(a: PokerAccess, cap: PokerCapability): boolean {
  return pokerCan(a.flags, viewerOf(a), cap)
}

// For server actions: returns a stable error code when the capability is off, or
// null when allowed. Callers surface the code to the UI (translated) exactly like
// any other ActionResult failure. A join/create denied specifically by the
// wind-down freeze returns a distinct code so the UI can explain "joins paused".
export async function checkPokerCapability(cap: PokerCapability): Promise<string | null> {
  const a = await getPokerAccess()
  if (pokerAccessCan(a, cap)) return null
  if ((cap === 'join' || cap === 'create') && a.flags.blockNewJoins && a.visible) {
    return 'poker_joins_frozen'
  }
  return 'poker_feature_off'
}
