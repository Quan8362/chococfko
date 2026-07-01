import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin } from '@/lib/supabase/admin'
import { loadOpsEvents } from '../data'
import { OPS_EVENT_KINDS } from '@/lib/games/poker/admin'

export const metadata = { title: 'Admin · Poker Observability' }
export const dynamic = 'force-dynamic'

function fmt(iso: string) { return new Date(iso).toLocaleString('vi-VN') }

const SEV_TONE: Record<string, string> = {
  info: 'text-muted', warn: 'text-amber-700', error: 'text-red-600', critical: 'text-red-700 font-bold',
}

export default async function AdminPokerObservability({ searchParams }: { searchParams: { kind?: string; severity?: string } }) {
  if (!(await checkIsAdmin())) redirect('/')
  const t = await getTranslations('admin_poker')
  const kind = searchParams.kind ?? 'all'
  const severity = searchParams.severity ?? 'all'
  const { rows, countsByKind } = await loadOpsEvents({ kind, severity })

  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 pb-20 space-y-6">
      <div>
        <Link href="/admin/poker" className="text-[12px] text-rose hover:underline">← {t('overview_title')}</Link>
        <h1 className="font-serif font-bold text-[22px] text-ink mt-1">{t('nav_observability')}</h1>
        <p className="text-[13px] text-muted">{t('observability_sub')}</p>
      </div>

      {/* 7-day signal counts */}
      <div className="flex flex-wrap gap-2 text-[12px]">
        {OPS_EVENT_KINDS.map((k) => (
          <Link key={k} href={`/admin/poker/observability?kind=${k}`}
            className={`rounded-lg border px-2 py-1 ${kind === k ? 'border-rose text-rose' : 'border-line'}`}>
            {k} <b className="tabular-nums">{countsByKind[k] ?? 0}</b>
          </Link>
        ))}
        {kind !== 'all' && <Link href="/admin/poker/observability" className="rounded-lg border border-line px-2 py-1 text-muted">{t('filter_all')}</Link>}
      </div>

      {rows.length === 0 ? <p className="text-[12px] text-muted">{t('none')}</p> : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-[12px] min-w-[760px]">
            <thead className="bg-cream text-ink"><tr className="text-left">
              <th className="px-3 py-2 font-bold">{t('when')}</th>
              <th className="px-3 py-2 font-bold">{t('kind')}</th>
              <th className="px-3 py-2 font-bold">{t('severity')}</th>
              <th className="px-3 py-2 font-bold">{t('col_table')}</th>
              <th className="px-3 py-2 font-bold">{t('detail')}</th>
            </tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-t border-line align-top">
                  <td className="px-3 py-2 text-muted whitespace-nowrap">{fmt(e.createdAt)}</td>
                  <td className="px-3 py-2">{e.kind}</td>
                  <td className={`px-3 py-2 ${SEV_TONE[e.severity] ?? ''}`}>{e.severity}</td>
                  <td className="px-3 py-2">
                    {e.tableId ? <Link href={`/admin/poker/${e.tableId}`} className="text-rose hover:underline font-mono">{e.tableId.slice(0, 8)}</Link> : '—'}
                    {e.handId && <Link href={`/admin/poker/hands/${e.handId}`} className="text-rose hover:underline font-mono block">{e.handId.slice(0, 8)}</Link>}
                  </td>
                  <td className="px-3 py-2"><pre className="text-[11px] whitespace-pre-wrap font-mono text-muted">{JSON.stringify(e.detail)}</pre></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
