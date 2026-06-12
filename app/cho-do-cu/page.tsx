import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { type ListingType, type ListingCondition, type SortKey } from '@/lib/marketplace'
import { getListings } from '@/lib/marketplace-data'
import ListingCard from '@/components/marketplace/ListingCard'
import MarketplaceFilters from './MarketplaceFilters'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('marketplace')
  return { title: `${t('page_title')} · Chợ Cóc FKO` }
}

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: { q?: string; category?: string; type?: string; condition?: string; sort?: string }
}) {
  const t = await getTranslations('marketplace')

  const type = (searchParams.type === 'sell' || searchParams.type === 'free') ? searchParams.type as ListingType : undefined
  const condition = (searchParams.condition === 'new' || searchParams.condition === 'used') ? searchParams.condition as ListingCondition : undefined
  const sort = (['price_asc', 'price_desc'].includes(searchParams.sort ?? '')) ? searchParams.sort as SortKey : 'newest'

  const listings = await getListings({
    q: searchParams.q,
    category: searchParams.category,
    type,
    condition,
    sort,
  })

  return (
    <div className="pb-20">
      {/* Hero */}
      <div className="bg-gradient-to-b from-[#fdeef5] via-[#fdf5f8] to-cream border-b border-rose/10">
        <div className="max-w-[1180px] mx-auto px-5 sm:px-6 pt-9 pb-7">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[2.5px] uppercase text-rose bg-rose/10 border border-rose/20 px-3.5 py-1.5 rounded-full mb-3">
                🛒 {t('badge')}
              </span>
              <h1 className="font-serif font-bold text-[clamp(28px,4vw,44px)] leading-[1.1] tracking-[-0.6px] text-ink">{t('page_title')}</h1>
              <p className="text-[14.5px] text-muted mt-2 max-w-[520px]">{t('page_subtitle')}</p>
            </div>
            <div className="flex items-center gap-2.5">
              <Link
                href="/cho-do-cu/cua-toi"
                className="hidden sm:inline-flex items-center gap-2 font-semibold text-[13.5px] px-5 py-2.5 rounded-full bg-paper border border-line text-ink hover:border-rose/30 transition-all"
              >
                {t('my_listings')}
              </Link>
              <Link
                href="/cho-do-cu/dang"
                className="inline-flex items-center gap-2 font-semibold text-[14px] px-6 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep hover:-translate-y-px transition-all shadow-[0_4px_16px_-4px_rgba(194,24,91,0.5)]"
              >
                ＋ {t('post_listing')}
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="sticky top-[68px] z-[40] bg-cream/95 backdrop-blur-sm border-b border-line">
        <div className="max-w-[1180px] mx-auto px-5 sm:px-6 py-4">
          <MarketplaceFilters
            q={searchParams.q ?? ''}
            category={searchParams.category ?? 'all'}
            type={searchParams.type ?? ''}
            condition={searchParams.condition ?? ''}
            sort={sort}
          />
        </div>
      </div>

      {/* Grid */}
      <div className="max-w-[1180px] mx-auto px-5 sm:px-6 mt-7">
        {listings.length === 0 ? (
          <div className="bg-paper border border-line rounded-2xl px-6 py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-cream border border-line grid place-items-center text-2xl mx-auto mb-4">🛒</div>
            <p className="text-[15px] text-ink font-medium mb-1">{t('empty_title')}</p>
            <p className="text-[13.5px] text-muted mb-5">{t('empty_subtitle')}</p>
            <Link href="/cho-do-cu/dang" className="inline-flex items-center gap-2 font-semibold text-[13.5px] px-6 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all">
              ＋ {t('post_listing')}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-4">
            {listings.map(l => <ListingCard key={l.id} listing={l} />)}
          </div>
        )}
      </div>
    </div>
  )
}
