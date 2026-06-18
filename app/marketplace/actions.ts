'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createAdminNotification } from '@/lib/admin/notifications'
import { notifyUsers } from '@/lib/notifications/user'
import { stripHtml, sanitizeUserName } from '@/lib/sanitize'
import { sanitizeHtml } from '@/lib/sanitizeHtml'
import { setContentTags } from '@/lib/tags'
import { CATEGORIES, CONDITION_PRESETS, isUuid, nextMinBid, type Listing } from '@/lib/marketplace'

export type ListingResult = { ok?: true; id?: string; error?: string } | null

const VALID_PERCENTS = new Set<number>([100, ...CONDITION_PRESETS.map(p => p.percent)])

function intOrNull(v: FormDataEntryValue | null): number | null {
  const raw = ((v as string) ?? '').replace(/[^\d]/g, '')
  return raw ? parseInt(raw, 10) : null
}

function parseListingForm(formData: FormData) {
  const title = (formData.get('title') as string ?? '').trim()
  const description = (formData.get('description') as string ?? '').trim()
  const ltRaw = formData.get('listing_type')
  const listing_type = ltRaw === 'free' ? 'free' : ltRaw === 'auction' ? 'auction' : 'sell'
  const price = intOrNull(formData.get('price'))
  const is_negotiable = formData.get('is_negotiable') === 'true'
  const condition = formData.get('condition') === 'new' ? 'new' : 'used'
  const percentRaw = parseInt((formData.get('condition_percent') as string ?? ''), 10)
  const condition_percent = condition === 'new' ? 100 : (Number.isFinite(percentRaw) ? percentRaw : null)
  const categoryRaw = (formData.get('category') as string ?? 'other')
  const category = (CATEGORIES as readonly string[]).includes(categoryRaw) ? categoryRaw : 'other'
  const area = ((formData.get('area') as string ?? '').trim().slice(0, 60)) || null

  // Auction
  const start_price = intOrNull(formData.get('start_price'))
  const min_increment = intOrNull(formData.get('min_increment')) ?? 1000
  const buy_now_price = intOrNull(formData.get('buy_now_price'))
  const auction_ends_at = ((formData.get('auction_ends_at') as string ?? '').trim()) || null

  let images: string[] = []
  try {
    const parsed = JSON.parse((formData.get('images') as string) ?? '[]')
    if (Array.isArray(parsed)) images = parsed.filter(x => typeof x === 'string').slice(0, 6)
  } catch { /* ignore */ }

  return {
    title, description, listing_type, price, is_negotiable, condition, condition_percent,
    category, area, images, start_price, min_increment, buy_now_price, auction_ends_at,
  }
}

type ParsedListing = ReturnType<typeof parseListingForm>

function validateListing(d: ParsedListing): string | null {
  if (!d.title || d.title.length < 4) return 'title_too_short'
  if (d.title.length > 120) return 'title_too_long'
  if (d.description.length > 4000) return 'desc_too_long'
  if (d.images.length === 0) return 'image_required'
  if (d.listing_type === 'sell') {
    if (!d.price || d.price <= 0) return 'price_required'
    if (d.price > 100_000_000) return 'price_too_high'
  }
  if (d.listing_type === 'auction') {
    if (!d.start_price || d.start_price <= 0) return 'start_price_required'
    if (d.start_price > 100_000_000) return 'price_too_high'
    if (d.min_increment <= 0) return 'increment_required'
    if (d.buy_now_price != null && d.buy_now_price <= d.start_price) return 'buynow_invalid'
    if (!d.auction_ends_at || new Date(d.auction_ends_at).getTime() <= Date.now() + 60_000) return 'auction_end_invalid'
  }
  if (d.condition === 'used' && (d.condition_percent == null || !VALID_PERCENTS.has(d.condition_percent)))
    return 'condition_invalid'
  return null
}

