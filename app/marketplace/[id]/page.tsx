import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAccess } from '@/lib/access-server'
import { canAccessScope } from '@/lib/access'
import AccessDenied from '@/components/access/AccessDenied'
import { getUserIdentity } from '@/lib/userIdentity'
import { avatarSrc } from '@/lib/avatar'
import AuthorLink from '@/components/AuthorLink'
import ListingCard from '@/components/marketplace/ListingCard'
import TagList from '@/components/tags/TagList'
import { getTagsForContent } from '@/lib/tags'
import { isUuid, formatPriceJPY, relativeListingDate, CONDITION_PRESETS } from '@/lib/marketplace'
import { getListingById, getListingComments, getRelatedListings, getListingRating, hasContactedSeller } from '@/lib/marketplace-data'
import { setSaleStatus, deleteListing, incrementListingView, resolveEndedAuction, getListingBids } from '../actions'
import RichDescription from '@/components/RichDescription'
import ListingGallery from './ListingGallery'
import MarketplaceComments from './MarketplaceComments'
import ReportButton from './ReportButton'
import ListingRating from './ListingRating'
import AuctionPanel from './AuctionPanel'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { id: string } }) {
  const l = await getListingById(params.id)
  if (!l) return { title: 'Chợ đồ cũ' }
  // Never index internal listings; never leak the internal title into metadata.
  if (l.community_scope === 'fko_internal') {
    return { title: 'Chợ đồ cũ', robots: { index: false, follow: false } }
  }
  const tagNames = isUuid(params.id)
    ? (await getTagsForContent(createClient(), 'listing', params.id)).map((tag) => tag.name)
    : []
  return {
    title: `${l.title} · Chợ đồ cũ`,
    keywords: [l.title, l.area, ...tagNames].filter(Boolean) as string[],
  }
}

