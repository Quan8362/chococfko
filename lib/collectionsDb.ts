import 'server-only';
import { unstable_cache, revalidateTag } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';
import { DEFAULT_COLLECTIONS, buildCollectionsFromRows, type Collection, type CollectionRow } from './collections';

// Loader for curated collections: admin rows (place_collections) merged over the
// built-in defaults. Cache-safe public client + unstable_cache (public data).
// Falls back to DEFAULT_COLLECTIONS when the table is absent/empty/errors.

const loadCached = unstable_cache(
  async (): Promise<Collection[]> => {
    try {
      const sb = createPublicClient();
      const { data, error } = await sb
        .from('place_collections')
        .select('slug, title, description, emoji, filters, sort_order, is_published')
        .eq('is_published', true)
        .order('sort_order', { ascending: true });
      if (error || !data?.length) return DEFAULT_COLLECTIONS;
      return buildCollectionsFromRows(data as CollectionRow[]);
    } catch {
      return DEFAULT_COLLECTIONS;
    }
  },
  ['place-collections-v1'],
  { tags: ['place-collections'], revalidate: 300 },
);

export async function loadCollections(): Promise<Collection[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return DEFAULT_COLLECTIONS;
  return loadCached();
}

export function revalidateCollections(): void {
  revalidateTag('place-collections');
}
