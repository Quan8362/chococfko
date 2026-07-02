import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin } from '@/lib/supabase/admin'
import { loadOverview } from './data'

export const metadata = { title: 'Admin · Poker Ops' }
export const dynamic = 'force-dynamic'

function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

export default async function AdminPokerOverview() {
  if (!(await checkIsAdmin())) redirect('/')
  const t = await getTranslations('admin_poker')
  const tables = await loadOverview()

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8 pb-20">
      <div className="flex flex-wrap items-center gap-3 mb-1">
        <h1 className="font-serif font-bold text-[24px] text-ink">{t('overview_title')}</h1>
        <nav className="flex gap-3 text-[12px] font-semibold text-rose">
          <Link href="/admin/poker/alpha" className="hover:underline">{t('nav_alpha')}</Link>
          <Link href="/admin/poker/incidents" className="hover:underline">{t('nav_incidents')}</Link>
          <Link href="/admin/poker/observability" className="hover:underline">{t('nav_observability')}</Link>
          <Link href="/admin/poker/metrics" className="hover:underline">{t('nav_metrics')}</Link>
          <Link href="/admin/poker/anti-abuse" className="hover:underline">{t('nav_anti_abuse')}</Link>
          <Link href="/admin/poker/integrity" className="hover:underline">{t('nav_integrity')}</Link>
          <Link href="/admin/poker/economy" className="hover:underline">{t('nav_economy')}</Link>
        </nav>
      </div>
      <p className="text-[13px] text-muted mb-6">{t('overview_sub')}</p>

      {tables.length === 0 ? (
        <p className="text-[13px] text-muted rounded-xl border border-line bg-paper px-4 py-6 text-center">{t('no_tables')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-[12px] min-w-[1040px]">
            <thead className="bg-cream text-ink">
              <tr className="text-left">
                <th className="px-3 py-2 font-bold">{t('col_table')}</th>
                <th className="px-3 py-2 font-bold">{t('col_status')}</th>
                <th className="px-3 py-2 font-bold">{t('col_blinds')}</th>
                <th className="px-3 py-2 font-bold">{t('col_players')}</th>
                <th className="px-3 py-2 font-bold">{t('col_stack')}</th>
                <th className="px-3 py-2 font-bold">{t('col_hand')}</th>
                <th className="px-3 py-2 font-bold">{t('col_street')}</th>
                <th className="px-3 py-2 font-bold">{t('col_seq')}</th>
                <th className="px-3 py-2 font-bold">{t('col_pot')}</th>
                <th className="px-3 py-2 font-bold">{t('col_incidents')}</th>
                <th className="px-3 py-2 font-bold">{t('col_activity')}</th>
              </tr>
            </thead>
            <tbody>
              {tables.map((tb) => (
                <tr key={tb.id} className="border-t border-line align-top">
                  <td className="px-3 py-2">
                    <Link href={`/admin/poker/${tb.id}`} className="font-semibold text-rose hover:underline">{tb.name}</Link>
                    <div className="text-[10px] text-muted font-mono">{tb.id.slice(0, 8)}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-block rounded px-1.5 py-0.5 bg-cream text-ink">{t(`tstatus_${tb.status}` as 'tstatus_open')}</span>
                    {tb.paused && <div className="text-[10px] font-semibold text-amber-700 mt-0.5">{t('paused')}</div>}
                  </td>
                  <td className="px-3 py-2">{tb.smallBlind}/{tb.bigBlind}</td>
                  <td className="px-3 py-2">{tb.seatedPlayers}/{tb.capacity} <span className="text-muted">({tb.connectedPlayers}{t('connected_abbr')})</span></td>
                  <td className="px-3 py-2 tabular-nums">{tb.publicStack.toLocaleString()}</td>
                  <td className="px-3 py-2">
                    {tb.currentHandId
                      ? <Link href={`/admin/poker/hands/${tb.currentHandId}`} className="text-rose hover:underline">#{tb.handNo}</Link>
                      : <span className="text-muted">—</span>}
                    {tb.phase && <div className="text-[10px] text-muted">{tb.phase}</div>}
                  </td>
                  <td className="px-3 py-2">{tb.street ?? '—'}{tb.currentActor != null && <div className="text-[10px] text-muted">{t('actor')}: {tb.currentActor}</div>}</td>
                  <td className="px-3 py-2 tabular-nums">v{tb.stateVersion}/s{tb.actionSeq}</td>
                  <td className="px-3 py-2 tabular-nums">{tb.potTotal.toLocaleString()}</td>
                  <td className="px-3 py-2">{tb.openIncidents > 0 ? <span className="font-semibold text-red-600">{tb.openIncidents}</span> : <span className="text-muted">0</span>}</td>
                  <td className="px-3 py-2 text-muted">{timeAgo(tb.lastActivityAt ?? tb.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
