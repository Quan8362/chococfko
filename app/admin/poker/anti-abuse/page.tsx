import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin } from '@/lib/supabase/admin'
import { loadCollusionSignals } from '../data'

export const metadata = { title: 'Admin · Poker Anti-Abuse' }
export const dynamic = 'force-dynamic'

export default async function AdminPokerAntiAbuse() {
  if (!(await checkIsAdmin())) redirect('/')
  const t = await getTranslations('admin_poker')
  const signals = await loadCollusionSignals(500)

  return (
    <div className="max-w-[1000px] mx-auto px-4 sm:px-6 py-8 pb-20 space-y-5">
      <div>
        <Link href="/admin/poker" className="text-[12px] text-rose hover:underline">← {t('overview_title')}</Link>
        <h1 className="font-serif font-bold text-[22px] text-ink mt-1">{t('nav_anti_abuse')}</h1>
        <p className="text-[13px] text-muted">{t('anti_abuse_sub')}</p>
        <p className="text-[12px] text-amber-700 mt-1">{t('anti_abuse_disclaimer')}</p>
      </div>

      {signals.length === 0 ? <p className="text-[12px] text-muted">{t('none')}</p> : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-[12px] min-w-[720px]">
            <thead className="bg-cream text-ink"><tr className="text-left">
              <th className="px-3 py-2 font-bold">{t('suspicion')}</th>
              <th className="px-3 py-2 font-bold">{t('pair')}</th>
              <th className="px-3 py-2 font-bold">{t('hands_together')}</th>
              <th className="px-3 py-2 font-bold">{t('tables_together')}</th>
              <th className="px-3 py-2 font-bold">{t('net_flow')}</th>
              <th className="px-3 py-2 font-bold">{t('one_way')}</th>
            </tr></thead>
            <tbody>
              {signals.map((s, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="px-3 py-2"><span className={`font-bold tabular-nums ${s.suspicion >= 60 ? 'text-red-600' : s.suspicion >= 30 ? 'text-amber-700' : 'text-muted'}`}>{s.suspicion}</span></td>
                  <td className="px-3 py-2 font-mono">{s.userA.slice(0, 8)} ⇄ {s.userB.slice(0, 8)}</td>
                  <td className="px-3 py-2 tabular-nums">{s.handsTogether}</td>
                  <td className="px-3 py-2 tabular-nums">{s.tablesTogether}</td>
                  <td className="px-3 py-2 tabular-nums">{s.netFlowAToB.toLocaleString()}</td>
                  <td className="px-3 py-2 tabular-nums">{(s.oneWayRatio * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
