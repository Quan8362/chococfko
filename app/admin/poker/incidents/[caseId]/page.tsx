import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin } from '@/lib/supabase/admin'
import { loadIncidentDetail } from '../../data'
import IncidentControls from './IncidentControls'

export const metadata = { title: 'Admin · Poker Incident' }
export const dynamic = 'force-dynamic'

function fmt(iso: string | null) { return iso ? new Date(iso).toLocaleString('vi-VN') : '—' }

export default async function AdminPokerIncidentDetail({ params }: { params: { caseId: string } }) {
  if (!(await checkIsAdmin())) redirect('/')
  const t = await getTranslations('admin_poker')
  const c = await loadIncidentDetail(params.caseId)
  if (!c) notFound()

  return (
    <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-8 pb-20 space-y-6">
      <div>
        <Link href="/admin/poker/incidents" className="text-[12px] text-rose hover:underline">← {t('nav_incidents')}</Link>
        <h1 className="font-serif font-bold text-[22px] text-ink mt-1">{c.title}</h1>
        <div className="flex flex-wrap gap-3 text-[12px] text-ink mt-2">
          <span>{t('col_status')}: <b>{t(`istatus_${c.status}` as 'istatus_OPEN')}</b></span>
          <span>{t('severity')}: <b>{c.severity}</b></span>
          <span>{t('category')}: <b>{c.category}</b></span>
          <span>{t('opened')}: <b>{fmt(c.openedAt)}</b></span>
          {c.closedAt && <span>{t('closed')}: <b>{fmt(c.closedAt)}</b></span>}
        </div>
        <div className="flex flex-wrap gap-3 text-[12px] mt-1">
          {c.tableId && <Link href={`/admin/poker/${c.tableId}`} className="text-rose hover:underline">{t('col_table')}: {c.tableId.slice(0, 8)}</Link>}
          {c.handId && <Link href={`/admin/poker/hands/${c.handId}`} className="text-rose hover:underline">{t('hand')}: {c.handId.slice(0, 8)}</Link>}
        </div>
        {c.relatedUserIds.length > 0 && (
          <div className="text-[12px] text-muted mt-1">{t('related_users')}: {c.relatedUserIds.map((u) => u.slice(0, 8)).join(', ')}</div>
        )}
        {c.resolution && <div className="text-[12px] text-ink mt-2 rounded-lg bg-cream px-3 py-2"><b>{t('resolution')}:</b> {c.resolution}</div>}
      </div>

      {Object.keys(c.evidence).length > 0 && (
        <section className="text-[12px]">
          <h2 className="font-serif font-bold text-[16px] text-ink mb-2">{t('evidence')}</h2>
          <pre className="rounded-lg border border-line bg-paper p-3 text-[11px] whitespace-pre-wrap font-mono">{JSON.stringify(c.evidence, null, 2)}</pre>
        </section>
      )}

      <IncidentControls
        caseId={c.id}
        status={c.status}
        handId={c.handId}
        tableId={c.tableId}
        relatedUserIds={c.relatedUserIds}
        restrictions={c.restrictions}
      />

      <section className="text-[12px]">
        <h2 className="font-serif font-bold text-[16px] text-ink mb-2">{t('audit_trail')}</h2>
        {c.audit.length === 0 ? <p className="text-muted">{t('none')}</p> : (
          <ul className="space-y-1 border border-line rounded-xl divide-y divide-line">
            {c.audit.map((a) => (
              <li key={a.id} className="px-3 py-2">
                <span className="font-semibold">{a.action}</span> <span className="text-muted">· {a.actorEmail ?? '—'} · {fmt(a.createdAt)}</span>
                <div className="text-muted">{a.reason}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
