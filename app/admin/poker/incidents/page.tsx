import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin } from '@/lib/supabase/admin'
import { loadIncidents, loadActiveRestrictions } from '../data'
import OpenIncidentForm from './OpenIncidentForm'

export const metadata = { title: 'Admin · Poker Incidents' }
export const dynamic = 'force-dynamic'

const STATUSES = ['all', 'OPEN', 'INVESTIGATING', 'RESOLVED', 'REFUNDED', 'DISMISSED'] as const

function fmt(iso: string | null) { return iso ? new Date(iso).toLocaleString('vi-VN') : '—' }

export default async function AdminPokerIncidentsPage({ searchParams }: { searchParams: { status?: string } }) {
  if (!(await checkIsAdmin())) redirect('/')
  const t = await getTranslations('admin_poker')
  const status = (STATUSES as readonly string[]).includes(searchParams.status ?? '') ? searchParams.status! : 'all'
  const [incidents, restrictions] = await Promise.all([loadIncidents(status), loadActiveRestrictions()])

  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 pb-20 space-y-6">
      <div>
        <Link href="/admin/poker" className="text-[12px] text-rose hover:underline">← {t('overview_title')}</Link>
        <h1 className="font-serif font-bold text-[22px] text-ink mt-1">{t('nav_incidents')}</h1>
      </div>

      <OpenIncidentForm />

      <div className="flex flex-wrap gap-2 text-[12px]">
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/poker/incidents?status=${s}`}
            className={`rounded-lg border px-3 py-1 ${status === s ? 'border-rose text-rose font-semibold' : 'border-line text-muted'}`}>
            {s === 'all' ? t('filter_all') : t(`istatus_${s}` as 'istatus_OPEN')}
          </Link>
        ))}
      </div>

      {incidents.length === 0 ? <p className="text-[12px] text-muted">{t('none')}</p> : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-[12px] min-w-[760px]">
            <thead className="bg-cream text-ink"><tr className="text-left">
              <th className="px-3 py-2 font-bold">{t('title')}</th>
              <th className="px-3 py-2 font-bold">{t('col_status')}</th>
              <th className="px-3 py-2 font-bold">{t('severity')}</th>
              <th className="px-3 py-2 font-bold">{t('category')}</th>
              <th className="px-3 py-2 font-bold">{t('opened')}</th>
            </tr></thead>
            <tbody>
              {incidents.map((i) => (
                <tr key={i.id} className="border-t border-line">
                  <td className="px-3 py-2"><Link href={`/admin/poker/incidents/${i.id}`} className="text-rose font-semibold hover:underline">{i.title}</Link></td>
                  <td className="px-3 py-2">{t(`istatus_${i.status}` as 'istatus_OPEN')}</td>
                  <td className="px-3 py-2">{i.severity}</td>
                  <td className="px-3 py-2">{i.category}</td>
                  <td className="px-3 py-2 text-muted">{fmt(i.openedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Active player restrictions */}
      <section>
        <h2 className="font-serif font-bold text-[16px] text-ink mb-2">{t('active_restrictions')}</h2>
        {restrictions.length === 0 ? <p className="text-[12px] text-muted">{t('none')}</p> : (
          <ul className="space-y-1 text-[12px] border border-line rounded-xl divide-y divide-line">
            {restrictions.map((r) => (
              <li key={r.id} className="px-3 py-2">
                <span className="font-mono">{r.userId.slice(0, 8)}</span> · <b>{r.kind}</b> · {r.reason}
                <span className="text-muted"> · {fmt(r.createdAt)}{r.expiresAt && ` → ${fmt(r.expiresAt)}`}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