// Common DB columns shared by submit + update.
function listingDbRow(d: ParsedListing) {
  const isAuction = d.listing_type === 'auction'
  return {
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
    start_price: isAuction ? d.start_price : null,
    min_increment: isAuction ? (d.min_increment || 1000) : 1000,
    buy_now_price: isAuction ? d.buy_now_price : null,
    auction_ends_at: isAuction ? d.auction_ends_at : null,
  }
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
    .insert({ user_id: user.id, ...listingDbRow(d), status: 'pending' })
    .select('id')
    .single()

  if (error || !inserted) return { error: error?.message ?? 'db_error' }

  await setContentTags(createAdminClient(), 'listing', inserted.id as string, formData.get('tags'))

  const displayName = (user.user_metadata?.display_name as string | undefined)
    || user.email?.split('@')[0]
    || 'Thành viên'

  await createAdminNotification({
    type: 'new_pending_listing',
    title: 'Tin chợ đồ cũ mới cần duyệt',
    message: `${displayName}: ${d.title}`,
    target_type: 'listing',
    target_id: inserted.id as string,
    target_url: '/admin/marketplace?tab=pending',
    actor_id: user.id,
  })

  revalidatePath('/marketplace')
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
    .update({ ...listingDbRow(d), status: 'pending', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  await setContentTags(createAdminClient(), 'listing', id, formData.get('tags'))

  revalidatePath('/marketplace')
  revalidatePath(`/marketplace/${id}`)
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

  revalidatePath('/marketplace')
  revalidatePath(`/marketplace/${id}`)
  revalidatePath('/marketplace/mine')
}

export async function deleteListing(formData: FormData): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const id = formData.get('id') as string
  if (!id || !isUuid(id)) return

  await supabase.from('marketplace_listings').delete().eq('id', id).eq('user_id', user.id)
  revalidatePath('/marketplace')
  revalidatePath('/marketplace/mine')
}

export type CommentResult = { ok?: true; error?: string } | null

export async function submitListingComment(prevState: CommentResult, formData: FormData): Promise<CommentResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'login_required' }

  const listingId = formData.get('listing_id') as string
  const raw = (formData.get('content') as string ?? '').trim()
  if (!listingId || !isUuid(listingId)) return { error: 'invalid' }

  const text = stripHtml(raw)
  const hasImage = /<img\b/i.test(raw)
  if (!text && !hasImage) return { error: 'empty' }
  if (text.length > 1000) return { error: 'too_long' }
  const content = sanitizeHtml(raw)

  const { error } = await supabase
    .from('marketplace_comments')
    .insert({ listing_id: listingId, user_id: user.id, content })

  if (error) return { error: error.message }
  revalidatePath(`/marketplace/${listingId}`)
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
  if (listingId) revalidatePath(`/marketplace/${listingId}`)
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

export async function submitSellerRating(
  listingId: string,
  stars: number,
  review: string,
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'login_required' }
  if (!isUuid(listingId)) return { error: 'invalid' }
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return { error: 'invalid' }

  const { data: listing } = await supabase
    .from('marketplace_listings')
    .select('user_id')
    .eq('id', listingId)
    .maybeSingle()
  const sellerId = (listing as { user_id: string } | null)?.user_id
  if (!sellerId) return { error: 'invalid' }
  if (sellerId === user.id) return { error: 'self' }

  const trimmed = (review ?? '').trim().slice(0, 500)
  const { error } = await supabase
    .from('marketplace_ratings')
    .upsert(
      { listing_id: listingId, seller_id: sellerId, rater_id: user.id, stars, review: trimmed || null },
      { onConflict: 'listing_id,rater_id' },
    )
  if (error) return { error: error.message }

  revalidatePath(`/marketplace/${listingId}`)
  revalidatePath(`/users/${sellerId}`)
  return { ok: true }
}

const ANTI_SNIPE_MS = 2 * 60 * 1000  // extend if a bid lands in the final 2 minutes

export type BidResult = { ok?: boolean; error?: string; current?: number; endsAt?: string }

