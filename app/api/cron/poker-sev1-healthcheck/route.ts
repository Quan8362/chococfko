import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cronReminders'
import { sendSev1HealthCheck } from '@/lib/games/poker/incidentNotifier'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// ── SEV-1 notifier health check ─────────────────────────────────────────────────────────────
//
// Proves the WHOLE SEV-1 alert path (build → redact → dedupe → durable log + operational email)
// reaches an approved operator WITHOUT triggering a real production incident. Protected by
// CRON_SECRET (constant-time compare). The alert it sends is clearly marked "[SEV-1 HEALTHCHECK]"
// and carries no correlation to any real tournament/table/hand.
//
// It is safe to call twice in a row to verify deduplication: the second call within the cooldown
// window returns `suppressed: true` and delivers no email. Returns 200 with the delivery posture;
// never induces a real privacy/economy/duplicate breach.
export async function GET(req: Request) {
  if (!isAuthorizedCron(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const r = await sendSev1HealthCheck()
  return NextResponse.json({
    ok: true,
    healthcheck: true,
    notified: r.notified,
    suppressed: r.suppressed,
    emailDispatched: r.emailDispatched,
    emailReason: r.emailReason,
    code: r.incident.code,
    occurrenceCount: r.incident.occurrenceCount,
  })
}
