import 'server-only';
import { auditPlaces, type FindingMap } from '@/lib/dataQuality';
import { getAllPlacesFromDb } from '@/lib/places';

// Admin Explore-insights aggregator. Service-role reads (admin-only page). Every
// section is best-effort and returns null when its table is absent/unapplied —
// the dashboard then shows "no data" instead of a fabricated number.

async function countOf(table: string, build?: (q: any) => any): Promise<number | null> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    let q = createAdminClient().from(table).select('*', { count: 'exact', head: true });
    if (build) q = build(q);
    const { count, error } = await q;
    return error ? null : (count ?? 0);
  } catch {
    return null;
  }
}

export interface SearchInsights {
  total: number;
  withResults: number;
  clicked: number;
  topQueries: { q: string; n: number }[];
  unmatched: { q: string; n: number }[];
  removedFilters: { name: string; n: number }[];
}

async function searchInsights(): Promise<SearchInsights | null> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();
    const head = (b?: (q: any) => any) => {
      let q = admin.from('search_queries').select('*', { count: 'exact', head: true });
      if (b) q = b(q);
      return q;
    };
    const [{ count: total, error }, { count: withResults }, { count: clicked }, recent] = await Promise.all([
      head(),
      head((q) => q.eq('has_results', true)),
      head((q) => q.eq('clicked', true)),
      admin.from('search_queries').select('normalized_query, has_results, filters').order('created_at', { ascending: false }).limit(1000),
    ]);
    if (error) return null;

    const tally = new Map<string, number>();
    const zeroTally = new Map<string, number>();
    const filterRemovals = new Map<string, number>();
    for (const r of (recent.data ?? []) as { normalized_query: string | null; has_results: boolean; filters: Record<string, unknown> | null }[]) {
      const q = (r.normalized_query ?? '').trim();
      if (q) {
        tally.set(q, (tally.get(q) ?? 0) + 1);
        if (!r.has_results) zeroTally.set(q, (zeroTally.get(q) ?? 0) + 1);
      }
    }
    const top = (m: Map<string, number>) => Array.from(m.entries()).map(([q, n]) => ({ q, n })).sort((a, b) => b.n - a.n).slice(0, 10);
    return {
      total: total ?? 0,
      withResults: withResults ?? 0,
      clicked: clicked ?? 0,
      topQueries: top(tally),
      unmatched: top(zeroTally),
      removedFilters: Array.from(filterRemovals.entries()).map(([name, n]) => ({ name, n })),
    };
  } catch {
    return null;
  }
}

const ENGAGEMENT_EVENTS = ['place_save', 'place_unsave', 'place_share', 'place_directions', 'place_call', 'place_website', 'place_reserve_click', 'place_ask'];

async function engagement(): Promise<Record<string, number> | null> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();
    const probe = await admin.from('analytics_events').select('*', { count: 'exact', head: true });
    if (probe.error) return null;
    const out: Record<string, number> = {};
    await Promise.all(ENGAGEMENT_EVENTS.map(async (name) => {
      const { count } = await admin.from('analytics_events').select('*', { count: 'exact', head: true }).eq('event_name', name);
      out[name] = count ?? 0;
    }));
    return out;
  } catch {
    return null;
  }
}

export interface PlanningInsights { lists: number; plans: number; sharedPlans: number; stops: number; }
async function planning(): Promise<PlanningInsights | null> {
  const lists = await countOf('place_lists');
  if (lists == null) return null;
  const [plans, sharedPlans, stops] = await Promise.all([
    countOf('place_plans'),
    countOf('place_plans', (q) => q.eq('is_shareable', true)),
    countOf('place_plan_stops'),
  ]);
  return { lists, plans: plans ?? 0, sharedPlans: sharedPlans ?? 0, stops: stops ?? 0 };
}

export interface CommunityInsights { questions: number; answers: number; comments: number; reportsPending: number; reportsResolved: number; }
async function community(): Promise<CommunityInsights | null> {
  const questions = await countOf('place_comments', (q) => q.eq('kind', 'question'));
  if (questions == null) return null;
  const [answers, comments, reportsPending, reportsResolved] = await Promise.all([
    countOf('place_comments', (q) => q.eq('kind', 'answer')),
    countOf('place_comments', (q) => q.eq('kind', 'comment')),
    countOf('place_reports', (q) => q.eq('status', 'pending')),
    countOf('place_reports', (q) => q.eq('status', 'resolved')),
  ]);
  return { questions, answers: answers ?? 0, comments: comments ?? 0, reportsPending: reportsPending ?? 0, reportsResolved: reportsResolved ?? 0 };
}

export interface ExploreInsights {
  search: SearchInsights | null;
  engagement: Record<string, number> | null;
  planning: PlanningInsights | null;
  community: CommunityInsights | null;
  locationQuality: FindingMap;
  totalPlaces: number;
  savesTop: { slug: string; n: number }[] | null;
}

async function topSavedPlaces(): Promise<{ slug: string; n: number }[] | null> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const { data, error } = await createAdminClient().from('place_saves').select('place_slug').limit(5000);
    if (error) return null;
    const m = new Map<string, number>();
    for (const r of (data ?? []) as { place_slug: string }[]) m.set(r.place_slug, (m.get(r.place_slug) ?? 0) + 1);
    return Array.from(m.entries()).map(([slug, n]) => ({ slug, n })).sort((a, b) => b.n - a.n).slice(0, 10);
  } catch {
    return null;
  }
}

export async function getExploreInsights(): Promise<ExploreInsights> {
  const [search, eng, plan, comm, places, savesTop] = await Promise.all([
    searchInsights(),
    engagement(),
    planning(),
    community(),
    getAllPlacesFromDb(),
    topSavedPlaces(),
  ]);
  return {
    search,
    engagement: eng,
    planning: plan,
    community: comm,
    locationQuality: places ? auditPlaces(places) : {},
    totalPlaces: places?.length ?? 0,
    savesTop,
  };
}
