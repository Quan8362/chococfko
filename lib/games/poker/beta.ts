// ── Poker Closed Beta — PURE cohort membership, suspension, terms & success model ──
//
// The stage AFTER the controlled Alpha: a larger-but-still-private rollout organised
// into COHORTS that are advanced MANUALLY (never automatically). This module is pure —
// no process.env / DB / browser imports — so it is unit-testable and importable from
// anywhere. The server wrapper that reads the real env + the viewer lives in
// `app/games/poker/access.ts`; the admin dashboard reads it via `app/admin/poker/beta-data.ts`.
//
// Design mirrors the Alpha allowlist (see lib/games/poker/flags.ts):
//   • Membership is decided from comma-separated email allowlists — one per cohort —
//     so ops manages access with the same mental model as ADMIN_EMAILS / POKER_ALPHA_TESTERS.
//   • A separate SUSPEND list locks a single tester out immediately without editing a cohort.
//   • Nothing here turns the Beta on. The master switch is the `closedBeta` flag; this module
//     only answers "who, and in which cohort" once the stage is enabled.

// ── Cohorts ─────────────────────────────────────────────────────────────────────
// Canonical order = the intended ROLLOUT order. Earlier cohorts are smaller / more
// technical and are meant to clear their exit criteria before a later cohort is opened.
// A tester who appears in more than one list is assigned to the FIRST (most-trusted) one.
export const BETA_COHORTS = [
  'internal_admin',   // 1. Internal admins / core team
  'technical',        // 2. Technical testers (devs, QA)
  'experienced',      // 3. Experienced poker players
  'new_players',      // 4. New poker players (comprehension signal)
  'community',        // 5. Small invited community cohort
] as const
export type BetaCohort = (typeof BETA_COHORTS)[number]

export function isBetaCohort(v: unknown): v is BetaCohort {
  return typeof v === 'string' && (BETA_COHORTS as readonly string[]).includes(v)
}

// Env key holding each cohort's allowlist + the suspend list. Names mirror
// POKER_ALPHA_TESTERS so ops has one convention for every private-access list.
export const BETA_COHORT_ENV: Record<BetaCohort, string> = {
  internal_admin: 'POKER_BETA_COHORT_INTERNAL',
  technical: 'POKER_BETA_COHORT_TECHNICAL',
  experienced: 'POKER_BETA_COHORT_EXPERIENCED',
  new_players: 'POKER_BETA_COHORT_NEW',
  community: 'POKER_BETA_COHORT_COMMUNITY',
}

// Emails suspended from the Beta at the ACCESS layer (locked out entirely, next request).
// Distinct from a gameplay player_restriction (which lets them watch but not sit).
export const BETA_SUSPENDED_ENV = 'POKER_BETA_SUSPENDED'

// Ops-controlled service-status / maintenance env. `POKER_BETA_MAINTENANCE` is a wind-down
// switch: when on it BLOCKS new create/join (running hands & stacks preserved) AND shows the
// maintenance strip. `POKER_BETA_STATUS_MESSAGE` is a free-text status banner (display only).
export const BETA_MAINTENANCE_ENV = 'POKER_BETA_MAINTENANCE'
export const BETA_STATUS_MESSAGE_ENV = 'POKER_BETA_STATUS_MESSAGE'

// Only an explicit affirmative turns maintenance on; everything else resolves OFF (safe).
export function isBetaMaintenance(env: Record<string, string | undefined>): boolean {
  const v = env[BETA_MAINTENANCE_ENV]
  if (!v) return false
  const s = v.trim().toLowerCase()
  return s === '1' || s === 'true' || s === 'on' || s === 'yes'
}

// Current Beta terms version. Bumping it re-prompts every tester to acknowledge again.
// Keep this an integer so `needsBetaTermsAck` is a simple comparison.
export const BETA_TERMS_VERSION = 1

// ── Email-list parsing (shared shape with parseAlphaTesters) ──────────────────────
// Comma-separated, trimmed, lower-cased, de-duped. Any falsy input → empty list.
export function parseEmailList(raw: string | undefined | null): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  for (const part of raw.split(',')) {
    const e = part.trim().toLowerCase()
    if (e) seen.add(e)
  }
  return Array.from(seen)
}

function norm(email: string | null | undefined): string | null {
  if (!email) return null
  const e = email.trim().toLowerCase()
  return e || null
}

// ── Membership resolution ─────────────────────────────────────────────────────────
export interface BetaMembership {
  // In any cohort allowlist at all (and therefore admitted while `closedBeta` is on).
  inBeta: boolean
  // The assigned cohort (first match in canonical order), or null if not a member.
  cohort: BetaCohort | null
  // Suspended at the access layer (on the suspend list). A suspended tester is
  // reported here with inBeta possibly true but must be locked out by the caller.
  suspended: boolean
}

