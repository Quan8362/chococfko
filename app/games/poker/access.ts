// Server-side poker feature-flag resolution + capability gates.
//
// Reads the real process.env (server-only) and the current viewer's access
// (auth + ADMIN_EMAILS). Enforcement lives HERE (server actions + the route
// layout) so a disabled feature cannot be reached by a hand-crafted POST — the
// flag is authoritative, not a client-side convenience. Admins bypass the public
// gates for the admin-only production-visibility rollout stage; bot/tournament
// stay hard-off for everyone (see lib/games/poker/flags.ts).
//
// Two private-access stages layer on top of the public flags:
//   • Alpha  — POKER_ALPHA_MODE + POKER_ALPHA_TESTERS (flat allowlist).
//   • Closed Beta — POKER_CLOSED_BETA_ENABLED + per-cohort allowlists + suspend
//     list + a one-time terms acknowledgement (see lib/games/poker/beta.ts).

import { getCurrentUserAccess } from '@/lib/access-server'
import type { UserAccess } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  resolvePokerFlags,
  pokerVisibleTo,
  pokerCan,
  pokerSocialFeatureOn,
  isAlphaTester,
  POKER_ALPHA_TESTERS_ENV,
  type PokerFlags,
  type PokerCapability,
  type PokerViewer,
  type PokerSocialFeature,
} from '@/lib/games/poker/flags'
import {
  resolveBetaMembership,
  needsBetaTermsAck,
  isBetaMaintenance,
  BETA_TERMS_VERSION,
  type BetaCohort,
} from '@/lib/games/poker/beta'
import {
  resolveMaintenance,
  maintenanceGate,
  worseDecision,
  type MaintenanceStatus,
  type MaintenanceDecision,
} from '@/lib/games/poker/maintenance'

export interface PokerAccess {
  flags: PokerFlags
  access: UserAccess
  visible: boolean
  isAlphaTester: boolean
  // True Alpha screens should be labelled; convenience for the UI badge.
  isAlpha: boolean
  // ── Closed Beta ──
  // Whether the closed-beta stage is the active gate (POKER_CLOSED_BETA_ENABLED).
  isBeta: boolean
  // Whether THIS viewer is a beta cohort member and, if so, which cohort.
  isBetaMember: boolean
  betaCohort: BetaCohort | null
  // Access-layer suspension (locked out entirely). Admins are never suspended.
  betaSuspended: boolean
  // Ops maintenance wind-down: blocks new create/join for everyone (running hands
  // preserved) and drives the maintenance strip in the UI.
  betaMaintenance: boolean
  // Graduated ops maintenance mode (POKER_MAINTENANCE_MODE): a tiered service-status
  // wind-down from "read-only lobby" to "emergency shutdown". Composed most-restrictive
  // -wins with the feature flags and betaMaintenance in checkPokerCapability. The status
  // (mode + admin message + ETA) also drives the maintenance banner/screen in the UI.
  maintenance: MaintenanceStatus
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
  const beta = resolveBetaMembership(email, process.env)
  const viewer: PokerViewer = {
    isAdmin: access.isAdmin,
    isAlphaTester: tester,
    isBetaMember: beta.inBeta,
    suspended: beta.suspended,
  }
  return {
    flags,
    access,
    visible: pokerVisibleTo(flags, viewer),
    isAlphaTester: tester,
    isAlpha: flags.alpha,
    isBeta: flags.closedBeta,
    isBetaMember: beta.inBeta,
    betaCohort: beta.cohort,
    betaSuspended: beta.suspended,
    betaMaintenance: isBetaMaintenance(process.env),
    maintenance: resolveMaintenance(process.env),
  }
}

function viewerOf(a: PokerAccess): PokerViewer {
  return {
    isAdmin: a.access.isAdmin,
    isAlphaTester: a.isAlphaTester,
    isBetaMember: a.isBetaMember,
    suspended: a.betaSuspended,
  }
}

// Convenience for pages/components that already hold a PokerAccess.
export function pokerAccessCan(a: PokerAccess, cap: PokerCapability): boolean {
  return pokerCan(a.flags, viewerOf(a), cap)
}

// Is an additive social feature (achievements/missions/…) available to THIS viewer? Requires the
// feature flag ON and the viewer able to see poker at all (no admin override — social features
// ship dark until their flag is flipped). Used by pages/components holding a PokerAccess.
export function pokerAccessSocial(a: PokerAccess, feature: PokerSocialFeature): boolean {
  return pokerSocialFeatureOn(a.flags, viewerOf(a), feature)
}

