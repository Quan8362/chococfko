import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin } from '@/lib/supabase/admin'
import { loadTableDetail } from '../data'
import TableCommands from './TableCommands'

export const metadata = { title: 'Admin · Poker Table' }
export const dynamic = 'force-dynamic'

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString('vi-VN') : '—'
}

export default async function AdminPokerTablePage({ params }: { params: { tableId: string } }) {
  if (!(await checkIsAdmin())) redirect('/')
  const t = await getTranslations('admin_poker')
  const d = await loadTableDetail(params.tableId)
  if (!d) notFound()

  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 pb-20 space-y-6">
      <div>
        <Link href="/admin/poker" className="text-[12px] text-rose hover:underline">← {t('overview_title')}</Link>
        <h1 className="font-serif font-bold text-[22px] text-ink mt-1">{d.name}</h1>
        <div className="text-[12px] text-muted font-mono">{d.id}</div>
        <div className="flex flex-wrap gap-3 text-[12px] text-ink mt-2">
          <span>{t('col_status')}: <b>{t(`tstatus_${d.status}` as 'tstatus_open')}</b>{d.paused && <span className="text-amber-700"> · {t('paused')}</span>}</span>
          <span>{t('col_blinds')}: <b>{d.smallBlind}/{d.bigBlind}</b></span>
          <span>{t('state_version')}: <b>v{d.stateVersion}</b></span>
          <span>{t('col_activity')}: <b>{fmt(d.lastActivityAt)}</b></span>
        </div>
        {d.pausedReason && <div className="text-[12px] text-amber-700 mt-1">{t('paused')}: {d.pausedReason}</div>}
      </div>

      {/* Safe table commands */}
      <TableCommands
        tableId={d.id}
        status={d.status}
        paused={d.paused}
        currentHandId={d.currentHand?.id ?? null}
        currentPhase={d.currentHand?.phase ?? null}
        seats={d.seats.filter((s) => s.userId != null).map((s) => ({ seatIndex: s.seatIndex, label: s.displayName ?? s.userId!.slice(0, 8), status: s.status }))}
      />

      {/* Seats */}
      <section>
        <h2 className="font-serif font-bold text-[16px] text-ink mb-2">{t('seats')}</h2>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-[12px] min-w-[760px]">
            <thead className="bg-cream text-ink"><tr className="text-left">
              <th className="px-3 py-2 font-bold">#</th>
              <th className="px-3 py-2 font-bold">{t('player')}</th>
              <th className="px-3 py-2 font-bold">{t('col_status')}</th>
              <th className="px-3 py-2 font-bold">{t('stack')}</th>
              <th className="px-3 py-2 font-bold">{t('committed')}</th>
              <th className="px-3 py-2 font-bold">{t('connection')}</th>
            </tr></thead>
            <tbody>
              {d.seats.map((s) => (
                <tr key={s.seatIndex} className="border-t border-line">
                  <td className="px-3 py-2 tabular-nums">{s.seatIndex}</td>
                  <td className="px-3 py-2">{s.displayName ?? (s.userId ? <span className="font-mono">{s.userId.slice(0, 8)}</span> : <span className="text-muted">{t('empty_seat')}</span>)}</td>
                  <td className="px-3 py-2">{s.status}{s.allIn && <span className="text-rose"> · all-in</span>}</td>
                  <td className="px-3 py-2 tabular-nums">{s.stack.toLocaleString()}{s.pendingTopup > 0 && <span className="text-muted"> (+{s.pendingTopup})</span>}</td>
                  <td className="px-3 py-2 tabular-nums">{s.committedTotal.toLocaleString()}</td>
                  <td className="px-3 py-2">{s.userId ? (s.connected ? <span className="text-green-700">●</span> : <span className="text-red-600">○</span>) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent hands */}
      <section>
        <h2 className="font-serif font-bold text-[16px] text-ink mb-2">{t('recent_hands')}</h2>
        <div className="flex flex-wrap gap-2">
          {d.recentHands.length === 0 && <span className="text-[12px] text-muted">{t('none')}</span>}
          {d.recentHands.map((h) => (
            <Link key={h.id} href={`/admin/poker/hands/${h.id}`}
              className="rounded-lg border border-line px-3 py-1.5 text-[12px] hover:bg-cream">
              #{h.handNo} <span className="text-muted">{h.phase}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Incidents */}
      <section>
        <h2 className="font-serif font-bold text-[16px] text-ink mb-2">{t('nav_incidents')}</h2>
        {d.incidents.length === 0 ? <p className="text-[12px] text-muted">{t('none')}</p> : (
          <ul className="space-y-1 text-[12px]">
            {d.incidents.map((i) => (
              <li key={i.id}>
                <Link href={`/admin/poker/incidents/${i.id}`} className="text-rose hover:underline">{i.title}</Link>
                <span className="text-muted"> · {t(`istatus_${i.status}` as 'istatus_OPEN')} · {i.severity}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Audit trail */}
      <section>
        <h2 className="font-serif font-bold text-[16px] text-ink mb-2">{t('audit_trail')}</h2>
        {d.audit.length === 0 ? <p className="text-[12px] text-muted">{t('none')}</p> : (
          <ul className="space-y-1 text-[12px] border border-line rounded-xl divide-y divide-line">
            {d.audit.map((a) => (
              <li key={a.id} className="px-3 py-2">
                <span className="font-semibold text-ink">{a.action}</span>
                <span className="text-muted"> · {a.actorEmail ?? '—'} · {fmt(a.createdAt)}</span>
                <div className="text-muted">{a.reason}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
