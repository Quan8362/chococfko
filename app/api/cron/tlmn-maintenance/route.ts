import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/cronReminders';
import { reapAbandonedGames } from '@/app/games/tlmn/actions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Browser-independent Tiến Lên lifecycle maintenance, intended for a scheduler (Vercel
// Cron or any external pinger). Protected by CRON_SECRET (constant-time compare).
//
// The TLMN turn loop is client-NUDGED (runBotTurn / tickTurnTimer run only in seated
// browsers — there is no long-lived server), so a match whose every human leaves or
// disconnects mid-round is stranded in status='playing' forever. reapAbandonedGames()
// closes such matches out as 'abandoned' (no winner, no settlement, no stats),
// independently of any open tab. Idempotent: every write is a conditional/atomic DB
// update guarded on status='playing', safe to run on any cadence and concurrently with
// the same work nudged on TLMN lobby load.
//
// Scheduled in vercel.json "crons" (minutely is ideal for snappy abandoned-match
// resolution). The same work also runs on every TLMN lobby page load, which covers most
// real traffic; this route is the backstop for zero-traffic periods.
export async function GET(req: Request) {
  if (!isAuthorizedCron(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const abandoned = await reapAbandonedGames().catch(() => ({ abandoned: 0 }));
  const durationMs = Date.now() - startedAt;
  const summary = { ok: true, durationMs, ...abandoned };
  console.log('[cron/tlmn-maintenance] summary', summary);
  return NextResponse.json(summary);
}
