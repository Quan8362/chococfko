'use client'

// Privacy-safe Explore search analytics. Discrete UX events go through the
// existing trackEvent (analytics_events); committed searches are also logged to
// search_queries for Admin insight (zero-result / unmatched / low-CTR).
//
// PRIVACY: we never store exact GPS coordinates. "nearby" is recorded only as a
// boolean flag in the filters payload; intent likewise carries no coordinates.
import { createClient } from '@/lib/supabase/client';
import { trackEvent } from '@/lib/analytics';

export const SEARCH_EVENTS = {
  submitted: 'search_submitted',
  suggestionSelected: 'search_suggestion_selected',
  filterAdded: 'search_filter_added',
  filterRemoved: 'search_filter_removed',
  sortChanged: 'search_sort_changed',
  results: 'search_results',
  zeroResults: 'search_zero_results',
  resultOpened: 'search_result_opened',
  directionsClicked: 'search_directions_clicked',
  reservationClicked: 'search_reservation_clicked',
  abandoned: 'search_abandoned',
} as const;

export function trackSearchEvent(event: string, metadata?: Record<string, unknown>): void {
  void trackEvent(event, { path: '/places', metadata });
}

export interface SearchLog {
  rawQuery: string;
  normalizedQuery: string;
  locale?: string | null;
  resultCount: number;
  /** Active filters — must NOT contain coordinates (nearby is a boolean flag). */
  filters?: Record<string, unknown> | null;
  /** Extracted intent — must NOT contain coordinates. */
  intent?: Record<string, unknown> | null;
}

/** Insert one committed-search row. Returns its id (for click-through) or null. Never throws. */
export async function logSearchQuery(log: SearchLog): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('search_queries')
      .insert({
        raw_query: log.rawQuery.slice(0, 300),
        normalized_query: log.normalizedQuery.slice(0, 300),
        locale: log.locale ?? null,
        result_count: log.resultCount,
        has_results: log.resultCount > 0,
        filters: log.filters ?? null,
        intent: log.intent ?? null,
      })
      .select('id')
      .single();
    if (error || !data) return null;
    return (data as { id: string }).id;
  } catch {
    return null;
  }
}

/** Mark a logged search as having produced a click (aggregate CTR). Never throws. */
export async function markSearchClicked(id: string): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.from('search_queries').update({ clicked: true }).eq('id', id);
  } catch {
    /* analytics must never break the app */
  }
}