// Resolve a single viewer's Beta membership from the env-like record. Case-insensitive.
// A suspended email is still reported with its cohort (so the dashboard can show WHY it
// is locked out) but `suspended` is set so the access layer denies visibility.
export function resolveBetaMembership(
  email: string | null | undefined,
  env: Record<string, string | undefined>,
): BetaMembership {
  const e = norm(email)
  if (!e) return { inBeta: false, cohort: null, suspended: false }

  const suspended = parseEmailList(env[BETA_SUSPENDED_ENV]).includes(e)

  let cohort: BetaCohort | null = null
  for (const c of BETA_COHORTS) {
    if (parseEmailList(env[BETA_COHORT_ENV[c]]).includes(e)) { cohort = c; break }
  }

  return { inBeta: cohort !== null, cohort, suspended }
}

// Convenience booleans for the access layer.
export function isBetaMember(email: string | null | undefined, env: Record<string, string | undefined>): boolean {
  return resolveBetaMembership(email, env).inBeta
}
export function isBetaSuspended(email: string | null | undefined, env: Record<string, string | undefined>): boolean {
  return resolveBetaMembership(email, env).suspended
}

// ── Roster (admin dashboard) ────────────────────────────────────────────────────
export interface BetaRoster {
  // Emails per cohort, AFTER de-duping across cohorts (an email only appears in the
  // first cohort it matched, so the counts are a true, non-overlapping partition).
  cohorts: Record<BetaCohort, string[]>
  counts: Record<BetaCohort, number>
  suspended: string[]
  total: number       // total distinct testers across all cohorts (incl. suspended)
  activeTotal: number // total distinct testers NOT suspended
}

// Build the full, de-duplicated roster from the env. Used ONLY server-side by the admin
// dashboard — emails are PII and must never be sent to a public/client payload.
export function buildBetaRoster(env: Record<string, string | undefined>): BetaRoster {
  const cohorts = {} as Record<BetaCohort, string[]>
  const counts = {} as Record<BetaCohort, number>
  const assigned = new Set<string>()
  for (const c of BETA_COHORTS) {
    const emails = parseEmailList(env[BETA_COHORT_ENV[c]]).filter((e) => !assigned.has(e))
    emails.forEach((e) => assigned.add(e))
    cohorts[c] = emails
    counts[c] = emails.length
  }
  const suspended = parseEmailList(env[BETA_SUSPENDED_ENV])
  const suspendedSet = new Set(suspended)
  const activeTotal = Array.from(assigned).filter((e) => !suspendedSet.has(e)).length
  return { cohorts, counts, suspended, total: assigned.size, activeTotal }
}

// ── Terms acknowledgement ─────────────────────────────────────────────────────────
// A tester must acknowledge the Beta terms (play-money, data-may-reset, expect-bugs)
// once per terms version before they may sit/create/join. Pure comparison so the gate
// is testable; the server records the acknowledged version in poker_beta_acknowledgements.
export function needsBetaTermsAck(acknowledgedVersion: number | null | undefined): boolean {
  if (acknowledgedVersion == null) return true
  return acknowledgedVersion < BETA_TERMS_VERSION
}

// ── Cohort entry / exit criteria (documentation-as-data) ─────────────────────────
// Human gates, NOT auto-advanced. Surfaced on the admin dashboard so the operator can
// see, per cohort, what must be true to open the NEXT cohort. Advancement is manual.
export interface CohortGate {
  cohort: BetaCohort
  entry: string[]
  exit: string[]
}

export const COHORT_GATES: Record<BetaCohort, CohortGate> = {
  internal_admin: {
    cohort: 'internal_admin',
    entry: [
      'All poker migrations applied to the target environment and verified',
      'Feature flags set to the closed-beta baseline (public master flag OFF)',
      'Admin dashboards (overview, metrics, integrity, beta) load with live data',
    ],
    exit: [
      'A full hand plays end-to-end (deal → showdown → settlement) with no coin drift',
      'Reconnect mid-hand restores authoritative state with no stuck hand',
      'Zero private-card exposure observed in any payload/log',
      'No open blocker bug',
    ],
  },
  technical: {
    cohort: 'technical',
    entry: [
      'internal_admin exit criteria all cleared',
      'In-game report flow files a categorised report that lands on the beta dashboard',
    ],
    exit: [
      'All-in + side-pot hands settle correctly across ≥2 devices',
      'Timeout → fold/auto-action behaves per spec',
      'No open blocker bug; ≤ agreed high-bug count',
      'Zero coin-conservation failures on the dashboard',
    ],
  },
  experienced: {
    cohort: 'experienced',
    entry: [
      'technical exit criteria all cleared',
      'Known-issues page published and linked from the beta banner',
    ],
    exit: [
      'Rule correctness confirmed on real hands (split pots, refunds, min-raise)',
      'Action success rate at/above target',
      'No open blocker bug',
    ],
  },
  new_players: {
    cohort: 'new_players',
    entry: [
      'experienced exit criteria all cleared',
      'Rules + learn links reachable from every table',
    ],
    exit: [
      'Comprehension target met (players understand call/raise amounts, pot, current actor)',
      'No blocker/major bug from confusion-driven mistakes',
    ],
  },
  community: {
    cohort: 'community',
    entry: [
      'new_players exit criteria all cleared',
      'Support triage cadence in place; welcome + bug-report guides sent',
    ],
    exit: [
      'Beta success criteria met across the whole tester population',
      'Go/no-go decision recorded for the next stage',
    ],
  },
}

