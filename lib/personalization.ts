// Lightweight, EXPLAINABLE personalization. Pure (no DOM/Next/Supabase) so it is
// unit-testable and can run client-side over already-loaded public place data.
//
// Privacy & anti-bubble principles baked in here:
//   • Signals are coarse: which categories you saved, your selected region,
//     what you recently viewed. No profiling, no cross-user data.
//   • Every recommendation carries a machine-readable REASON ("why am I seeing
//     this?") the UI can render.
//   • Diversity is enforced: a single category can't dominate (maxPerCategory),
//     so users are never trapped in a narrow recommendation bubble.
//   • New users (no signal) get an empty result → caller shows generic featured
//     content as a sensible fallback.

export interface PlaceLite {
  slug: string;
  category: string;
  prefecture?: string | null;
}

export interface PersonalSignal {
  savedSlugs: string[];
  recentSlugs: string[];
  region?: string | null;
}

export interface RecoExplanation {
  key: 'because_saved_category' | 'popular_in_region' | 'recently_viewed_category' | 'discover';
  params?: Record<string, string | number>;
}

export interface Recommendation {
  slug: string;
  reason: RecoExplanation;
}

/** True when there's enough signal to personalize at all. */
export function hasSignal(s: PersonalSignal): boolean {
  return s.savedSlugs.length > 0 || s.recentSlugs.length > 0 || !!s.region;
}

/** Map slug → category count for a set of slugs (affinity weighting). */
export function categoryAffinity(slugs: string[], index: Map<string, PlaceLite>): Map<string, number> {
  const m = new Map<string, number>();
  for (const slug of slugs) {
    const p = index.get(slug);
    if (!p) continue;
    m.set(p.category, (m.get(p.category) ?? 0) + 1);
  }
  return m;
}

/** Saved categories, most-saved first (for "saved categories" display). */
export function savedCategories(savedSlugs: string[], index: Map<string, PlaceLite>): string[] {
  return Array.from(categoryAffinity(savedSlugs, index).entries())
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c);
}

export interface RecommendOpts {
  candidates: PlaceLite[];
  signal: PersonalSignal;
  limit?: number;
  /** Max recommendations from any single category (anti-bubble). Default 2. */
  maxPerCategory?: number;
}

/**
 * Produce explainable recommendations from coarse signals. Excludes places the
 * user already saved or recently viewed (no point re-recommending the known).
 * Returns [] when there is no signal (new user → caller falls back to featured).
 */
export function recommend(opts: RecommendOpts): Recommendation[] {
  const { candidates, signal } = opts;
  const limit = opts.limit ?? 8;
  const maxPerCategory = opts.maxPerCategory ?? 2;
  if (!hasSignal(signal)) return [];

  const index = new Map(candidates.map((p) => [p.slug, p]));
  const seen = new Set([...signal.savedSlugs, ...signal.recentSlugs]);
  const savedAffinity = categoryAffinity(signal.savedSlugs, index);
  const recentAffinity = categoryAffinity(signal.recentSlugs, index);

  type Scored = { p: PlaceLite; score: number; reason: RecoExplanation };
  const scored: Scored[] = [];
  for (const p of candidates) {
    if (seen.has(p.slug)) continue;
    let score = 0;
    let reason: RecoExplanation = { key: 'discover' };
    const savedW = savedAffinity.get(p.category) ?? 0;
    const recentW = recentAffinity.get(p.category) ?? 0;
    if (savedW > 0) { score += savedW * 3; reason = { key: 'because_saved_category', params: { category: p.category } }; }
    else if (recentW > 0) { score += recentW * 2; reason = { key: 'recently_viewed_category', params: { category: p.category } }; }
    if (signal.region && p.prefecture === signal.region) {
      score += 1;
      if (score === 1) reason = { key: 'popular_in_region', params: { region: signal.region } };
    }
    if (score > 0) scored.push({ p, score, reason });
  }

  scored.sort((a, b) => b.score - a.score || a.p.slug.localeCompare(b.p.slug));

  // Enforce category diversity: round-robin cap per category.
  const perCat = new Map<string, number>();
  const out: Recommendation[] = [];
  for (const s of scored) {
    const used = perCat.get(s.p.category) ?? 0;
    if (used >= maxPerCategory) continue;
    perCat.set(s.p.category, used + 1);
    out.push({ slug: s.p.slug, reason: s.reason });
    if (out.length >= limit) break;
  }
  return out;
}
