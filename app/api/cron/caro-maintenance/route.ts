import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/cronReminders';
import { resolveExpiredCaroGames, finalizeStaleGames, cleanupStaleWaitingRooms } from '@/app/games/caro/actions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Browser-independent Caro lifecycle maintenance, intended for a scheduler (Vercel
// Cron or any external pinger). Protected by CRON_SECRET (constant-time compare).
// Idempotent: every operation is a conditional/atomic DB write, safe to run on any
// cadence and to run concurrently with the same work triggered on lobby load.
//
// To schedule on Vercel, add to vercel.json "crons" (a plan that allows the chosen
// frequency is required; minutely is ideal for snappy abandoned-game resolution):
//   { "path": "/api/cron/caro-maintenance", "schedule": "* * * * *" }
// Until scheduled, the same work also runs on every lobby page load, which covers
// most real traffic; this route is the backstop for zero-traffic periods.
export async function GET(req: Request) {
  if (!isAuthorizedCron(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const [timeouts, abandoned, staleWaiting] = await Promise.all([
    resolveExpiredCaroGames().catch(() => ({ resolved: 0 })),
    finalizeStaleGames().catch(() => ({ finalized: 0 })),
    cleanupStaleWaitingRooms().catch(() => ({ removed: 0 })),
  ]);

  const durationMs = Date.now() - startedAt;
  const summary = { ok: true, durationMs, ...timeouts, ...abandoned, ...staleWaiting };
  console.log('[cron/caro-maintenance] summary', summary);
  return NextResponse.json(summary);
}
