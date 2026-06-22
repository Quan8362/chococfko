// Notification type catalog + preference gating. The pure parts (catalog,
// effectiveEnabled) are unit-testable; the DB helpers lazy-import the admin
// client so importing the pure parts never pulls in server-only deps.

export const NOTIFICATION_TYPES = [
  // Existing community/marketplace types (default ON — direct & low volume).
  'dm', 'mention', 'new_listing', 'new_comment', 'new_reply',
  'auction_outbid', 'auction_won',
  'place_answer', 'place_answer_helpful', 'place_report_reviewed',
  // Phase 7 return-user types.
  'place_closed',        // a saved place was confirmed temporarily closed
  'place_updated',       // saved place info updated / re-verified
  'plan_reminder',       // your upcoming trip plan is soon
  'weekend_collection',  // a relevant weekend collection (broadcast-style)
  'event_soon',          // an event is starting soon
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// Return-user nudges that are broadcast-ish / time-based → OFF by default so we
// never spam. Users opt in via notification preferences. Direct, personal ones
// (answers, your saved place changed, your own plan reminder) stay ON.
export const DEFAULT_OFF: ReadonlySet<string> = new Set<string>([
  'weekend_collection',
  'event_soon',
]);

/** The types a user can toggle in the preferences UI (return-user + a few). */
export const CONFIGURABLE_TYPES: readonly string[] = [
  'place_answer', 'place_closed', 'place_updated',
  'plan_reminder', 'weekend_collection', 'event_soon',
];

export function defaultEnabled(type: string): boolean {
  return !DEFAULT_OFF.has(type);
}

/** Resolve a user's effective on/off for a type given their explicit override. */
export function effectiveEnabled(type: string, explicit: boolean | undefined): boolean {
  return explicit === undefined ? defaultEnabled(type) : explicit;
}

/**
 * Filter a recipient list to those who allow `type`. A user is included when
 * their explicit preference is true, or (no row) the type defaults ON. Fails
 * open on error (returns the input) so a prefs hiccup never drops direct,
 * already-default-on notifications — except for default-OFF types, where it
 * fails CLOSED (returns []) so we never accidentally broadcast a noisy type.
 */
export async function filterRecipientsByPref(recipientIds: string[], type: string): Promise<string[]> {
  if (recipientIds.length === 0) return [];
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('notification_preferences')
      .select('user_id, enabled')
      .eq('type', type)
      .in('user_id', recipientIds);
    if (error) return defaultEnabled(type) ? recipientIds : [];
    const explicit = new Map<string, boolean>();
    for (const row of (data ?? []) as { user_id: string; enabled: boolean }[]) explicit.set(row.user_id, row.enabled);
    return recipientIds.filter((id) => effectiveEnabled(type, explicit.get(id)));
  } catch {
    return defaultEnabled(type) ? recipientIds : [];
  }
}

/** Read a user's full preference map (explicit overrides only). */
export async function getUserPrefs(userId: string): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  if (!userId) return out;
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();
    const { data } = await admin.from('notification_preferences').select('type, enabled').eq('user_id', userId);
    for (const row of (data ?? []) as { type: string; enabled: boolean }[]) out[row.type] = row.enabled;
    return out;
  } catch {
    return out;
  }
}
