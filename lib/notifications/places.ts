import 'server-only';
import { notifyUsers } from '@/lib/notifications/user';

// Fire a return-user notification to everyone who SAVED a place when its info
// materially changes (temporarily closed / updated). Best-effort: never throws,
// never blocks the admin action. notifyUsers handles preference gating + actor
// exclusion + Web Push. Visit/save data stays private — we only use the saver
// list internally to address the notification.

type SavedChangeType = 'place_closed' | 'place_updated';

export async function notifySavedPlaceChange(
  placeSlug: string,
  type: SavedChangeType,
  opts: { actorId?: string | null; placeName?: string | null; pushTitle?: string; pushBody?: string } = {},
): Promise<void> {
  if (!placeSlug || !process.env.NEXT_PUBLIC_SUPABASE_URL) return;
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();
    const { data } = await admin.from('place_saves').select('user_id').eq('place_slug', placeSlug).limit(2000);
    const recipientIds = (data ?? []).map((r: { user_id: string }) => r.user_id);
    if (recipientIds.length === 0) return;
    await notifyUsers({
      recipientIds,
      type,
      targetUrl: `/places/${placeSlug}`,
      actorId: opts.actorId ?? null,
      push: opts.pushTitle ? { title: opts.pushTitle, body: opts.pushBody, tag: `${type}:${placeSlug}` } : undefined,
    });
  } catch {
    /* best-effort */
  }
}
