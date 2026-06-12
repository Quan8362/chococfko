import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import { type Listing, formatPriceJPY, relativeListingDate, isUuid } from '@/lib/marketplace'
import { avatarSrc } from '@/lib/avatar'

export const dynamic = 'force-dynamic'

type BidRow = { id: string; bidder_id: string; amount: number; created_at: string }

export default async function AdminAuctionDetailPage({ params }: { params: { id: string } }) {
  if (!(await checkIsAdmin())) redirect('/')
  if (!isUuid(params.id)) notFound()

  const [t, tm, locale] = await Promise.all([
    getTranslations('marketplace_admin'),
    getTranslations('marketplace'),
    getLocale(),
  ])
  const admin = createAdminClient()

  const { data: lData } = await admin.from('marketplace_listings').select('*').eq('id', params.id).maybeSingle()
  const listing = lData as Listing | null
  if (!listing) notFound()
  if (listing.listing_type !== 'auction') redirect('/admin/cho-do-cu')

  const { data: bidData } = await admin
    .from('marketplace_bids')
    .select('id, bidder_id, amount, created_at')
    .eq('listing_id', listing.id)
    .order('amount', { ascending: false })
    .order('created_at', { ascending: false })
  const bids = (bidData ?? []) as BidRow[]

  const winnerId = listing.winner_id ?? listing.current_bidder_id ?? null
  const ids = Array.from(new Set([...bids.map(b => b.bidder_id), winnerId].filter(Boolean) as string[]))
  const profMap: Record<string, { name: string; avatar: string | null }> = {}
  if (ids.length) {
    const { data: profs } = await admin.from('profiles').select('id, display_name, avatar_url').in('id', ids)
    for (const p of (profs ?? []) as { id: string; display_name: string | null; avatar_url: string | null }[]) {
      profMap[p.id] = { name: p.display_name || tm('member_fallback'), avatar: p.avatar_url }
    }
  }
  const nameOf = (id: string) => profMap[id]?.name || tm('member_fallback')

  const ended = listing.auction_ends_at ? new Date(listing.auction_ends_at).getTime() <= Date.now() : false
  const settled = !!listing.winner_id || listing.sale_status === 'sold'
  const uniqueBidders = new Set(bids.map(b => b.bidder_id)).size

  return (
    <div className="max-w-[860px] mx-auto px-5 sm:px-6 py-10 pb-20">
      <Link href="/admin/cho-do-cu?tab=auction" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-rose transition-colors mb-5">
        ← {t('back_listings')}
      </Link>

      {/* Listing summary */}
      <div className="bg-paper border border-line rounded-2xl p-5 mb-5">
        <div className="flex gap-4">
          <Link href={`/cho-do-cu/${listing.id}`} target="_blank" className="flex-none w-20 h-20 rounded-xl overflow-hidden bg-cream">
            {listing.cover_image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={listing.cover_image} alt={listing.title} className="w-full h-full object-cover" />
            ) : <div className="w-full h-full grid place-items-center text-2xl opacity-30">🔨</div>}
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-rose/10 text-rose">🔨 {tm('type_auction')}</span>
              <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${settled ? 'bg-ink/80 text-white' : ended ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {settled ? tm('status_sold') : ended ? t('status_ended') : t('status_live')}
              </span>
              <span className="text-[11.5px] text-muted">{relativeListingDate(listing.created_at, locale)}</span>
            </div>
            <Link href={`/cho-do-cu/${listing.id}`} target="_blank" className="font-semibold text-[16px] text-ink leading-snug hover:text-rose transition-colors">{listing.title}</Link>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-[12.5px]">
              <div><p className="text-muted">{t('start_price_label')}</p><p className="font-semibold text-ink">{formatPriceJPY(listing.start_price)}</p></div>
              <div><p className="text-muted">{tm('buy_now')}</p><p className="font-semibold text-ink">{listing.buy_now_price != null ? formatPriceJPY(listing.buy_now_price) : '—'}</p></div>
              <div><p className="text-muted">{settled ? t('final_price_label') : tm('current_bid_label')}</p><p className="font-bold text-rose">{formatPriceJPY(listing.current_bid ?? listing.start_price)}</p></div>
              <div><p className="text-muted">{t('bidders_label')}</p><p className="font-semibold text-ink">{uniqueBidders} · {bids.length} {t('bids_unit')}</p></div>
            </div>
          </div>
        </div>
      </div>

      {/* Winner */}
      <div className="bg-paper border border-line rounded-2xl p-5 mb-5">
        <p className="text-[12px] font-semibold text-muted uppercase tracking-wide mb-3">{settled ? t('winner_title') : t('leading_title')}</p>
        {winnerId ? (
          <div className="flex items-center gap-3 flex-wrap">
            {profMap[winnerId]?.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarSrc(profMap[winnerId].avatar!)} alt="" referrerPolicy="no-referrer" className="w-11 h-11 rounded-full object-cover ring-2 ring-white" />
            ) : (
              <div className="w-11 h-11 rounded-full grid place-items-center text-[15px] font-bold ring-2 ring-white bg-gradient-to-br from-rose/40 to-teal/40 text-ink">{nameOf(winnerId)[0]?.toUpperCase() ?? '?'}</div>
            )}
            <div className="min-w-0">
              <p className="font-semibold text-[15px] text-ink flex items-center gap-1.5">{settled && <span>🏆</span>}{nameOf(winnerId)}</p>
              <p className="text-[13px] text-rose font-bold">{formatPriceJPY(listing.current_bid ?? listing.buy_now_price)}</p>
            </div>
            <div className="flex gap-2 ml-auto">
              <Link href={`/nguoi-dung/${winnerId}`} target="_blank" className="text-[12.5px] font-semibold px-3.5 py-1.5 rounded-full bg-cream border border-line text-ink hover:border-rose/30 transition-all">{t('view_profile')}</Link>
              <Link href={`/cong-dong/chat?dm=${winnerId}`} className="text-[12.5px] font-semibold px-3.5 py-1.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all">{t('contact')}</Link>
            </div>
          </div>
        ) : (
          <p className="text-[13.5px] text-muted">{t('no_winner')}</p>
        )}
      </div>

      {/* Bid list */}
      <div className="bg-paper border border-line rounded-2xl p-5">
        <p className="text-[12px] font-semibold text-muted uppercase tracking-wide mb-3">{t('bids_title')} · {bids.length}</p>
        {bids.length === 0 ? (
          <p className="text-[13.5px] text-muted">{t('no_bids')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11.5px] text-muted border-b border-line">
                  <th className="py-2 pr-3 font-medium">#</th>
                  <th className="py-2 pr-3 font-medium">{t('col_bidder')}</th>
                  <th className="py-2 pr-3 font-medium text-right">{t('col_amount')}</th>
                  <th className="py-2 pr-3 font-medium text-right">{t('col_time')}</th>
                </tr>
              </thead>
              <tbody>
                {bids.map((b, i) => {
                  const isWinner = b.bidder_id === winnerId
                  return (
                    <tr key={b.id} className={`border-b border-line/50 ${isWinner ? 'bg-rose/5' : ''}`}>
                      <td className="py-2 pr-3 text-muted tabular-nums">{i + 1}</td>
                      <td className="py-2 pr-3">
                        <Link href={`/nguoi-dung/${b.bidder_id}`} target="_blank" className="inline-flex items-center gap-1.5 font-medium text-ink hover:text-rose transition-colors">
                          {isWinner && <span title={t('winner_title')}>🏆</span>}
                          <span className="truncate max-w-[180px]">{nameOf(b.bidder_id)}</span>
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-right font-semibold text-rose tabular-nums">{formatPriceJPY(b.amount)}</td>
                      <td className="py-2 pr-3 text-right text-muted whitespace-nowrap">{relativeListingDate(b.created_at, locale)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
