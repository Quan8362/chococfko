import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cronReminders'
import { loadPokerMetrics } from '@/app/admin/poker/metrics-data'
import { redactTelemetryDetail } from '@/lib/games/poker/telemetry'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// ── Scheduled coin-integrity evaluator + breach router ──────────────────────────────────────
//
// A browser-independent safety net for Poker money integrity. Protected by CRON_SECRET
// (constant-time compare, same pattern as the TLMN/Caro maintenance crons). It runs the SAME pure
// live coin-integrity audit + SLO evaluation the admin metrics dashboard uses (loadPokerMetrics)
// and routes any breach to an actionable, durable signal using EXISTING infrastructure — a
// structured `[poker-alert]` log line captured by Vercel runtime logs (greppable; the exact
// channel a log-drain alert rule would fire on). No new vendor, no schema change.
//
// Deliberately does NOT write poker_ops_events rows (that would feed back into the next run's
// integrity counters and double-count) and does NOT auto-open incident cases (those require a human
// admin actor + reason by design). Incident creation stays a human action from /admin/poker.
//
// Privacy: the audit evidence is numbers/ids only; it is additionally passed through
// redactTelemetryDetail before logging. No cards / decks / tokens / PII ever appear in the alert.
//
// Safe to run on any cadence and concurrently with dashboard loads — it only READS.
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
          // Already numbers/ids only; redact defensively before it leaves the process.
          sample: view.audit.sample.map((s) => redactTelemetryDetail({ code: s.code, severity: s.severity, ...s.correlation, ...s.evidence })),
        },
      }
      // eslint-disable-next-line no-console
      console.error(`[poker-alert] ${JSON.stringify(payload)}`)
    }

    const summary = {
      ok: !alert,
      alert,
      breaches,
      integrityViolations,
      settlementsChecked: view.audit.settlementsChecked,
      worstStatus: view.worstStatus,
      windowHours: view.windowHours,
      durationMs: Date.now() - startedAt,
    }
    // Always 200 so the scheduler does not retry; `alert`/`ok` carry the actionable signal.
    return NextResponse.json(summary)
  } catch {
    // Never expose internals; a failed evaluator is itself worth noticing in logs.
    // eslint-disable-next-line no-console
    console.error('[poker-alert] evaluator_failed')
    return NextResponse.json({ ok: false, error: 'evaluator_failed', durationMs: Date.now() - startedAt }, { status: 500 })
  }
}
