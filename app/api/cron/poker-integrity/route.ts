import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cronReminders'
import { loadPokerMetrics } from '@/app/admin/poker/metrics-data'
import { redactTelemetryDetail } from '@/lib/games/poker/telemetry'
import { createAdminClient } from '@/lib/supabase/admin'
import { emitSev1 } from '@/lib/games/poker/incidentNotifier'
import {
  detectionFromIntegrity,
  detectDuplicateActiveHands,
  detectDuplicatePayouts,
  type LiveHandRow,
  type PayoutRow,
  type Sev1Detection,
} from '@/lib/games/poker/incidentDetectors'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// ── Scheduled coin-integrity evaluator + ACTIVE SEV-1 router ──────────────────────────────────
//
// A browser-independent safety net for Poker money integrity. Protected by CRON_SECRET
// (constant-time compare, same pattern as the TLMN/Caro maintenance crons). It runs the SAME pure
// live coin-integrity audit + SLO evaluation the admin metrics dashboard uses (loadPokerMetrics) AND
// (27G-M1 / B1) now ROUTES any zero-tolerance invariant breach to the active SEV-1 notifier
// (incidentNotifier.emitSev1 → durable [poker-sev1] log + operational email to ADMIN_EMAILS), with
// deterministic dedupe so a persistent breach pages once per cooldown window, not on every run.
//
// In addition to the coin-integrity audit it runs two cheap, read-only tripwire scans for invariants
// NOT backed by a DB unique constraint / audited by the metrics loader:
//   • more than one ACTIVE hand at a table (cash + tournament), and
//   • duplicate payout/refund rows per entry (defense-in-depth on the UNIQUE constraint).
//
// Privacy: every alert is built through the incident contract, which re-redacts + hard-asserts the
// payload carries no cards / decks / tokens / PII. The legacy [poker-alert] summary line is kept for
// backwards-compatible log-drain rules. Read-only; safe on any cadence and concurrently with loads.
export async function GET(req: Request) {
  if (!isAuthorizedCron(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  try {
    const view = await loadPokerMetrics()
    const breaches = view.snapshot.slo.filter((v) => v.status === 'breach').map((v) => v.key)
    const integrityViolations = view.audit.violations
    const alert = breaches.length > 0 || integrityViolations > 0

    if (alert) {
      const payload = {
        source: 'cron/poker-integrity',
        ts: new Date().toISOString(),
        buildVersion: process.env.NEXT_PUBLIC_BUILD_ID ?? undefined,
        region: process.env.VERCEL_REGION ?? undefined,
        breaches,
        integrity: {
          settlementsChecked: view.audit.settlementsChecked,
          violations: integrityViolations,
          sample: view.audit.sample.map((s) => redactTelemetryDetail({ code: s.code, severity: s.severity, ...s.correlation, ...s.evidence })),
        },
      }
      // eslint-disable-next-line no-console
      console.error(`[poker-alert] ${JSON.stringify(payload)}`)
    }

    // ── Route coin-integrity violations to the active SEV-1 notifier ──────────────────────────
    const detections: Sev1Detection[] = view.audit.sample.map((v) => detectionFromIntegrity(v, 'cron/poker-integrity'))

    // ── Cheap read-only tripwire scans (never affect gameplay) ────────────────────────────────
    const admin = createAdminClient()
    try {
      const liveRows = await scanLiveHands(admin)
      detections.push(...detectDuplicateActiveHands(liveRows, 'cron/poker-integrity'))
    } catch { /* scan is best-effort */ }
    try {
      const payoutRows = await scanTournamentPayouts(admin)
      detections.push(...detectDuplicatePayouts(payoutRows, 'cron/poker-integrity'))
    } catch { /* scan is best-effort */ }

    let sev1Emitted = 0
    for (const d of detections) {
      const r = await emitSev1({ code: d.code, correlation: d.correlation, facts: d.facts })
      if (r.notified) sev1Emitted += 1
    }

    const summary = {
      ok: !alert && detections.length === 0,
      alert,
      breaches,
      integrityViolations,
      sev1Detections: detections.length,
      sev1Emitted,
      settlementsChecked: view.audit.settlementsChecked,
      worstStatus: view.worstStatus,
      windowHours: view.windowHours,
      durationMs: Date.now() - startedAt,
    }
    // Always 200 so the scheduler does not retry; `alert`/`ok`/`sev1Detections` carry the signal.
    return NextResponse.json(summary)
  } catch {
    // Never expose internals; a failed evaluator is itself worth noticing in logs.
    // eslint-disable-next-line no-console
    console.error('[poker-alert] evaluator_failed')
    return NextResponse.json({ ok: false, error: 'evaluator_failed', durationMs: Date.now() - startedAt }, { status: 500 })
  }
}

type Admin = ReturnType<typeof createAdminClient>

// Non-terminal cash + tournament hands, mapped to opaque table keys for the duplicate-active-hand
// detector. Bounded LIMITs keep this cheap even under load.
async function scanLiveHands(admin: Admin): Promise<LiveHandRow[]> {
  const rows: LiveHandRow[] = []
  const { data: cash } = await admin
    .from('poker_hands')
    .select('id,table_id,phase')
    .not('phase', 'in', '("COMPLETED","CANCELLED")')
    .limit(1000)
  for (const h of (cash ?? []) as { id: string; table_id: string; phase: string }[]) {
    rows.push({ tableKey: `cash:${h.table_id}`, live: true, tableId: h.table_id })
  }
  const { data: tnmt } = await admin
    .from('poker_tournament_hands')
    .select('id,tournament_id,table_no,settled')
    .eq('settled', false)
    .limit(1000)
  for (const h of (tnmt ?? []) as { id: string; tournament_id: string; table_no: number; settled: boolean }[]) {
    rows.push({ tableKey: `tnmt:${h.tournament_id}:${h.table_no}`, live: true, tournamentId: h.tournament_id })
  }
  return rows
}

async function scanTournamentPayouts(admin: Admin): Promise<PayoutRow[]> {
  const { data } = await admin
    .from('poker_tournament_payouts')
    .select('tournament_id,entry_id,kind')
    .limit(5000)
  return ((data ?? []) as { tournament_id: string; entry_id: string; kind: string }[])
    .map((r) => ({ tournamentId: r.tournament_id, entryId: r.entry_id, kind: r.kind }))
}