export default async function ListingDetailPage({ params }: { params: { id: string } }) {
  if (!isUuid(params.id)) notFound()

  const supabase = createClient()
  const [t, tAccess, locale, listing, authRes, access] = await Promise.all([
    getTranslations('marketplace'),
    getTranslations('access'),
    getLocale(),
    getListingById(params.id),
    supabase.auth.getUser(),
    getCurrentUserAccess(),
  ])

  if (!listing) notFound()
  const viewer = authRes.data.user
  const isOwner = viewer?.id === listing.user_id

  // Authorization wall for internal listings — render NO listing data before this.
  if (listing.community_scope === 'fko_internal' && !isOwner && !canAccessScope(access, 'fko_internal')) {
    return (
      <AccessDenied
        message={tAccess('denied_message')}
        backHref="/marketplace"
        backLabel={tAccess('back_to_marketplace')}
      />
    )
  }

  if (listing.status !== 'approved' && !isOwner) notFound()

  // Kick off the side-effect writes concurrently (not on the critical path) so
  // they don't each add a cross-region round-trip wave before the page renders.
  const viewWrite = listing.status === 'approved' && !isOwner
    ? incrementListingView(listing.id) : Promise.resolve()
  const auctionResolve = listing.listing_type === 'auction'
    ? resolveEndedAuction(listing) : Promise.resolve()

  const [seller, comments, related, rating, initialBids, tags, contacted] = await Promise.all([
    getUserIdentity(listing.user_id),
    getListingComments(listing.id),
    getRelatedListings(listing.category, listing.id, listing.community_scope),
    getListingRating(listing.id, viewer?.id ?? null),
    listing.listing_type === 'auction' ? getListingBids(listing.id) : Promise.resolve([]),
    getTagsForContent(supabase, 'listing', listing.id),
    viewer && !isOwner ? hasContactedSeller(viewer.id, listing.user_id) : Promise.resolve(false),
  ])
  // Ensure the writes finish before the serverless function returns (they were
  // already running in parallel with the reads above, so this rarely waits).
  await Promise.all([viewWrite, auctionResolve])

  const isFree = listing.listing_type === 'free'
  const isAuction = listing.listing_type === 'auction'
  const sold = listing.sale_status === 'sold'
  const sellerName = seller.name || t('member_fallback')
  const presetLabel = CONDITION_PRESETS.find(p => p.percent === listing.condition_percent)?.key
  const conditionText = listing.condition === 'new'
    ? t('cond_new')
    : `${presetLabel ? t(`cond_${presetLabel}` as Parameters<typeof t>[0]) + ' · ' : ''}${listing.condition_percent}%`

  // Review eligibility (anti review-bombing): a logged-in non-owner may submit a
  // review only after they have messaged the seller, OR if they already left one.
  const canRate = !!viewer && !isOwner
  const eligibleToRate = canRate && (rating.myStars != null || contacted)

  // Scope-aware marketplace hrefs (keep the internal tab while navigating).
  const scopePrefix = listing.community_scope === 'fko_internal' ? 'scope=fko_internal&' : ''
  const marketHref = listing.community_scope === 'fko_internal' ? '/marketplace?scope=fko_internal' : '/marketplace'
  const categoryHref = `/marketplace?${scopePrefix}category=${listing.category}`

  // Product details table — rendered full-width below the two-column zone, as a
  // 2-column label/value grid so it fills the width and its right edge aligns
  // with the reviews + comments sections.
  const detailRows: { label: string; value: string }[] = [
    { label: t('field_condition'), value: conditionText },
    { label: t('field_category'), value: t(`cat_${listing.category}` as Parameters<typeof t>[0]) },
    ...(listing.area ? [{ label: t('field_location'), value: listing.area }] : []),
    { label: t('field_posted'), value: relativeListingDate(listing.created_at, locale) },
    { label: t('field_views'), value: String(listing.view_count) },
  ]
  const detailTotal = detailRows.length
  const detailLastRowStart = Math.floor((detailTotal - 1) / 2) * 2
  const detailsCard = (className: string) => (
    <div className={className}>
      <h2 className="font-serif font-bold text-[19px] text-ink mb-3">{t('details_title')}</h2>
      <dl className="bg-paper border border-line rounded-2xl overflow-hidden grid sm:grid-cols-2">
        {detailRows.map((r, i) => (
          <div
            key={r.label}
            className={`flex items-center justify-between gap-4 px-4 sm:px-5 py-3 border-line ${
              i === detailTotal - 1 ? '' : 'border-b'
            } ${i >= detailLastRowStart ? 'sm:border-b-0' : ''} ${
              i % 2 === 1 ? 'sm:border-l' : ''
            } ${detailTotal % 2 === 1 && i === detailTotal - 1 ? 'sm:col-span-2' : ''}`}
          >
            <dt className="text-[13px] text-muted">{r.label}</dt>
            <dd className="text-[13.5px] font-medium text-ink text-right">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )

  return (
    <div className="pb-20">
      <div className="max-w-[1100px] mx-auto px-5 sm:px-6 pt-6">
        {/* Breadcrumb (consistent with the rest of the site) */}
        <nav className="flex items-center gap-1.5 text-[12.5px] text-muted mb-5 flex-wrap">
          <Link href={marketHref} className="hover:text-rose transition-colors">{t('page_title')}</Link>
          <span>/</span>
          <Link href={categoryHref} className="hover:text-rose transition-colors">{t(`cat_${listing.category}` as Parameters<typeof t>[0])}</Link>
          <span>/</span>
          <span className="text-ink font-medium truncate max-w-[55vw] sm:max-w-[320px]">{listing.title}</span>
        </nav>

        {listing.status !== 'approved' && (
          <div className="mb-5 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-[13px] text-amber-800">
            {listing.status === 'pending' ? t('owner_pending_note') : t('owner_rejected_note')}
          </div>
        )}

        <div className="grid lg:grid-cols-[1fr_380px] gap-7 items-start">
          {/* Gallery */}
          <div>
            <ListingGallery images={listing.images} title={listing.title} />

            {/* Description (desktop under gallery) */}
            {listing.description && (
              <div className="mt-7 hidden lg:block">
                <h2 className="font-serif font-bold text-[19px] text-ink mb-3">{t('description')}</h2>
                <RichDescription content={listing.description} className="text-[15px] text-[#3a2d22] leading-[1.85]" />
              </div>
            )}
          </div>

          {/* Info column */}
          <div className="lg:sticky lg:top-[84px] space-y-4">
            {/* Price card */}
            <div className="bg-paper border border-line rounded-2xl p-5 shadow-[0_4px_24px_-12px_rgba(36,26,23,0.15)]">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {isFree && <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-teal text-white">🎁 {t('type_free')}</span>}
                {listing.sale_status === 'reserved' && <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-500 text-white">{t('status_reserved')}</span>}
                {sold && <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-ink/80 text-white">{t('status_sold')}</span>}
              </div>

              {!isAuction && (
                <>
                  <div className={`font-serif font-bold text-[30px] leading-tight ${isFree ? 'text-teal' : 'text-rose'} ${sold ? 'line-through opacity-60' : ''}`}>
                    {isFree ? t('free_price') : formatPriceJPY(listing.price)}
                  </div>
                  {!isFree && listing.is_negotiable && <p className="text-[12.5px] text-muted mt-0.5">{t('negotiable')}</p>}
                </>
              )}
              {isAuction && (
                <div className="font-serif font-bold text-[22px] leading-tight text-rose">🔨 {t('type_auction')}</div>
              )}

              <h1 className="font-semibold text-[18px] text-ink leading-snug mt-3">{listing.title}</h1>

              {/* Meta chips */}
              <div className="flex flex-wrap gap-2 mt-3 text-[12px]">
                <span className="px-2.5 py-1 rounded-full bg-cream border border-line text-ink/70">{t(`cat_${listing.category}` as Parameters<typeof t>[0])}</span>
                {listing.area && <span className="px-2.5 py-1 rounded-full bg-cream border border-line text-ink/70">📍 {listing.area}</span>}
                <span className="px-2.5 py-1 rounded-full bg-cream border border-line text-ink/70">👁 {listing.view_count}</span>
              </div>

              {/* Condition */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-[12.5px] mb-1.5">
                  <span className="text-muted">{t('field_condition')}</span>
                  <span className="font-semibold text-ink">
                    {listing.condition === 'new'
                      ? t('cond_new')
                      : `${presetLabel ? t(`cond_${presetLabel}` as Parameters<typeof t>[0]) + ' · ' : ''}${listing.condition_percent}%`}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-line overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-rose/60 to-rose" style={{ width: `${listing.condition === 'new' ? 100 : (listing.condition_percent ?? 0)}%` }} />
                </div>
              </div>

              <p className="text-[11.5px] text-muted mt-3">{relativeListingDate(listing.created_at, locale)}</p>

              {tags.length > 0 && (
                <div className="mt-3 pt-3 border-t border-line">
                  <TagList tags={tags} size="sm" />
                </div>
              )}
            </div>

            {/* Auction panel */}
            {isAuction && (
              <AuctionPanel
                listingId={listing.id}
                startPrice={listing.start_price ?? 0}
                minIncrement={listing.min_increment}
                buyNowPrice={listing.buy_now_price}
                initialCurrentBid={listing.current_bid}
                initialBidCount={listing.bid_count}
                initialEndsAt={listing.auction_ends_at}
                initialCurrentBidderId={listing.current_bidder_id}
                viewerId={viewer?.id ?? null}
                isOwner={isOwner}
                initialBids={initialBids}
              />
            )}

            {/* Seller / action card */}
            <div className="bg-paper border border-line rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-4">
                {seller.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarSrc(seller.avatarUrl)} alt={sellerName} referrerPolicy="no-referrer" className="w-11 h-11 rounded-full object-cover ring-2 ring-white" />
                ) : (
                  <div className="w-11 h-11 rounded-full grid place-items-center text-[15px] font-bold ring-2 ring-white bg-gradient-to-br from-rose/40 to-teal/40 text-ink">{sellerName[0]?.toUpperCase() ?? '?'}</div>
                )}
                <div className="min-w-0">
                  <AuthorLink userId={listing.user_id} name={sellerName} className="font-semibold text-[14.5px] text-ink block truncate" />
                  <span className="text-[12px] text-muted">{t('seller_label')}</span>
                </div>
              </div>

              {isOwner ? (
                <div className="space-y-3">
                  <p className="text-[12px] font-semibold text-muted uppercase tracking-wide">{t('owner_controls')}</p>
                  <div className="flex gap-1.5">
                    {(['available', 'reserved', 'sold'] as const).map(s => (
                      <form key={s} action={setSaleStatus} className="flex-1">
                        <input type="hidden" name="id" value={listing.id} />
                        <input type="hidden" name="sale_status" value={s} />
                        <button type="submit" className={`w-full text-[12px] font-medium px-2 py-2 rounded-lg border transition-all ${listing.sale_status === s ? 'border-rose bg-rose/10 text-rose' : 'border-line bg-cream text-muted hover:border-rose/30'}`}>
                          {t(`sale_${s}` as Parameters<typeof t>[0])}
                        </button>
                      </form>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/marketplace/edit/${listing.id}`} className="flex-1 text-center text-[13px] font-semibold px-4 py-2.5 rounded-full bg-cream border border-line text-ink hover:border-rose/30 transition-all">{t('edit')}</Link>
                    <form action={deleteListing} className="flex-none">
                      <input type="hidden" name="id" value={listing.id} />
                      <button type="submit" className="text-[13px] font-semibold px-4 py-2.5 rounded-full border border-red-200 text-red-500 hover:bg-red-50 transition-all">{t('delete')}</button>
                    </form>
                  </div>
                </div>
              ) : viewer ? (
                <Link
                  href={`/community/chat?dm=${listing.user_id}`}
                  className="w-full inline-flex items-center justify-center gap-2 font-semibold text-[14.5px] px-5 py-3 rounded-full bg-rose text-white hover:bg-rose-deep transition-all shadow-[0_4px_16px_-4px_rgba(194,24,91,0.5)]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                  {t('message_seller')}
                </Link>
              ) : (
                <Link href="/login" className="w-full inline-flex items-center justify-center gap-2 font-semibold text-[14px] px-5 py-3 rounded-full bg-rose text-white hover:bg-rose-deep transition-all">{t('login_to_contact')}</Link>
              )}

              {!isOwner && viewer && (
                <div className="mt-3 text-center"><ReportButton listingId={listing.id} /></div>
              )}
            </div>

            {/* Safety tips */}
            <div className="bg-cream border border-line rounded-2xl p-4 text-[12px] text-muted leading-relaxed">
              <p className="font-semibold text-ink mb-1">🛡️ {t('safety_title')}</p>
              {t('safety_tips')}
            </div>
          </div>
        </div>

        {/* Description (mobile) */}
        {listing.description && (
          <div className="mt-7 lg:hidden">
            <h2 className="font-serif font-bold text-[19px] text-ink mb-3">{t('description')}</h2>
            <RichDescription content={listing.description} className="text-[15px] text-[#3a2d22] leading-[1.85]" />
          </div>
        )}

        {/* Details table — full width below the two-column zone (aligns its right
            edge with the reviews + comments sections below). */}
        {detailsCard('mt-9')}

        {/* Seller reviews — full width below the fold (no width constraint, so the
            right edge lines up with the details table and comments). */}
        {(rating.count > 0 || canRate) && (
          <div className="mt-9">
            <ListingRating
              listingId={listing.id}
              average={rating.average}
              count={rating.count}
              myStars={rating.myStars}
              myReview={rating.myReview}
              canRate={canRate}
              eligible={eligibleToRate}
            />
          </div>
        )}

        {/* Comments */}
        <MarketplaceComments
          listingId={listing.id}
          comments={comments}
          currentUser={viewer ? { id: viewer.id } : null}
        />

        {/* Related */}
        {related.length > 0 && (
          <div className="mt-12">
            <h2 className="font-serif font-bold text-[20px] text-ink mb-5">{t('related')}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 sm:gap-4">
              {related.map(l => <ListingCard key={l.id} listing={l} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