export async function placeBid(listingId: string, amount: number): Promise<BidResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'login_required' }
  if (!isUuid(listingId) || !Number.isInteger(amount) || amount <= 0) return { error: 'invalid' }

  const { data } = await supabase.from('marketplace_listings').select('*').eq('id', listingId).maybeSingle()
  const l = data as Listing | null
  if (!l || l.status !== 'approved' || l.listing_type !== 'auction') return { error: 'invalid' }
  if (l.user_id === user.id) return { error: 'self' }
  if (l.auction_ends_at && new Date(l.auction_ends_at).getTime() <= Date.now()) return { error: 'ended' }

  const minBid = nextMinBid(l)
  if (amount < minBid) return { error: 'too_low' }
  // Buy-now is the ceiling: a bid may never reach/exceed it. Anyone willing to
  // pay that much uses "Mua ngay" and wins immediately. This guarantees
  // current_bid stays below buy_now_price while the auction is live, so buy-now
  // can never be cheaper than the current bid.
  if (l.buy_now_price != null && amount >= l.buy_now_price) return { error: 'use_buy_now' }

  const prevBidderId = l.current_bidder_id

  const { error: bidErr } = await supabase
    .from('marketplace_bids')
    .insert({ listing_id: listingId, bidder_id: user.id, amount })
  if (bidErr) return { error: bidErr.message }

  // Anti-snipe: extend the end time if we're in the final window.
  let endsAt = l.auction_ends_at
  if (endsAt && new Date(endsAt).getTime() - Date.now() < ANTI_SNIPE_MS) {
    endsAt = new Date(Date.now() + ANTI_SNIPE_MS).toISOString()
  }

  // The listing's UPDATE RLS is owner-only (ml_update_own), and a bidder is not
  // the owner — so this must run via service-role. Validation above already
  // enforces auction/approved/not-owner/not-ended/amount.
  const admin = createAdminClient()
  const { error: updErr } = await admin
    .from('marketplace_listings')
    .update({
      current_bid: amount,
      current_bidder_id: user.id,
      bid_count: (l.bid_count ?? 0) + 1,
      auction_ends_at: endsAt,
    })
    .eq('id', listingId)
  if (updErr) return { error: updErr.message }

  // Notify the previous highest bidder that they've been outbid.
  if (prevBidderId && prevBidderId !== user.id) {
    await notifyUsers({
      recipientIds: [prevBidderId],
      type: 'auction_outbid',
      targetUrl: `/marketplace/${listingId}`,
      actorId: user.id,
      push: { title: 'Bạn vừa bị trả giá cao hơn', body: l.title, tag: `auction-${listingId}` },
    })
  }

  revalidatePath(`/marketplace/${listingId}`)
  return { ok: true, current: amount, endsAt: endsAt ?? undefined }
}

export async function buyNowAuction(listingId: string): Promise<BidResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'login_required' }
  if (!isUuid(listingId)) return { error: 'invalid' }

  const { data } = await supabase.from('marketplace_listings').select('*').eq('id', listingId).maybeSingle()
  const l = data as Listing | null
  if (!l || l.status !== 'approved' || l.listing_type !== 'auction' || l.buy_now_price == null) return { error: 'invalid' }
  if (l.user_id === user.id) return { error: 'self' }
  if (l.auction_ends_at && new Date(l.auction_ends_at).getTime() <= Date.now()) return { error: 'ended' }
  // Never sell below the current price: if bidding already reached/passed the
  // buy-now price, buy-now is no longer available.
  if (l.current_bid != null && l.current_bid >= l.buy_now_price) return { error: 'unavailable' }

  await supabase.from('marketplace_bids').insert({ listing_id: listingId, bidder_id: user.id, amount: l.buy_now_price })
  // Owner-only UPDATE RLS → settle the sale via service-role.
  const admin = createAdminClient()
  const { error: updErr } = await admin
    .from('marketplace_listings')
    .update({
      current_bid: l.buy_now_price,
      current_bidder_id: user.id,
      bid_count: (l.bid_count ?? 0) + 1,
      winner_id: user.id,
      sale_status: 'sold',
      sold_at: new Date().toISOString(),
      auction_ends_at: new Date().toISOString(),
    })
    .eq('id', listingId)
  if (updErr) return { error: updErr.message }

  // Notify the seller of the immediate sale.
  await notifyUsers({
    recipientIds: [l.user_id],
    type: 'auction_won',
    targetUrl: `/marketplace/${listingId}`,
    actorId: user.id,
    push: { title: 'Sản phẩm đấu giá đã được mua ngay', body: l.title, tag: `auction-${listingId}` },
  })

  revalidatePath(`/marketplace/${listingId}`)
  return { ok: true }
}

