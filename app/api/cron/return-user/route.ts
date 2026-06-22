import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyUsers } from '@/lib/notifications/user';
import { getPublishedEvents } from '@/lib/eventsDb';
import { startsSoon } from '@/lib/events';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Time-based return-user notifications. Intended to be called on a schedule
// (e.g. Vercel Cron, every ~30 min). Protected by CRON_SECRET — refuses to run
// if the secret is unset or the request doesn't present it. All recipient
// filtering / preference gating happens inside notifyUsers (plan_reminder is ON
// by default; event_soon is OFF by default → opt-in only).

function jstToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let plansNotified = 0;
  let eventsNotified = 0;

  // 1) Plan reminders — plans whose date is today (JST). Owner gets it.
  try {
    const admin = createAdminClient();
    const today = jstToday();
    const { data } = await admin
      .from('place_plans')
      .select('id, user_id, title, plan_date')
      .eq('plan_date', today)
      .limit(1000);
    for (const p of (data ?? []) as { id: string; user_id: string; title: string }[]) {
      await notifyUsers({
        recipientIds: [p.user_id],
        type: 'plan_reminder',
        targetUrl: `/plans/${p.id}`,
        push: { title: p.title || 'Trip plan', tag: `plan_reminder:${p.id}` },
      });
      plansNotified++;
    }
  } catch { /* best-effort */ }

  // 2) Event-soon — published, non-cancelled events starting within 3h. Notify
  //    users who saved the linked place (targeted, not a broadcast). Opt-in only.
  try {
    const admin = createAdminClient();
    const events = (await getPublishedEvents()).filter((e) => e.placeSlug && startsSoon(e, 180));
    for (const ev of events) {
      const { data } = await admin.from('place_saves').select('user_id').eq('place_slug', ev.placeSlug as string).limit(2000);
      const recipientIds = (data ?? []).map((r: { user_id: string }) => r.user_id);
      if (!recipientIds.length) continue;
      await notifyUsers({
        recipientIds,
        type: 'event_soon',
        targetUrl: ev.placeSlug ? `/places/${ev.placeSlug}` : '/events',
        push: { title: ev.title, tag: `event_soon:${ev.id}` },
      });
      eventsNotified++;
    }
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, plansNotified, eventsNotified });
}
