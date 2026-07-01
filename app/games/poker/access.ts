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
import {
  resolvePokerFlags,
  pokerVisibleTo,
  pokerCan,
  type PokerFlags,
  type PokerCapability,
} from '@/lib/games/poker/flags'

export interface PokerAccess {
  flags: PokerFlags
  access: UserAccess
  visible: boolean
}

export async function getPokerAccess(): Promise<PokerAccess> {
  const access = await getCurrentUserAccess()
  const flags = resolvePokerFlags(process.env)
  return { flags, access, visible: pokerVisibleTo(flags, { isAdmin: access.isAdmin }) }
}

// Convenience for pages/components that already hold a PokerAccess.
export function pokerAccessCan(a: PokerAccess, cap: PokerCapability): boolean {
  return pokerCan(a.flags, { isAdmin: a.access.isAdmin }, cap)
}

// For server actions: returns a stable error code when the capability is off, or
// null when allowed. Callers surface the code to the UI (translated) exactly like
// any other ActionResult failure.
export async function checkPokerCapability(cap: PokerCapability): Promise<string | null> {
  const { flags, access } = await getPokerAccess()
  return pokerCan(flags, { isAdmin: access.isAdmin }, cap) ? null : 'poker_feature_off'
}
