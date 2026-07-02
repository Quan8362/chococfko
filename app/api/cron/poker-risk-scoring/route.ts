import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cronReminders'
import { runRiskScoringJob } from '@/app/admin/poker/integrity-score-job'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// ── Scheduled anti-collusion RISK SCORING (browser-independent) ──────────────────────────
//
// Protected by CRON_SECRET (constant-time compare — same pattern as the other maintenance crons).
// Runs the deterministic, idempotent risk-scoring job (integrity-score-job.ts): it reduces recent
// settled hands to privacy-safe facts, scores each subject with the PURE engine, and UPSERTs the
// versioned score + REDACTED evidence into the review queue (poker_risk_upsert_case, dedup-keyed).
//
// NEVER punishes, bans, opens incidents, or moves coins — it only surfaces evidence for a human
// reviewer at /admin/poker/integrity. Degrade-safe: if migration_poker_integrity.sql is not applied
// (or there are no settled hands, e.g. while Poker ships dark) it no-ops and returns ok.
export async function GET(req: Request) {
  if (!isAuthorizedCron(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const started = Date.now()
  try {
    const result = await runRiskScoringJob()
    if (!result.dbAvailable) {
      // Expected until the migration is applied — informational, not an error.
      // eslint-disable-next-line no-console
      console.warn('[poker-integrity-scoring] risk tables unavailable (migration pending); no-op')
    }
    // Always 200 so the scheduler does not retry; `dbAvailable`/`persisted` carry the signal.
    return NextResponse.json(result)
  } catch {
    // eslint-disable-next-line no-console
    console.error('[poker-integrity-scoring] job_failed')
    return NextResponse.json({ ok: false, error: 'job_failed', durationMs: Date.now() - started }, { status: 500 })
  }
}
