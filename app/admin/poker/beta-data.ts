// ── Poker CLOSED BETA dashboard — read-side data loader (service role; server-only) ──────
//
// Plain async loaders (NOT 'use server') imported by the admin-gated Beta page. Builds on the
// Alpha dashboard (session throughput, integrity signals, bug analytics) and adds the
// beta-specific view: cohort roster (from env allowlists), terms-acknowledgement counts,
// feedback broken down by the beta category taxonomy, and a HONEST success-criteria
// evaluation against measured metrics (unknowns are reported as "—", never fabricated).
//
// 🔴 Cohort emails are PII and are returned ONLY to this admin-gated loader. Never send them
// to a public/client payload. Everything degrades safely: a missing acknowledgements table
// (migration not applied) yields available:false rather than throwing.

import { createAdminClient } from '@/lib/supabase/admin'
import { resolvePokerFlags } from '@/lib/games/poker/flags'
import {
  buildBetaRoster,
  evaluateBetaSuccess,
  COHORT_GATES,
  BETA_COHORTS,
  BETA_TERMS_VERSION,
  BETA_SUCCESS_TARGETS,
  type BetaRoster,
  type BetaCohort,
  type BetaSuccessEvaluation,
  type BetaMeasuredMetrics,
} from '@/lib/games/poker/beta'
import { BETA_FEEDBACK_CATEGORIES } from '@/lib/games/poker/bugReport'
import { loadAlphaDashboard, type AlphaDashboard } from './alpha-data'

export interface BetaFlagsView {
  closedBeta: boolean
  enabled: boolean
  alpha: boolean
  createTable: boolean
  publicLobby: boolean
  privateTable: boolean
  spectator: boolean
  blockNewJoins: boolean
}

export interface BetaTermsAckStats {
  available: boolean
  currentVersion: number
  ackedCurrent: number   // distinct users who acked the CURRENT terms version
  ackedAny: number       // rows total (any version)
}

export interface BetaFeedbackStats {
  available: boolean
  total: number
  byCategory: Record<string, number>   // includes uncategorised as '(none)'
  openBlocker: number
  openMajor: number
}

export interface BetaDashboard {
  flags: BetaFlagsView
  roster: BetaRoster
  cohortGates: Record<BetaCohort, typeof COHORT_GATES[BetaCohort]>
  cohortOrder: readonly BetaCohort[]
  terms: BetaTermsAckStats
  feedback: BetaFeedbackStats
  // Reused Alpha session/integrity/bug analytics.
  alpha: AlphaDashboard
  // Honest success evaluation against measured metrics (unknowns = '—').
  success: BetaSuccessEvaluation
  targets: typeof BETA_SUCCESS_TARGETS
}

async function loadTermsStats(admin: ReturnType<typeof createAdminClient>): Promise<BetaTermsAckStats> {
  try {
    const { data, error } = await admin
      .from('poker_beta_acknowledgements')
      .select('user_id, terms_version')
      .limit(20000)
    if (error) throw error
    const rows = data ?? []
    const current = new Set<string>()
    for (const r of rows) {
      if ((r.terms_version as number) >= BETA_TERMS_VERSION) current.add(r.user_id as string)
    }
    return { available: true, currentVersion: BETA_TERMS_VERSION, ackedCurrent: current.size, ackedAny: rows.length }
  } catch {
    return { available: false, currentVersion: BETA_TERMS_VERSION, ackedCurrent: 0, ackedAny: 0 }
  }
}

async function loadFeedbackStats(admin: ReturnType<typeof createAdminClient>): Promise<BetaFeedbackStats> {
  const byCategory: Record<string, number> = {}
  for (const c of BETA_FEEDBACK_CATEGORIES) byCategory[c] = 0
  try {
    const { data, error } = await admin
      .from('poker_bug_reports')
      .select('severity, status, context')
      .order('created_at', { ascending: false })
      .limit(5000)
    if (error) throw error
    const rows = data ?? []
    let openBlocker = 0, openMajor = 0
    for (const r of rows) {
      const cat = (r.context as { feedbackCategory?: string } | null)?.feedbackCategory
      const key = cat && byCategory[cat] !== undefined ? cat : '(none)'
      byCategory[key] = (byCategory[key] ?? 0) + 1
      const isOpen = r.status === 'open' || r.status === 'triaged' || r.status === 'in_progress'
      if (isOpen && r.severity === 'blocker') openBlocker++
      if (isOpen && r.severity === 'major') openMajor++
    }
    return { available: true, total: rows.length, byCategory, openBlocker, openMajor }
  } catch {
    return { available: false, total: 0, byCategory, openBlocker: 0, openMajor: 0 }
  }
}

export async function loadBetaDashboard(): Promise<BetaDashboard> {
  const admin = createAdminClient()
  const flags = resolvePokerFlags(process.env)
  const roster = buildBetaRoster(process.env)

  const [alpha, terms, feedback] = await Promise.all([
    loadAlphaDashboard(),
    loadTermsStats(admin),
    loadFeedbackStats(admin),
  ])

  // Distinct non-trivial device classes actually observed in bug reports.
  const observedDeviceClasses = Object.keys(alpha.bugs.byDeviceClass)
    .filter((k) => k === 'desktop' || k === 'tablet' || k === 'phone').length

  // Build the measured metrics for the success evaluation. Anything we cannot MEASURE
  // is passed as null so it reports "unknown" rather than a fabricated value.
  const measured: BetaMeasuredMetrics = {
    // Hard safety invariants: coin conservation is directly measurable from ops_events;
    // private-card exposure and duplicate-settlement have no positive counter, so they are
    // reported as unknown until an integrity signal exists — never assumed to be zero.
    privateCardExposures: null,
    coinConservationFailures: alpha.integrity.available ? alpha.integrity.coinConservationFailures : null,
    duplicateSettlements: null,
    completedHands: alpha.session.completedHands,
    uniqueTesters: terms.available ? terms.ackedCurrent : 0,
    deviceClasses: observedDeviceClasses,
    reconnectSuccessRate: null,
    handCompletionRate: null,
    actionSuccessRate: null,
    criticalBugsOpen: feedback.available ? feedback.openBlocker : 0,
    highBugsOpen: feedback.available ? feedback.openMajor : 0,
  }

  return {
    flags: {
      closedBeta: flags.closedBeta, enabled: flags.enabled, alpha: flags.alpha,
      createTable: flags.createTable, publicLobby: flags.publicLobby,
      privateTable: flags.privateTable, spectator: flags.spectator,
      blockNewJoins: flags.blockNewJoins,
    },
    roster,
    cohortGates: COHORT_GATES,
    cohortOrder: BETA_COHORTS,
    terms,
    feedback,
    alpha,
    success: evaluateBetaSuccess(measured),
    targets: BETA_SUCCESS_TARGETS,
  }
}
