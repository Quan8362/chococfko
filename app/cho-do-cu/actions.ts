'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createAdminNotification } from '@/lib/admin/notifications'
import { CATEGORIES, CONDITION_PRESETS, isUuid } from '@/lib/marketplace'

export type ListingResult = { ok?: true; id?: string; error?: string } | null

const VALID_PERCENTS = new Set<number>([100, ...CONDITION_PRESETS.map(p => p.percent)])

function parseListingForm(formData: FormData) {
  const title = (formData.get('title') as string ?? '').trim()
  const description = (formData.get('description') as string ?? '').trim()
  const listing_type = formData.get('listing_type') === 'free' ? 'free' : 'sell'
  const priceRaw = (formData.get('price') as string ?? '').replace(/[^\d]/g, '')
  const price = priceRaw ? parseInt(priceRaw, 10) : null
  const is_negotiable = formData.get('is_negotiable') === 'true'
  const condition = formData.get('condition') === 'new' ? 'new' : 'used'
  const percentRaw = parseInt((formData.get('condition_percent') as string ?? ''), 10)
  const condition_percent = condition === 'new' ? 100 : (Number.isFinite(percentRaw) ? percentRaw : null)
  const categoryRaw = (formData.get('category') as string ?? 'other')
  const category = (CATEGORIES as readonly string[]).includes(categoryRaw) ? categoryRaw : 'other'
  const area = ((formData.get('area') as string ?? '').trim().slice(0, 60)) || null

  let images: string[] = []
  try {
    const parsed = JSON.parse((formData.get('images') as string) ?? '[]')
    if (Array.isArray(parsed)) images = parsed.filter(x => typeof x === 'string').slice(0, 6)
  } catch { /* ignore */ }

  return { title, description, listing_type, price, is_negotiable, condition, condition_percent, category, area, images }
}

function validateListing(d: ReturnType<typeof parseListingForm>): string | null {
  if (!d.title || d.title.length < 4) return 'title_too_short'
  if (d.title.length > 120) return 'title_too_long'
  if (d.description.length > 4000) return 'desc_too_long'
  if (d.images.length === 0) return 'image_required'
  if (d.listing_type === 'sell') {
    if (!d.price || d.price <= 0) return 'price_required'
    if (d.price > 100_000_000) return 'price_too_high'
  }
  if (d.condition === 'used' && (d.condition_percent == null || !VALID_PERCENTS.has(d.condition_percent)))
    return 'condition_invalid'
  return null
}

export async function submitListing(prevState: ListingResult, formData: FormData): Promise<ListingResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'login_required' }

  const d = parseListingForm(formData)
  const err = validateListing(d)
  if (err) return { error: err }

  const { data: inserted, error } = await supabase
    .from('marketplace_listings')
    .insert({
      user_id: user.id,
      title: d.title,
      description: d.description || null,
      listing_type: d.listing_type,
      price: d.listing_type === 'sell' ? d.price : null,
      is_negotiable: d.listing_type === 'sell' ? d.is_negotiable : false,
      condition: d.condition,
      condition_percent: d.condition_percent,
      category: d.category,
      area: d.area,
      images: d.images,
      cover_image: d.images[0] ?? null,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error || !inserted) return { error: error?.message ?? 'db_error' }

  const displayName = (user.user_metadata?.display_name as string | undefined)
    || user.email?.split('@')[0]
    || 'Thành viên'

  await createAdminNotification({
    type: 'new_pending_listing',
    title: 'Tin chợ đồ cũ mới cần duyệt',
    message: `${displayName}: ${d.title}`,
    target_type: 'listing',
    target_id: inserted.id as string,
    target_url: '/admin/cho-do-cu?tab=pending',
    actor_id: user.id,
  })

  revalidatePath('/cho-do-cu')
  return { ok: true, id: inserted.id as string }
}

export async function updateListing(prevState: ListingResult, formData: FormData): Promise<ListingResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'login_required' }

  const id = formData.get('id') as string
  if (!id || !isUuid(id)) return { error: 'invalid' }

  const d = parseListingForm(formData)
  const err = validateListing(d)
  if (err) return { error: err }

  // Editing returns the listing to pending re-moderation
  const { error } = await supabase
    .from('marketplace_listings')
    .update({
      title: d.title,
      description: d.description || null,
      listing_type: d.listing_type,
      price: d.listing_type === 'sell' ? d.price : null,
      is_negotiable: d.listing_type === 'sell' ? d.is_negotiable : false,
      condition: d.condition,
      condition_percent: d.condition_percent,
      category: d.category,
      area: d.area,
      images: d.images,
      cover_image: d.images[0] ?? null,
      status: 'pending',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/cho-do-cu')
  revalidatePath(`/cho-do-cu/${id}`)
  return { ok: true, id }
}

export async function setSaleStatus(formData: FormData): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const id = formData.get('id') as string
  const status = formData.get('sale_status') as string
  if (!id || !isUuid(id) || !['available', 'reserved', 'sold'].includes(status)) return

  await supabase
    .from('marketplace_listings')
    .update({
      sale_status: status,
      sold_at: status === 'sold' ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .eq('user_id', user.id)

  revalidatePath('/cho-do-cu')
  revalidatePath(`/cho-do-cu/${id}`)
  revalidatePath('/cho-do-cu/cua-toi')
}

export async function deleteListing(formData: FormData): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const id = formData.get('id') as string
  if (!id || !isUuid(id)) return

  await supabase.from('marketplace_listings').delete().eq('id', id).eq('user_id', user.id)
  revalidatePath('/cho-do-cu')
  revalidatePath('/cho-do-cu/cua-toi')
}

export type CommentResult = { ok?: true; error?: string } | null

export async function submitListingComment(prevState: CommentResult, formData: FormData): Promise<CommentResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'login_required' }

  const listingId = formData.get('listing_id') as string
  const content = (formData.get('content') as string ?? '').trim()
  if (!listingId || !isUuid(listingId)) return { error: 'invalid' }
  if (!content) return { error: 'empty' }
  if (content.length > 1000) return { error: 'too_long' }

  const { error } = await supabase
    .from('marketplace_comments')
    .insert({ listing_id: listingId, user_id: user.id, content })

  if (error) return { error: error.message }
  revalidatePath(`/cho-do-cu/${listingId}`)
  return { ok: true }
}

export async function deleteListingComment(formData: FormData): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const commentId = formData.get('comment_id') as string
  const listingId = formData.get('listing_id') as string
  if (!commentId || !isUuid(commentId)) return

  await supabase.from('marketplace_comments').delete().eq('id', commentId).eq('user_id', user.id)
  if (listingId) revalidatePath(`/cho-do-cu/${listingId}`)
}

export async function reportListing(formData: FormData): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const listingId = formData.get('listing_id') as string
  const reason = (formData.get('reason') as string ?? '').trim() || null
  if (!listingId || !isUuid(listingId)) return

  await supabase
    .from('marketplace_reports')
    .insert({ listing_id: listingId, reporter_id: user.id, reason })
  // 23505 (already reported) silently ignored
}

export async function incrementListingView(id: string): Promise<void> {
  if (!isUuid(id)) return
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('marketplace_listings')
      .select('view_count')
      .eq('id', id)
      .single()
    const current = (data as { view_count: number } | null)?.view_count ?? 0
    await admin.from('marketplace_listings').update({ view_count: current + 1 }).eq('id', id)
  } catch { /* non-critical */ }
}
