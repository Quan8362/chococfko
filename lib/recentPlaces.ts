// Pure helpers for privacy-conscious "recently viewed" history (client-only,
// localStorage). Capped, de-duplicated, most-recent-first. No server sync.

export interface RecentItem { slug: string; ts: number }

export const RECENT_CAP = 24;

/** Add/refresh a slug at the front; dedup by slug; cap the list length. */
export function addRecent(list: RecentItem[], slug: string, ts: number, cap: number = RECENT_CAP): RecentItem[] {
  const s = (slug ?? '').trim();
  if (!s) return list;
  const without = list.filter((it) => it.slug !== s);
  return [{ slug: s, ts }, ...without].slice(0, cap);
}

export function parseRecent(json: string | null | undefined): RecentItem[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    return v
      .filter((x): x is RecentItem => !!x && typeof x.slug === 'string' && typeof x.ts === 'number')
      .map((x) => ({ slug: x.slug, ts: x.ts }));
  } catch {
    return [];
  }
}

/** Ordered slugs (most recent first). */
export function recentSlugs(list: RecentItem[]): string[] {
  return [...list].sort((a, b) => b.ts - a.ts).map((it) => it.slug);
}
