import type { SupabaseClient } from '@supabase/supabase-js'
import { getContentIdsForTag } from './tags'

// Resolve the approved, publicly-visible content carrying a tag, grouped by
// content type. Places are returned by slug (the Place type is keyed by slug);
// posts & listings by id. Each list is newest-first.
export interface TagContentIds {
  place: string[] // slugs
  post: string[] // ids
  listing: string[] // ids
}

export async function getApprovedTagContent(
  client: SupabaseClient,
  tagId: string,
): Promise<TagContentIds> {
  const [placeIds, postIds, listingIds] = await Promise.all([
    getContentIdsForTag(client, tagId, 'place'),
    getContentIdsForTag(client, tagId, 'post'),
    getContentIdsForTag(client, tagId, 'listing'),
  ])

  const [place, post, listing] = await Promise.all([
    approvedPlaceSlugs(client, placeIds),
    approvedIds(client, 'posts', postIds),
    approvedIds(client, 'marketplace_listings', listingIds),
  ])

  return { place, post, listing }
}

async function approvedPlaceSlugs(client: SupabaseClient, ids: string[]): Promise<string[]> {
  if (!ids.length) return []
  const { data } = await client
    .from('places')
    .select('slug')
    .in('id', ids)
    .eq('status', 'approved')
    .order('updated_at', { ascending: false })
  return (data ?? []).map((r) => (r as { slug: string }).slug)
}

async function approvedIds(client: SupabaseClient, table: string, ids: string[]): Promise<string[]> {
  if (!ids.length) return []
  const { data } = await client
    .from(table)
    .select('id')
    .in('id', ids)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
  return (data ?? []).map((r) => (r as { id: string }).id)
}
