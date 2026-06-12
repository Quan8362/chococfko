import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import { type Listing, formatPriceJPY, relativeListingDate } from '@/lib/marketplace'
import { approveListing, rejectListing, adminDeleteListing } from './actions'

export const dynamic = 'force-dynamic'

const STATUS_STYLE: Record<string, string> = {
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-600',
}

type Tab = 'pending' | 'approved' | 'rejected' | 'reported' | 'auction'

export default async function AdminMarketplacePage({ searchParams }: { searchParams: { tab?: string } }) {
  if (!(await checkIsAdmin())) redirect('/')

  const [t, tm, locale] = await Promise.all([
    getTranslations('marketplace_admin'),
    getTranslations('marketplace'),
    getLocale(),
  ])
  const admin = createAdminClient()
  const tab = (['pending', 'approved', 'rejected', 'reported', 'auction'].includes(searchParams.tab ?? '') ? searchParams.tab : 'pending') as Tab

  // Reported listing ids
  const { data: reportRows } = await admin.from('marketplace_reports').select('listing_id, reason, created_at')
  const reportCountMap = new Map<string, number>()
  for (const r of reportRows ?? []) {
    const id = (r as { listing_id: string }).listing_id
    reportCountMap.set(id, (reportCountMap.get(id) ?? 0) + 1)
  }

  let query = admin.from('marketplace_listings').select('*').order('created_at', { ascending: false }).limit(100)
  if (tab === 'reported') {
    const ids = Array.from(reportCountMap.keys())
    query = ids.length ? query.in('id', ids) : query.eq('id', '00000000-0000-0000-0000-000000000000')
  } else if (tab === 'auction') {
    query = query.eq('listing_type', 'auction')
  } else {
    query = query.eq('status', tab)
  }
  const { data } = await query
  const listings = (data ?? []) as Listing[]

  // Pending count for tab badge
  const { count: pendingCount } = await admin.from('marketplace_listings').select('id', { count: 'exact', head: true }).eq('status', 'pending')

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'pending',  label: t('tab_pending'),  badge: pendingCount ?? 0 },
    { key: 'approved', label: t('tab_approved') },
    { key: 'rejected', label: t('tab_rejected') },
    { key: 'reported', label: t('tab_reported'), badge: reportCountMap.size },
    { key: 'auction',  label: t('tab_auction') },
  ]

  return (
    <div className="max-w-[1000px] mx-auto px-5 sm:px-6 py-10 pb-20">
      <Link href="/admin" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-rose transition-colors mb-5">← {t('back_admin')}</Link>
      <h1 className="font-serif font-bold text-[28px] sm:text-[32px] tracking-[-0.5px] text-ink mb-6">🛒 {t('title')}</h1>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap mb-6">
        {tabs.map(tb => (
          <Link
            key={tb.key}
            href={`/admin/cho-do-cu?tab=${tb.key}`}
            className={`inline-flex items-center gap-2 text-[13.5px] font-semibold px-4 py-2 rounded-full border transition-all ${tab === tb.key ? 'border-rose bg-rose/10 text-rose' : 'border-line bg-paper text-muted hover:border-rose/30'}`}
          >
            {tb.label}
            {!!tb.badge && tb.badge > 0 && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white">{tb.badge}</span>}
          </Link>
        ))}
      </div>

      {listings.length === 0 ? (
        <div className="bg-paper border border-line rounded-2xl px-6 py-14 text-center text-[14px] text-muted">{t('empty')}</div>
      ) : (
        <div className="space-y-3">
          {listings.map((l) => {
            const reports = reportCountMap.get(l.id) ?? 0
            return (
              <div key={l.id} className="flex gap-4 bg-paper border border-line rounded-2xl p-4">
                <Link href={`/cho-do-cu/${l.id}`} target="_blank" className="flex-none w-20 h-20 rounded-xl overflow-hidden bg-cream">
                  {l.cover_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.cover_image} alt={l.title} className="w-full h-full object-cover" />
                  ) : <div className="w-full h-full grid place-items-center text-2xl opacity-30">🛒</div>}
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[l.status]}`}>{tm(`mod_${l.status}` as Parameters<typeof tm>[0])}</span>
                    {reports > 0 && <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">🚩 {reports}</span>}
                    <span className="text-[11.5px] text-muted">{relativeListingDate(l.created_at, locale)}</span>
                  </div>
                  <Link href={`/cho-do-cu/${l.id}`} target="_blank" className="font-semibold text-[15px] text-ink leading-snug line-clamp-1 hover:text-rose transition-colors">{l.title}</Link>
                  <p className="text-[12.5px] mt-0.5">
                    <span className={`font-bold ${l.listing_type === 'free' ? 'text-teal' : 'text-rose'}`}>
                      {l.listing_type === 'free' ? tm('free_price')
                        : l.listing_type === 'auction' ? formatPriceJPY(l.current_bid ?? l.start_price)
                        : formatPriceJPY(l.price)}
                    </span>
                    {l.listing_type === 'auction' && <span className="text-muted text-[11px] ml-1.5">🔨 {tm('bid_count', { count: l.bid_count ?? 0 })}</span>}
                  </p>
                  <div className="flex gap-2 mt-2.5 flex-wrap">
                    {l.listing_type === 'auction' && (
                      <Link href={`/admin/cho-do-cu/${l.id}`} className="text-[12.5px] font-semibold px-3.5 py-1.5 rounded-full bg-rose/10 text-rose hover:bg-rose/20 transition-all">{t('view_bids')} →</Link>
                    )}
                    {l.status !== 'approved' && (
                      <form action={approveListing}><input type="hidden" name="id" value={l.id} /><button className="text-[12.5px] font-semibold px-3.5 py-1.5 rounded-full bg-emerald-500 text-white hover:bg-emerald-600 transition-all">{t('approve')}</button></form>
                    )}
                    {l.status !== 'rejected' && (
                      <form action={rejectListing}><input type="hidden" name="id" value={l.id} /><button className="text-[12.5px] font-semibold px-3.5 py-1.5 rounded-full bg-cream border border-line text-ink hover:border-amber-300 transition-all">{t('reject')}</button></form>
                    )}
                    <form action={adminDeleteListing}><input type="hidden" name="id" value={l.id} /><button className="text-[12.5px] font-semibold px-3.5 py-1.5 rounded-full border border-red-200 text-red-500 hover:bg-red-50 transition-all">{t('delete')}</button></form>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
