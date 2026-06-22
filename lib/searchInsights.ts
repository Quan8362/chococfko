// Server-only aggregation over search_queries (Admin insights + popular terms).
// Reads via the service-role client (the table has no SELECT policy for anon).
// Aggregation is done in JS over a recent window (no GROUP BY round-trips).
import { createAdminClient } from '@/lib/supabase/admin';

interface Row {
  raw_query: string | null;
  normalized_query: string | null;
  has_results: boolean;
  clicked: boolean;
  result_count: number;
  created_at: string;
}

async function recentRows(limit = 2000): Promise<Row[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [];
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from('search_queries')
      .select('raw_query,normalized_query,has_results,clicked,result_count,created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data ?? []) as Row[];
  } catch {
    return [];
  }
}

export interface QueryStat {
  query: string;
  total: number;
  zero: number;
  clicks: number;
  ctr: number; // clicks / total
}

function aggregate(rows: Row[]): Map<string, QueryStat> {
  const map = new Map<string, QueryStat>();
  for (const r of rows) {
    const key = (r.normalized_query || r.raw_query || '').trim();
    if (!key) continue;
    const s = map.get(key) ?? { query: r.raw_query || key, total: 0, zero: 0, clicks: 0, ctr: 0 };
    s.total += 1;
    if (!r.has_results) s.zero += 1;
    if (r.clicked) s.clicks += 1;
    map.set(key, s);
  }
  map.forEach((s) => { s.ctr = s.total ? s.clicks / s.total : 0; });
  return map;
}

/** Real popular terms (only those that produced results). Empty if no data. */
export async function getPopularSearches(limit = 8): Promise<string[]> {
  const rows = (await recentRows(1000)).filter((r) => r.has_results);
  const stats = Array.from(aggregate(rows).values()).filter((s) => s.total >= 2);
  return stats.sort((a, b) => b.total - a.total).slice(0, limit).map((s) => s.query);
}

export interface SearchInsights {
  zeroResult: QueryStat[];
  unmatched: QueryStat[]; // always zero results (likely missing concept)
  lowCtr: QueryStat[];    // many results, few clicks
  totalSearches: number;
  zeroRate: number;
}

export async function getSearchInsights(): Promise<SearchInsights> {
  const rows = await recentRows(2000);
  const stats = Array.from(aggregate(rows).values());
  const totalSearches = rows.length;
  const zeroSearches = rows.filter((r) => !r.has_results).length;
  return {
    zeroResult: stats.filter((s) => s.zero > 0).sort((a, b) => b.zero - a.zero).slice(0, 50),
    unmatched: stats.filter((s) => s.zero === s.total && s.total >= 1).sort((a, b) => b.total - a.total).slice(0, 50),
    lowCtr: stats.filter((s) => s.total >= 3 && s.clicks === 0).sort((a, b) => b.total - a.total).slice(0, 50),
    totalSearches,
    zeroRate: totalSearches ? zeroSearches / totalSearches : 0,
  };
}
