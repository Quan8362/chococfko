import 'server-only'

import { createPublicClient } from '@/lib/supabase/public'
import {
  toPublicEventRuleSummary,
  type PublicEventRuleSummary,
  type RawPublicRuleSummaryRow,
} from '@/lib/tournaments/rules'

// Public (Guest) read of one event's rule scoring SUMMARY. Uses the ANON, cookie-free public client
// and the SECURITY DEFINER RPC tournament_public_event_rule_summary(uuid), which returns ONLY the
// safe projection (group/knockout scoring, tie-break labels, handicap on/off, preset label) and only
// for events whose tournament is published/completed. The snapshot base table is never read here, so
// no admin/internal rule metadata can reach the browser. On any failure we return null (empty state).
//
// SECURITY: never use the service-role client in this path; never pass along a raw Postgres error.

export async function getPublicEventRuleSummary(eventId: string): Promise<PublicEventRuleSummary | null> {
  if (!eventId) return null
  try {
    const supabase = createPublicClient()
    const { data, error } = await supabase.rpc('tournament_public_event_rule_summary', { p_event_id: eventId })
    if (error || !data) return null
    // RETURNS TABLE(...) → an array; take the first (there is at most one snapshot per event).
    const row = Array.isArray(data) ? (data[0] as RawPublicRuleSummaryRow | undefined) : (data as RawPublicRuleSummaryRow)
    return toPublicEventRuleSummary(row ?? null)
  } catch {
    return null
  }
}

export type { PublicEventRuleSummary }
