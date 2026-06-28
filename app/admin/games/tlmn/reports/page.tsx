import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import ReportsTable, { type ReportRow } from './ReportsTable'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin · TLMN Reports' }

type ItemStat = { interaction_key: string; uses: number; free_uses: number; paid_uses: number; coins_spent: number; unique_senders: number }

export default async function AdminTlmnReportsPage() {
  if (!(await checkIsAdmin())) redirect('/')
  const t = await getTranslations('admin_tlmn_react')
  const admin = createAdminClient()

  const [reportsRes, itemStatsRes, reportStatsRes] = await Promise.all([
    admin.from('game_interaction_reports')
      .select('id, reported_user_id, room_id, reason, status, recent_event_data, created_at')
      .order('created_at', { ascending: false }).limit(100),
    admin.from('tlmn_interaction_item_stats').select('*').order('uses', { ascending: false }),
    admin.from('tlmn_interaction_report_stats').select('*'),
  ])

  const reports = (reportsRes.data ?? []) as ReportRow[]
  const itemStats = (itemStatsRes.data ?? []) as ItemStat[]
  const reportStats = (reportStatsRes.data ?? []) as { reason: string; status: string; n: number }[]
  const totalReports = reportStats.reduce((s, r) => s + Number(r.n), 0)
  const openReports = reportStats.filter(r => r.status === 'open').reduce((s, r) => s + Number(r.n), 0)
  const totalCoins = itemStats.reduce((s, r) => s + Number(r.coins_spent), 0)
  const totalUses = itemStats.reduce((s, r) => s + Number(r.uses), 0)

  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 pb-20">
      <div className="flex items-center gap-3 mb-1">
        <h1 className="font-serif font-bold text-[24px] text-ink">{t('reports_title')}</h1>
        <Link href="/admin/games/tlmn/interactions" className="text-[12px] font-semibold text-rose hover:underline">{t('nav_catalog')} →</Link>
      </div>
      <p className="text-[13px] text-muted mb-6">{t('reports_sub')}</p>

      {/* Analytics summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Stat label={t('a_total_uses')} value={totalUses.toLocaleString()} />
        <Stat label={t('a_total_coins')} value={totalCoins.toLocaleString()} />
        <Stat label={t('a_total_reports')} value={String(totalReports)} />
        <Stat label={t('a_open_reports')} value={String(openReports)} />
      </div>

      <h2 className="font-bold text-[15px] text-ink mb-2">{t('analytics_title')}</h2>
      <div className="overflow-x-auto rounded-xl border border-line mb-8">
        <table className="w-full text-[13px] min-w-[560px]">
          <thead className="bg-cream text-ink"><tr className="text-left">
            <th className="px-3 py-2 font-bold">{t('a_item')}</th>
            <th className="px-3 py-2 font-bold">{t('a_uses')}</th>
            <th className="px-3 py-2 font-bold">{t('a_free')}</th>
            <th className="px-3 py-2 font-bold">{t('a_paid')}</th>
            <th className="px-3 py-2 font-bold">{t('a_coins')}</th>
            <th className="px-3 py-2 font-bold">{t('a_senders')}</th>
          </tr></thead>
          <tbody>
            {itemStats.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-muted">{t('a_none')}</td></tr>}
            {itemStats.map(s => (
              <tr key={s.interaction_key} className="border-t border-line/70">
                <td className="px-3 py-2 font-semibold text-ink">{s.interaction_key}</td>
                <td className="px-3 py-2">{Number(s.uses).toLocaleString()}</td>
                <td className="px-3 py-2 text-muted">{Number(s.free_uses).toLocaleString()}</td>
                <td className="px-3 py-2 text-muted">{Number(s.paid_uses).toLocaleString()}</td>
                <td className="px-3 py-2">{Number(s.coins_spent).toLocaleString()}</td>
                <td className="px-3 py-2 text-muted">{Number(s.unique_senders).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="font-bold text-[15px] text-ink mb-2">{t('reports_title')}</h2>
      <ReportsTable rows={reports} />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-paper px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="text-[20px] font-black text-ink mt-0.5">{value}</p>
    </div>
  )
}
