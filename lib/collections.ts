// Curated "useful collections" for Explore. Two safe sources only:
//   1. Built-in defaults below — each is a RELIABLE STRUCTURED FILTER over the
//      same search engine (no editorial claim that the data can't back up).
//   2. Admin-curated rows in `place_collections` (merged over defaults by slug).
// A collection is only shown when it actually yields results (caller checks
// count) — so we never make a promise the catalog can't keep.
//
// Pure module (no DOM/Next/Supabase). The DB loader lives in lib/collectionsDb.ts.

import type { ExploreFilters } from './exploreParams';

export interface Collection {
  slug: string;
  emoji: string;
  /** i18n key under the `collections` namespace (built-in collections). */
  titleKey?: string;
  descKey?: string;
  /** Literal admin-entered text (DB collections); takes precedence over keys. */
  title?: string | null;
  description?: string | null;
  filters: ExploreFilters;
  sortOrder: number;
  source: 'default' | 'db';
}

// Built-in collections — all expressed as structured filters (reliable).
export const DEFAULT_COLLECTIONS: Collection[] = [
  { slug: 'rainy-day',      emoji: '🌧️', titleKey: 'rainy_day_title',      descKey: 'rainy_day_desc',      filters: { rainy: true, indoor: true },                 sortOrder: 10, source: 'default' },
  { slug: 'free-attractions', emoji: '🎟️', titleKey: 'free_title',         descKey: 'free_desc',           filters: { fee: 'free' },                                sortOrder: 20, source: 'default' },
  { slug: 'cheap-eats',     emoji: '🍜', titleKey: 'cheap_eats_title',     descKey: 'cheap_eats_desc',     filters: { category: 'food', priceMax: 3000 },           sortOrder: 30, source: 'default' },
  { slug: 'family-weekend', emoji: '👨‍👩‍👧', titleKey: 'family_title',     descKey: 'family_desc',         filters: { children: true },                             sortOrder: 40, source: 'default' },
  { slug: 'camping-bbq',    emoji: '⛺', titleKey: 'camping_bbq_title',    descKey: 'camping_bbq_desc',    filters: { category: 'camp', bbq: true },                sortOrder: 50, source: 'default' },
  { slug: 'onsen',          emoji: '♨️', titleKey: 'onsen_title',          descKey: 'onsen_desc',          filters: { category: 'onsen' },                          sortOrder: 60, source: 'default' },
];

export type CollectionRow = {
  slug: string;
  title?: string | null;
  description?: string | null;
  emoji?: string | null;
  filters?: ExploreFilters | null;
  sort_order?: number | null;
  is_published?: boolean | null;
};

/**
 * Merge admin rows over the built-in defaults. A DB row sharing a default's slug
 * overrides its filters/title/emoji; new slugs are appended. Unpublished rows are
 * dropped. Result is sorted by sortOrder then slug for stable output.
 */
export function buildCollectionsFromRows(
  rows: CollectionRow[],
  base: Collection[] = DEFAULT_COLLECTIONS,
): Collection[] {
  const bySlug = new Map<string, Collection>();
  for (const c of base) bySlug.set(c.slug, { ...c });
  for (const r of rows) {
    if (!r.slug || r.is_published === false) {
      if (r.slug && r.is_published === false) bySlug.delete(r.slug); // admin can hide a default
      continue;
    }
    const existing = bySlug.get(r.slug);
    bySlug.set(r.slug, {
      slug: r.slug,
      emoji: r.emoji ?? existing?.emoji ?? '📍',
      title: r.title ?? existing?.title ?? null,
      description: r.description ?? existing?.description ?? null,
      titleKey: r.title ? undefined : existing?.titleKey,
      descKey: r.description ? undefined : existing?.descKey,
      filters: r.filters ?? existing?.filters ?? {},
      sortOrder: r.sort_order ?? existing?.sortOrder ?? 100,
      source: 'db',
    });
  }
  return Array.from(bySlug.values()).sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug));
}

export function findCollection(slug: string, list: Collection[] = DEFAULT_COLLECTIONS): Collection | undefined {
  return list.find((c) => c.slug === slug);
}