// Async convenience for server actions that don't already hold a PokerAccess.
export async function pokerSocialAvailable(feature: PokerSocialFeature): Promise<boolean> {
  return pokerAccessSocial(await getPokerAccess(), feature)
}

// Has this viewer acknowledged the CURRENT beta terms version? Degrade-safe:
//   • Returns { required:false } whenever the closed-beta stage is not the active gate,
//     the viewer is an admin, or the viewer is not a beta member — so nothing changes
//     for the public / alpha / admin flows.
//   • If the acknowledgement table is missing (migration not applied), returns
//     available:false and the caller decides. checkPokerCapability fails CLOSED for
//     create/join under an active beta so a tester cannot play without accepting terms;
//     applying migration_poker_beta.sql is a documented cohort-entry criterion.
export interface BetaTermsAckState {
  required: boolean          // beta is the active gate AND this viewer is a non-admin member
  acknowledged: boolean      // has acked the current terms version
  version: number            // BETA_TERMS_VERSION
  available: boolean         // ack table reachable (migration applied)
}

export async function getBetaTermsAck(a?: PokerAccess): Promise<BetaTermsAckState> {
  const acc = a ?? (await getPokerAccess())
  const version = BETA_TERMS_VERSION
  // The terms gate keys off BETA COHORT MEMBERSHIP, not admin status: anyone enrolled as a
  // tester (in a cohort) must accept the tester terms before committing coins — even if they
  // are also an app admin (the internal beta's sole tester is both). A pure ops admin who is
  // NOT in any cohort is not a tester and is never gated here.
  if (!acc.isBeta || !acc.isBetaMember) {
    return { required: false, acknowledged: true, version, available: true }
  }
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { required: true, acknowledged: false, version, available: true }
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('poker_beta_acknowledgements')
      .select('terms_version')
      .eq('user_id', user.id)
      .order('terms_version', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) {
      // 42P01 = undefined_table → migration not applied yet.
      if ((error as { code?: string }).code === '42P01') {
        return { required: true, acknowledged: false, version, available: false }
      }
      // Unknown read error: fail closed (require ack) but mark available so ops notices.
      return { required: true, acknowledged: false, version, available: true }
    }
    const acked = (data as { terms_version?: number } | null)?.terms_version ?? null
    return { required: true, acknowledged: !needsBetaTermsAck(acked), version, available: true }
  } catch {
    return { required: true, acknowledged: false, version, available: true }
  }
}

// For server actions: returns a stable error code when the capability is off, or
// null when allowed. Callers surface the code to the UI (translated) exactly like
// any other ActionResult failure. A join/create denied specifically by the
// wind-down freeze returns a distinct code so the UI can explain "joins paused".
// Under an active Closed Beta, create/join additionally require the terms ack.
export async function checkPokerCapability(cap: PokerCapability): Promise<string | null> {
  const a = await getPokerAccess()
  if (!pokerAccessCan(a, cap)) {
    if ((cap === 'join' || cap === 'create') && a.flags.blockNewJoins && a.visible) {
      return 'poker_joins_frozen'
    }
    return 'poker_feature_off'
  }
  // Graduated maintenance mode + legacy beta wind-down, composed most-restrictive-wins. Applies to
  // EVERYONE (like blockNewJoins) so a wind-down is total and predictable; admins run ops from
  // /admin/poker, which is gated by ADMIN_EMAILS and not by these gameplay capabilities. The mode
  // only ever blocks NEW commitments (and, at the two severe tiers, read access) — it never settles,
  // cancels, or freezes a live hand, so no player loses an active stack.
  const legacy: MaintenanceDecision =
    a.betaMaintenance && (cap === 'create' || cap === 'join')
      ? { allowed: false, reason: 'joins_frozen' }
      : { allowed: true, reason: null }
  const decision = worseDecision(maintenanceGate(a.maintenance.mode, cap), legacy)
  if (!decision.allowed) {
    return decision.reason === 'feature_off' ? 'poker_feature_off' : 'poker_joins_frozen'
  }
  // Beta terms gate: a beta cohort member (non-admin) must accept terms before
  // committing coins (create a table or take a seat). Read-only capabilities
  // (enter/spectate/public_lobby) are never blocked by the terms gate.
  if (cap === 'create' || cap === 'join') {
    const ack = await getBetaTermsAck(a)
    if (ack.required && !ack.acknowledged) return 'poker_beta_terms_required'
  }
  return null
}