// ── Success criteria (measurable, evaluated against REAL metrics only) ────────────
// These are TARGETS. `evaluateBetaSuccess` takes actual measured metrics and reports,
// per criterion, whether the target is met. It NEVER fabricates data — a caller that
// has no measurement passes the real (possibly zero/unknown) value and the criterion
// simply reports "not met". `unknown` fields (null) are reported as not-yet-measured.
export interface BetaSuccessTargets {
  minCompletedHands: number
  minUniqueTesters: number
  minDeviceClasses: number         // distinct device classes (desktop/tablet/phone)
  minReconnectSuccessRate: number  // 0..1
  minHandCompletionRate: number    // 0..1
  minActionSuccessRate: number     // 0..1
  maxCriticalBugsOpen: number
  maxHighBugsOpen: number
}

export const BETA_SUCCESS_TARGETS: BetaSuccessTargets = {
  minCompletedHands: 2000,
  minUniqueTesters: 20,
  minDeviceClasses: 3,
  minReconnectSuccessRate: 0.99,
  minHandCompletionRate: 0.99,
  minActionSuccessRate: 0.995,
  maxCriticalBugsOpen: 0,
  maxHighBugsOpen: 3,
}

// The hard SAFETY invariants that must be exactly zero — non-negotiable, independent of
// the tunable targets above. Any non-zero value here is a stop-the-beta condition.
export interface BetaSafetyCounts {
  privateCardExposures: number | null
  coinConservationFailures: number | null
  duplicateSettlements: number | null
}

export interface BetaMeasuredMetrics extends BetaSafetyCounts {
  completedHands: number
  uniqueTesters: number
  deviceClasses: number
  reconnectSuccessRate: number | null
  handCompletionRate: number | null
  actionSuccessRate: number | null
  criticalBugsOpen: number
  highBugsOpen: number
}

export type CriterionStatus = 'met' | 'not_met' | 'unknown'

export interface CriterionResult {
  key: string
  status: CriterionStatus
  target: number | string
  actual: number | string
  // Hard safety invariant (must be zero) vs a tunable rollout target.
  hard: boolean
}

export interface BetaSuccessEvaluation {
  results: CriterionResult[]
  // True ONLY if every hard invariant is met (none unknown/failed) AND every target met.
  allMet: boolean
  // True if any HARD safety invariant is failed (a stop condition), independent of targets.
  safetyBreached: boolean
}

function atLeast(actual: number | null, target: number, hard: boolean, key: string): CriterionResult {
  if (actual == null) return { key, status: 'unknown', target, actual: '—', hard }
  return { key, status: actual >= target ? 'met' : 'not_met', target, actual, hard }
}
function atMost(actual: number | null, target: number, hard: boolean, key: string): CriterionResult {
  if (actual == null) return { key, status: 'unknown', target, actual: '—', hard }
  return { key, status: actual <= target ? 'met' : 'not_met', target, actual, hard }
}
function exactlyZero(actual: number | null, key: string): CriterionResult {
  if (actual == null) return { key, status: 'unknown', target: 0, actual: '—', hard: true }
  return { key, status: actual === 0 ? 'met' : 'not_met', target: 0, actual, hard: true }
}

export function evaluateBetaSuccess(
  m: BetaMeasuredMetrics,
  targets: BetaSuccessTargets = BETA_SUCCESS_TARGETS,
): BetaSuccessEvaluation {
  const results: CriterionResult[] = [
    // Hard safety invariants (must be exactly zero) — evaluated first.
    exactlyZero(m.privateCardExposures, 'zero_private_card_exposure'),
    exactlyZero(m.coinConservationFailures, 'zero_coin_conservation_failure'),
    exactlyZero(m.duplicateSettlements, 'zero_duplicate_settlement'),
    // Tunable rollout targets.
    atLeast(m.completedHands, targets.minCompletedHands, false, 'min_completed_hands'),
    atLeast(m.uniqueTesters, targets.minUniqueTesters, false, 'min_unique_testers'),
    atLeast(m.deviceClasses, targets.minDeviceClasses, false, 'min_device_classes'),
    atLeast(m.reconnectSuccessRate, targets.minReconnectSuccessRate, false, 'reconnect_success_rate'),
    atLeast(m.handCompletionRate, targets.minHandCompletionRate, false, 'hand_completion_rate'),
    atLeast(m.actionSuccessRate, targets.minActionSuccessRate, false, 'action_success_rate'),
    atMost(m.criticalBugsOpen, targets.maxCriticalBugsOpen, false, 'max_critical_bugs_open'),
    atMost(m.highBugsOpen, targets.maxHighBugsOpen, false, 'max_high_bugs_open'),
  ]
  const safetyBreached = results.some((r) => r.hard && r.status === 'not_met')
  const allMet = results.every((r) => r.status === 'met')
  return { results, allMet, safetyBreached }
}
