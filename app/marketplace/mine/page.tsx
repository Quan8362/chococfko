import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { formatPriceJPY, relativeListingDate } from '@/lib/marketplace'
import { getMyListings } from '@/lib/marketplace-data'
import { imgProxy } from '@/lib/avatar'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('marketplace')
  return { title: `${t('my_listings')} · Chợ Cóc FKO` }
}

const STATUS_STYLE: Record<string, string> = {
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-600',
}

export default async function MyListingsPage({ searchParams }: { searchParams: { success?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [t, locale, listings] = await Promise.all([
    getTranslations('marketplace'),
    getLocale(),
    getMyListings(user.id),
  ])

  return (
    <div className="max-w-[820px] mx-auto px-5 sm:px-6 py-10 pb-20">
      <Link href="/marketplace" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-rose transition-colors mb-6">
        ← {t('back_to_market')}
      </Link>

      <div className="flex items-center justify-between gap-4 flex-wrap mb-7">
        <h1 className="font-serif font-bold text-[28px] sm:text-[32px] tracking-[-0.5px] text-ink">{t('my_listings')}</h1>
        <Link href="/marketplace/new" className="inline-flex items-center gap-2 font-semibold text-[13.5px] px-5 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all">＋ {t('post_listing')}</Link>
      </div>

      {searchParams.success && (
        <div className="mb-6 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-[13.5px] text-emerald-700">{t('submit_success')}</div>
      )}

      {listings.length === 0 ? (
        <div className="bg-paper border border-line rounded-2xl px-6 py-14 text-center">
          <div className="w-14 h-14 rounded-2xl bg-cream border border-line grid place-items-center text-2xl mx-auto mb-4">🛒</div>
          <p className="text-[14px] text-muted mb-5">{t('my_empty')}</p>
          <Link href="/marketplace/new" className="inline-flex items-center gap-2 font-semibold text-[13.5px] px-6 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all">＋ {t('post_listing')}</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {listings.map((l) => (
            <div key={l.id} className="flex gap-4 bg-paper border border-line rounded-2xl p-3.5">
              <Link href={`/marketplace/${l.id}`} className="flex-none w-20 h-20 rounded-xl overflow-hidden bg-cream">
                {l.cover_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imgProxy(l.cover_image)} alt={l.title} className="w-full h-full object-cover" />
                ) : <div className="w-full h-full grid place-items-center text-2xl opacity-30">🛒</div>}
              </Link>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[l.status]}`}>{t(`mod_${l.status}` as Parameters<typeof t>[0])}</span>
                  {l.sale_status !== 'available' && <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-ink/10 text-ink/70">{t(`sale_${l.sale_status}` as Parameters<typeof t>[0])}</span>}
                </div>
                <Link href={`/marketplace/${l.id}`} className="font-semibold text-[15px] text-ink leading-snug line-clamp-1 hover:text-rose transition-colors">{l.title}</Link>
                <div className="flex items-center gap-2 mt-1 text-[12.5px]">
                  <span className={`font-bold ${l.listing_type === 'free' ? 'text-teal' : 'text-rose'}`}>{l.listing_type === 'free' ? t('free_price') : formatPriceJPY(l.price)}</span>
                  <span className="text-muted">· {relativeListingDate(l.created_at, locale)}</span>
                </div>
              </div>
              <div className="flex-none self-center">
                <Link href={`/marketplace/edit/${l.id}`} className="text-[12.5px] font-semibold px-3.5 py-2 rounded-full bg-cream border border-line text-ink hover:border-rose/30 transition-all">{t('edit')}</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
