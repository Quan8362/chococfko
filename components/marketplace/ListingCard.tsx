import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import { type Listing, formatPriceJPY, relativeListingDate } from '@/lib/marketplace'

export default async function ListingCard({ listing }: { listing: Listing }) {
  const [t, locale] = await Promise.all([getTranslations('marketplace'), getLocale()])
  const isFree = listing.listing_type === 'free'
  const isAuction = listing.listing_type === 'auction'
  const sold = listing.sale_status === 'sold'

  return (
    <Link
      href={`/cho-do-cu/${listing.id}`}
      className="group block bg-paper border border-line rounded-2xl overflow-hidden hover:border-rose/30 hover:shadow-[0_8px_28px_-12px_rgba(36,26,23,0.22)] transition-all"
    >
      {/* Cover */}
      <div className="relative aspect-square bg-cream overflow-hidden">
        {listing.cover_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.cover_image}
            alt={listing.title}
            loading="lazy"
            className={`w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500 ${sold ? 'grayscale opacity-70' : ''}`}
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-4xl opacity-30">🛒</div>
        )}

        {/* Type / status badges */}
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5 items-start">
          {isFree && (
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-teal text-white shadow-sm">🎁 {t('type_free')}</span>
          )}
          {isAuction && (
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-rose text-white shadow-sm">🔨 {t('type_auction')}</span>
          )}
          {listing.sale_status === 'reserved' && (
            <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white shadow-sm">{t('status_reserved')}</span>
          )}
          {sold && (
            <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-ink/80 text-white shadow-sm">{t('status_sold')}</span>
          )}
        </div>

        {/* Condition chip */}
        <span className="absolute bottom-2.5 right-2.5 text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-white/90 backdrop-blur-sm text-ink/70">
          {listing.condition === 'new' ? t('cond_new') : `${listing.condition_percent ?? ''}%`}
        </span>
      </div>

      {/* Body */}
      <div className="p-3.5">
        <div className={`font-bold text-[16px] mb-1 ${isFree ? 'text-teal' : 'text-rose'} ${sold ? 'line-through opacity-60' : ''}`}>
          {isFree ? t('free_price')
            : isAuction ? formatPriceJPY(listing.current_bid ?? listing.start_price)
            : formatPriceJPY(listing.price)}
          {isAuction && (
            <span className="ml-1.5 text-[11px] font-medium text-muted">· {listing.current_bid == null ? t('starting_label') : t('current_bid_label')}</span>
          )}
          {!isFree && !isAuction && listing.is_negotiable && (
            <span className="ml-1.5 text-[11px] font-medium text-muted">· {t('negotiable_short')}</span>
          )}
        </div>
        <h3 className="text-[14px] font-medium text-ink leading-snug line-clamp-2 min-h-[2.4em]">{listing.title}</h3>
        <div className="flex items-center gap-1.5 mt-2 text-[11.5px] text-muted">
          {listing.area && <><span className="truncate">📍 {listing.area}</span><span>·</span></>}
          <span className="whitespace-nowrap">{relativeListingDate(listing.created_at, locale)}</span>
        </div>
      </div>
    </Link>
  )
}
