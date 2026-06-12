// Server-only data helpers for the marketplace. Importing this module pulls in
// the Supabase server client (next/headers) — never import it from a client
// component. Pure types/constants live in `@/lib/marketplace`.

import { type Listing, type ListingComment, type ListingFilters, isUuid } from '@/lib/marketplace'

export async function getListings(filters: ListingFilters = {}): Promise<Listing[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return []
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = createClient()
    let query = supabase
      .from('marketplace_listings')
      .select('*')
      .eq('status', 'approved')

    if (filters.category && filters.category !== 'all') query = query.eq('category', filters.category)
    if (filters.type) query = query.eq('listing_type', filters.type)
    if (filters.condition) query = query.eq('condition', filters.condition)
    if (filters.q && filters.q.trim()) {
      const q = filters.q.trim().replace(/[%,]/g, ' ')
      query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%,area.ilike.%${q}%`)
    }

    switch (filters.sort) {
      case 'price_asc':  query = query.order('price', { ascending: true, nullsFirst: true }); break
      case 'price_desc': query = query.order('price', { ascending: false, nullsFirst: false }); break
      default:           query = query.order('created_at', { ascending: false })
    }

    const { data, error } = await query.limit(60)
    if (error || !data) return []
    return data as Listing[]
  } catch {
    return []
  }
}

export async function getListingById(id: string): Promise<Listing | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !isUuid(id)) return null
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('marketplace_listings')
      .select('*')
      .eq('id', id)
      .single()
    if (error || !data) return null
    return data as Listing
  } catch {
    return null
  }
}

export async function getMyListings(userId: string): Promise<Listing[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return []
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('marketplace_listings')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(60)
    if (error || !data) return []
    return data as Listing[]
  } catch {
    return []
  }
}

export async function getListingComments(listingId: string): Promise<ListingComment[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !isUuid(listingId)) return []
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('marketplace_comments_with_author')
      .select('id, listing_id, user_id, content, created_at, author_name, author_avatar')
      .eq('listing_id', listingId)
      .eq('status', 'approved')
      .order('created_at', { ascending: true })
    if (error || !data) return []
    return data as ListingComment[]
  } catch {
    return []
  }
}

export async function getRelatedListings(category: string, excludeId: string): Promise<Listing[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return []
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = createClient()
    const { data } = await supabase
      .from('marketplace_listings')
      .select('*')
      .eq('status', 'approved')
      .eq('category', category)
      .neq('id', excludeId)
      .order('created_at', { ascending: false })
      .limit(4)
    return (data ?? []) as Listing[]
  } catch {
    return []
  }
}
