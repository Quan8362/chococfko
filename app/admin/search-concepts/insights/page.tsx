import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin } from '@/lib/supabase/admin'
import { getSearchInsights, type QueryStat } from '@/lib/searchInsights'

export const dynamic = 'force-dynamic'

export default async function SearchInsightsPage() {
  if (!(await checkIsAdmin())) redirect('/')
  const t = await getTranslations('explore_search')
  const data = await getSearchInsights()

  const Table = ({ title, rows, metric }: { title: string; rows: QueryStat[]; metric: 'zero' | 'total' }) => (
    <section className="mb-8">
      <h2 className="font-serif font-bold text-[18px] text-ink mb-3">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-[13.5px] text-muted">{t('insights_none')}</p>
      ) : (
        <div className="overflow-x-auto border border-line rounded-2xl">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="bg-cream/50 text-left text-[12px] uppercase tracking-[0.5px] text-muted">
                <th className="px-4 py-2.5">{t('insights_col_query')}</th>
                <th className="px-4 py-2.5 text-right">{t('insights_col_total')}</th>
                <th className="px-4 py-2.5 text-right">{t('insights_col_zero')}</th>
                <th className="px-4 py-2.5 text-right">{t('insights_col_clicks')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.query} className="border-t border-line">
                  <td className="px-4 py-2.5 font-medium text-ink">{r.query}</td>
                  <td className="px-4 py-2.5 text-right">{r.total}</td>
                  <td className={`px-4 py-2.5 text-right ${metric === 'zero' && r.zero ? 'text-rose font-semibold' : ''}`}>{r.zero}</td>
                  <td className="px-4 py-2.5 text-right">{r.clicks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )

  return (
    <div className="max-w-[920px] mx-auto px-6 py-10">
      <Link href="/admin/search-concepts" className="text-[13px] text-muted hover:text-rose">{t('insights_back')}</Link>
      <h1 className="font-serif font-bold text-[28px] tracking-[-0.3px] text-ink mt-2 mb-6">{t('insights_title')}</h1>

      <div className="grid grid-cols-2 gap-4 mb-8 max-w-[420px]">
        <div className="bg-paper border border-line rounded-2xl p-4">
          <p className="text-[12px] uppercase tracking-[0.5px] text-muted">{t('insights_total_label')}</p>
          <p className="font-serif font-bold text-[26px] text-ink">{data.totalSearches}</p>
        </div>
        <div className="bg-paper border border-line rounded-2xl p-4">
          <p className="text-[12px] uppercase tracking-[0.5px] text-muted">{t('insights_zero_rate')}</p>
          <p className="font-serif font-bold text-[26px] text-ink">{Math.round(data.zeroRate * 100)}%</p>
        </div>
      </div>

      <Table title={t('insights_unmatched')} rows={data.unmatched} metric="total" />
      <Table title={t('insights_zero')} rows={data.zeroResult} metric="zero" />
      <Table title={t('insights_low_ctr')} rows={data.lowCtr} metric="total" />
    </div>
  )
}
