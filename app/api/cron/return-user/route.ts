import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyUsers } from '@/lib/notifications/user';
import { getPublishedEvents } from '@/lib/eventsDb';
import { startsSoon } from '@/lib/events';
import { jstDate, planWindowKey, eventWindowKey, isAuthorizedCron } from '@/lib/cronReminders';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Time-based return-user notifications, intended for Vercel Cron (see vercel.json).
// Protected by CRON_SECRET (constant-time compare; refuses to run if unset/incorrect).
// Idempotent: every send is gated by `try_mark_notification_delivery` so the same
// (user, type, entity, JST-day) window can never be delivered twice across ticks /
// retries / instances. Recipient preference gating lives inside notifyUsers
// (plan_reminder ON by default; event_soon OFF → opt-in only).

const MAX_PLANS = 1000;
const MAX_EVENTS = 500;
const MAX_RECIPIENTS_PER_EVENT = 2000;

type DeliveryGate = (userId: string, type: string, entityKey: string, windowKey: string) => Promise<boolean>;

export async function GET(req: Request) {
  if (!isAuthorizedCron(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const admin = createAdminClient();
  const today = jstDate();

  // First-claim gate: TRUE only the first time this (user,type,entity,window) is seen.
  const claim: DeliveryGate = async (userId, type, entityKey, windowKey) => {
    try {
      const { data, error } = await admin.rpc('try_mark_notification_delivery', {
        p_user_id: userId,
        p_type: type,
        p_entity_key: entityKey,
        p_window_key: windowKey,
      });
      if (error) {
        // Fail CLOSED on dedup errors → never risk duplicate spam.
        console.error('[cron/return-user] dedup rpc error:', error.message);
        return false;
      }
      return data === true;
    } catch (err) {
      console.error('[cron/return-user] dedup unexpected error:', err);
      return false;
    }
  };

  const summary = { plansNotified: 0, plansSkippedDup: 0, eventsNotified: 0, eventRecipients: 0, errors: 0 };

  // 1) Plan reminders — plans whose date is today (JST). Owner gets it, once/day.
  try {
    const planWk = planWindowKey();
    const { data } = await admin
      .from('place_plans')
      .select('id, user_id, title, plan_date')
      .eq('plan_date', today)
      .limit(MAX_PLANS);
    for (const p of (data ?? []) as { id: string; user_id: string; title: string }[]) {
      try {
        if (!(await claim(p.user_id, 'plan_reminder', p.id, planWk))) { summary.plansSkippedDup++; continue; }
        await notifyUsers({
          recipientIds: [p.user_id],
          type: 'plan_reminder',
          targetUrl: `/plans/${p.id}`,
          push: { title: p.title || 'Trip plan', tag: `plan_reminder:${p.id}` },
        });
        summary.plansNotified++;
      } catch (err) {
        // Per-recipient isolation: one failure never aborts the whole job.
        summary.errors++;
        console.error('[cron/return-user] plan notify error:', err);
      }
    }
  } catch (err) {
    summary.errors++;
    console.error('[cron/return-user] plan query error:', err);
  }

  // 2) Event-soon — published, non-cancelled events starting within 3h. Notify
  //    users who saved the linked place (targeted). Opt-in (default OFF), once/day.
  try {
    const eventWk = eventWindowKey();
    const events = (await getPublishedEvents())
      .filter((e) => e.placeSlug && startsSoon(e, 180))
      .slice(0, MAX_EVENTS);
    for (const ev of events) {
      try {
        const { data } = await admin
          .from('place_saves')
          .select('user_id')
          .eq('place_slug', ev.placeSlug as string)
          .limit(MAX_RECIPIENTS_PER_EVENT);
        const savers = (data ?? []).map((r: { user_id: string }) => r.user_id);
        // Per-recipient dedup so re-runs within the window don't re-notify.
        const fresh: string[] = [];
        for (const uid of savers) {
          if (await claim(uid, 'event_soon', ev.id, eventWk)) fresh.push(uid);
        }
        if (!fresh.length) continue;
        await notifyUsers({
          recipientIds: fresh,
          type: 'event_soon',
          targetUrl: ev.placeSlug ? `/places/${ev.placeSlug}` : '/events',
          push: { title: ev.title, tag: `event_soon:${ev.id}` },
        });
        summary.eventsNotified++;
        summary.eventRecipients += fresh.length;
      } catch (err) {
        summary.errors++;
        console.error('[cron/return-user] event notify error:', err);
      }
    }
  } catch (err) {
    summary.errors++;
    console.error('[cron/return-user] event query error:', err);
  }

  const durationMs = Date.now() - startedAt;
  console.log('[cron/return-user] summary', { date: today, durationMs, ...summary });
  return NextResponse.json({ ok: true, date: today, durationMs, ...summary });
}