// Lazily finalize an ended auction (called when the detail page loads).
export async function resolveEndedAuction(l: Listing): Promise<void> {
  if (l.listing_type !== 'auction' || l.winner_id || !l.auction_ends_at) return
  if (new Date(l.auction_ends_at).getTime() > Date.now()) return
  if (!l.current_bidder_id) return  // no bids → nothing to settle
  try {
    const admin = createAdminClient()
    const { data: updated } = await admin
      .from('marketplace_listings')
      .update({ winner_id: l.current_bidder_id, sale_status: 'sold', sold_at: new Date().toISOString() })
      .eq('id', l.id)
      .is('winner_id', null)
      .select('id')
      .maybeSingle()
    if (!updated) return  // already settled by a concurrent request
    await notifyUsers({
      recipientIds: [l.current_bidder_id],
      type: 'auction_won',
      targetUrl: `/marketplace/${l.id}`,
      push: { title: 'Bạn đã thắng phiên đấu giá', body: l.title, tag: `auction-${l.id}` },
    })
    await notifyUsers({
      recipientIds: [l.user_id],
      type: 'auction_won',
      targetUrl: `/marketplace/${l.id}`,
      push: { title: 'Phiên đấu giá đã kết thúc', body: l.title, tag: `auction-end-${l.id}` },
    })
  } catch { /* best-effort */ }
}

export async function incrementListingView(id: string): Promise<void> {
  if (!isUuid(id)) return
  try {
    // Atomic increment in the DB (see migration_marketplace_view_count.sql) to
    // avoid the read-modify-write lost-update race under concurrent views.
    const admin = createAdminClient()
    await admin.rpc('increment_listing_view', { p_listing_id: id })
  } catch { /* non-critical */ }
}

// ── Bid history (privacy-masked names) ──────────────────────────────────────
export type BidHistoryItem = { id: string; name: string; amount: number; createdAt: string }

// Strong privacy mask: keep only first + last char (hayha123 → h***3).
function maskBidderName(raw: string | null | undefined): string {
  const n = sanitizeUserName(raw ?? '', 40)
  if (!n) return 'Người đấu giá'
  if (n.length <= 2) return n[0] + '***'
  return n[0] + '***' + n.slice(-1)
}

export async function getListingBids(listingId: string, limit = 25): Promise<BidHistoryItem[]> {
  if (!isUuid(listingId)) return []
  try {
    const admin = createAdminClient()
    // The current price = highest VALID bid. A valid bid can never exceed it, so
    // cap the history at current_bid to drop orphan bids (e.g. ones inserted
    // before the bidding RLS fix that never became the price). Keeps the list
    // consistent with "Giá hiện tại" and the bid count.
    const { data: l } = await admin
      .from('marketplace_listings').select('current_bid').eq('id', listingId).maybeSingle()
    const cap = (l as { current_bid: number | null } | null)?.current_bid ?? null
    if (cap == null) return []

    const { data } = await admin
      .from('marketplace_bids')
      .select('id, bidder_id, amount, created_at')
      .eq('listing_id', listingId)
      .lte('amount', cap)
      .order('created_at', { ascending: false })
      .limit(limit)
    const rows = (data ?? []) as { id: string; bidder_id: string; amount: number; created_at: string }[]
    if (rows.length === 0) return []

    const ids = Array.from(new Set(rows.map(r => r.bidder_id)))
    const { data: profs } = await admin.from('profiles').select('id, display_name').in('id', ids)
    const nameMap: Record<string, string> = {}
    for (const p of (profs ?? []) as { id: string; display_name: string | null }[]) {
      if (p.display_name) nameMap[p.id] = p.display_name
    }
    return rows.map(r => ({
      id: r.id,
      name: maskBidderName(nameMap[r.bidder_id]),
      amount: r.amount,
      createdAt: r.created_at,
    }))
  } catch {
    return []
  }
}
