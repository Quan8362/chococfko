import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin } from '@/lib/supabase/admin'
import { loadHandInspection } from '../../data'
import HandInspector from './HandInspector'

export const metadata = { title: 'Admin · Poker Hand' }
export const dynamic = 'force-dynamic'

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString('vi-VN') : '—'
}

export default async function AdminPokerHandPage({ params }: { params: { handId: string } }) {
  if (!(await checkIsAdmin())) redirect('/')
  const t = await getTranslations('admin_poker')
  const h = await loadHandInspection(params.handId)
  if (!h) notFound()

  const terminal = ['COMPLETED', 'CANCELLED', 'PAUSED_FOR_REVIEW'].includes(h.phase)
  const refundable = h.phase !== 'COMPLETED' && h.phase !== 'CANCELLED'

  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 pb-20 space-y-6">
      <div>
        <Link href={`/admin/poker/${h.tableId}`} className="text-[12px] text-rose hover:underline">← {h.tableName ?? h.tableId.slice(0, 8)}</Link>
        <h1 className="font-serif font-bold text-[22px] text-ink mt-1">{t('hand')} #{h.handNo}</h1>
        <div className="text-[12px] text-muted font-mono">{h.id}</div>
        <div className="flex flex-wrap gap-3 text-[12px] text-ink mt-2">
          <span>{t('phase')}: <b>{h.phase}</b></span>
          <span>{t('col_street')}: <b>{h.street ?? '—'}</b></span>
          <span>{t('col_blinds')}: <b>{h.smallBlind}/{h.bigBlind}</b></span>
          <span>{t('button')}: <b>{h.buttonSeat ?? '—'}</b></span>
          <span>{t('state_version')}: <b>v{h.stateVersion}</b></span>
          <span>{t('col_seq')}: <b>{h.actionSeq}</b></span>
          <span>{t('board')}: <b className="font-mono">{h.board.length ? h.board.join(' ') : '—'}</b></span>
        </div>
        <div className="text-[12px] text-muted mt-1">{t('created')}: {fmt(h.createdAt)} · {t('completed')}: {fmt(h.completedAt)}</div>
      </div>

      {/* Settlement / conservation verification */}
      <section className="rounded-xl border border-line bg-paper p-4 text-[12px]">
        <h2 className="font-serif font-bold text-[16px] text-ink mb-2">{t('settlement')}</h2>
        {h.settlement ? (
          <div className="space-y-1">
            <div>{t('kind')}: <b>{h.settlement.kind}</b> · {t('total_contributed')}: <b className="tabular-nums">{h.settlement.totalContributed.toLocaleString()}</b> · {fmt(h.settlement.settledAt)}</div>
            <div className="flex flex-wrap gap-2">
              {h.settlement.payouts.map((p, i) => (
                <span key={i} className="rounded bg-cream px-2 py-0.5">{t('seat')} {p.seatIndex}: +{p.amount.toLocaleString()}</span>
              ))}
            </div>
            <div className={h.replay.reconciledWithSettlement === false ? 'text-red-600 font-semibold' : 'text-green-700'}>
              {t('reconstructed_pot')}: {h.replay.finalPot.toLocaleString()}
              {h.replay.reconciledWithSettlement === true && ` · ${t('reconciled_ok')}`}
              {h.replay.reconciledWithSettlement === false && ` · ${t('reconciled_mismatch', { delta: h.replay.discrepancy ?? 0 })}`}
            </div>
          </div>
        ) : <p className="text-muted">{t('not_settled')}</p>}
      </section>

      {/* Admin commands + audited reveal + replay (client) */}
      <HandInspector
        tableId={h.tableId}
        handId={h.id}
        terminal={terminal}
        refundable={refundable}
        steps={h.replay.steps}
        actions={h.actions}
        reveal={h.reveal}
      />

      {/* System incident events (engine-written) */}
      {h.systemEvents.length > 0 && (
        <section className="text-[12px]">
          <h2 className="font-serif font-bold text-[16px] text-ink mb-2">{t('system_events')}</h2>
          <ul className="space-y-1 border border-line rounded-xl divide-y divide-line">
            {h.systemEvents.map((e, i) => (
              <li key={i} className="px-3 py-2">
                <span className="font-semibold">{e.kind}</span> <span className="text-muted">· {e.severity} · {fmt(e.createdAt)}</span>
                <pre className="text-[11px] text-muted whitespace-pre-wrap mt-1">{JSON.stringify(e.detail)}</pre>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Linked incident cases */}
      {h.incidents.length > 0 && (
        <section className="text-[12px]">
          <h2 className="font-serif font-bold text-[16px] text-ink mb-2">{t('nav_incidents')}</h2>
          <ul className="space-y-1">
            {h.incidents.map((i) => (
              <li key={i.id}><Link href={`/admin/poker/incidents/${i.id}`} className="text-rose hover:underline">{i.title}</Link> <span className="text-muted">· {t(`istatus_${i.status}` as 'istatus_OPEN')}</span></li>
            ))}
          </ul>
        </section>
      )}

      {/* Audit trail for this hand */}
      {h.audit.length > 0 && (
        <section className="text-[12px]">
          <h2 className="font-serif font-bold text-[16px] text-ink mb-2">{t('audit_trail')}</h2>
          <ul className="space-y-1 border border-line rounded-xl divide-y divide-line">
            {h.audit.map((a) => (
              <li key={a.id} className="px-3 py-2">
                <span className="font-semibold">{a.action}</span> <span className="text-muted">· {a.actorEmail ?? '—'} · {fmt(a.createdAt)}</span>
                <div className="text-muted">{a.reason}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
