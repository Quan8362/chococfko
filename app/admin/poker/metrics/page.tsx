import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin } from '@/lib/supabase/admin'
import { loadPokerMetrics, type Provenance } from '../metrics-data'
import type { SloStatus, SloVerdict, LatencyStat } from '@/lib/games/poker/metrics'

export const metadata = { title: 'Admin · Poker Metrics' }
export const dynamic = 'force-dynamic'

const STATUS_TONE: Record<SloStatus, string> = {
  ok: 'text-emerald-700', warn: 'text-amber-700', breach: 'text-red-700 font-bold', unknown: 'text-muted',
}
const PROV_TONE: Record<Provenance, string> = {
  measured: 'text-emerald-700', audited: 'text-rose', not_instrumented: 'text-muted',
}

function pct(v: number | null): string {
  return v === null ? '—' : `${(v * 100).toFixed(1)}%`
}
function ms(v: number | null): string {
  return v === null ? '—' : `${v.toLocaleString()}ms`
}
function num(v: number | null): string {
  return v === null ? '—' : v.toLocaleString()
}

export default async function AdminPokerMetrics() {
  if (!(await checkIsAdmin())) redirect('/')
  const t = await getTranslations('admin_poker')
  const view = await loadPokerMetrics()
  const { snapshot: s, coverage } = view
  const days = Math.round(view.windowHours / 24)

  const latencyRows: { key: string; stat: LatencyStat }[] = [
    { key: 'lat_action', stat: s.performance.action },
    { key: 'lat_snapshot', stat: s.performance.snapshot },
    { key: 'lat_settlement', stat: s.performance.settlement },
    { key: 'lat_buyin', stat: s.performance.buyIn },
    { key: 'lat_cashout', stat: s.performance.cashOut },
    { key: 'lat_lobby', stat: s.performance.lobbyQuery },
    { key: 'lat_history', stat: s.performance.handHistory },
  ]

  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 pb-20 space-y-8">
      <div>
        <Link href="/admin/poker" className="text-[12px] text-rose hover:underline">← {t('overview_title')}</Link>
        <div className="flex flex-wrap items-center gap-3 mt-1">
          <h1 className="font-serif font-bold text-[22px] text-ink">{t('nav_metrics')}</h1>
          <span className={`text-[12px] font-bold uppercase ${STATUS_TONE[view.worstStatus]}`}>● {t(`status_${view.worstStatus}` as 'status_ok')}</span>
        </div>
        <p className="text-[13px] text-muted">{t('metrics_sub', { days })}</p>
        {!view.opsAvailable && <p className="text-[12px] text-amber-700 mt-1">{t('alpha_ops_unavailable')}</p>}
      </div>

      {/* Provenance legend */}
      <div className="flex flex-wrap gap-3 text-[11px]">
        <span className={PROV_TONE.measured}>● {t('prov_measured')}</span>
        <span className={PROV_TONE.audited}>● {t('prov_audited')}</span>
        <span className={PROV_TONE.not_instrumented}>● {t('prov_not_instrumented')}</span>
      </div>

      {/* SLOs */}
      <section className="space-y-2">
        <h2 className="font-serif font-bold text-[16px] text-ink">{t('metrics_slo')}</h2>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-[12px] min-w-[560px]">
            <thead className="bg-cream text-ink"><tr className="text-left">
              <th className="px-3 py-2 font-bold">{t('metrics_objective')}</th>
              <th className="px-3 py-2 font-bold">{t('metrics_target')}</th>
              <th className="px-3 py-2 font-bold">{t('metrics_measured')}</th>
              <th className="px-3 py-2 font-bold">{t('metrics_status')}</th>
            </tr></thead>
            <tbody>
              {s.slo.map((v: SloVerdict) => (
                <tr key={v.key} className="border-t border-line">
                  <td className="px-3 py-2">{t(`slo_${v.key}` as 'slo_handCompletionRate')}</td>
                  <td className="px-3 py-2 tabular-nums text-muted">{v.kind === 'min_rate' ? pct(v.target) : v.kind === 'max_latency' ? ms(v.target) : `≤ ${v.target}`}</td>
                  <td className="px-3 py-2 tabular-nums">{v.kind === 'min_rate' ? pct(v.measured) : v.kind === 'max_latency' ? ms(v.measured) : num(v.measured)}</td>
                  <td className={`px-3 py-2 ${STATUS_TONE[v.status]}`}>{t(`status_${v.status}` as 'status_ok')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Coin integrity audit */}
      <section className="space-y-2">
        <h2 className="font-serif font-bold text-[16px] text-ink">{t('metrics_integrity_audit')}</h2>
        <p className="text-[12px] text-muted">{t('metrics_integrity_audit_sub', { checked: view.audit.settlementsChecked })}</p>
        <div className="rounded-xl border border-line p-4">
          <span className={`text-[14px] font-bold ${view.audit.violations === 0 ? 'text-emerald-700' : 'text-red-700'}`}>
            {view.audit.violations === 0 ? t('metrics_integrity_clean') : t('metrics_integrity_violations', { n: view.audit.violations })}
          </span>
          {view.audit.sample.length > 0 && (
            <table className="w-full text-[11px] mt-3">
              <thead className="text-ink"><tr className="text-left">
                <th className="px-2 py-1 font-bold">{t('kind')}</th>
                <th className="px-2 py-1 font-bold">{t('severity')}</th>
                <th className="px-2 py-1 font-bold">{t('col_table')}</th>
                <th className="px-2 py-1 font-bold">{t('detail')}</th>
              </tr></thead>
              <tbody>
                {view.audit.sample.map((v, i) => (
                  <tr key={i} className="border-t border-line align-top">
                    <td className="px-2 py-1 font-mono">{v.code}</td>
                    <td className="px-2 py-1 text-red-700">{v.severity}</td>
                    <td className="px-2 py-1 font-mono">
                      {v.correlation.handId
                        ? <Link href={`/admin/poker/hands/${v.correlation.handId}`} className="text-rose hover:underline">{v.correlation.handId.slice(0, 8)}</Link>
                        : '—'}
                    </td>
                    <td className="px-2 py-1"><pre className="whitespace-pre-wrap font-mono text-muted">{JSON.stringify(v.evidence)}</pre></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Usage */}
      <section className="space-y-2">
        <h2 className="font-serif font-bold text-[16px] text-ink">{t('metrics_usage')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label={t('m_active_players')} value={num(s.usage.activePlayers)} prov={coverage.activePlayers} />
          <Stat label={t('m_active_tables')} value={num(s.usage.activeTables)} prov={coverage.activeTables} />
          <Stat label={t('m_hands_started')} value={num(s.usage.handsStarted)} prov={coverage.handsStarted} />
          <Stat label={t('m_hands_completed')} value={num(s.usage.handsCompleted)} prov={coverage.handsCompleted} />
          <Stat label={t('m_hands_cancelled')} value={num(s.usage.handsCancelled)} prov={coverage.handsCancelled} />
          <Stat label={t('m_avg_hand_dur')} value={ms(s.usage.avgHandDurationMs)} prov={coverage.avgHandDuration} />
          <Stat label={t('m_avg_session_dur')} value={ms(s.usage.avgSessionDurationMs)} prov={coverage.avgSessionDuration} />
        </div>
      </section>

      {/* Reliability */}
      <section className="space-y-2">
        <h2 className="font-serif font-bold text-[16px] text-ink">{t('metrics_reliability')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label={t('m_hand_completion')} value={pct(s.reliability.handCompletionRate)} prov={coverage.handCompletionRate} />
          <Stat label={t('m_action_accept')} value={pct(s.reliability.actionAcceptanceRate)} prov={coverage.actionAcceptanceRate} />
          <Stat label={t('m_action_reject')} value={pct(s.reliability.actionRejectionRate)} prov={coverage.actionAcceptanceRate} />
          <Stat label={t('m_reconnect_success')} value={pct(s.reliability.reconnectSuccessRate)} prov={coverage.reconnectSuccessRate} />
          <Stat label={t('m_realtime_disc')} value={num(s.reliability.realtimeDisconnects)} prov={coverage.realtimeDisconnects} />
          <Stat label={t('m_sequence_gaps')} value={num(s.reliability.sequenceGaps)} prov={coverage.sequenceGaps} />
          <Stat label={t('m_timeouts')} value={num(s.reliability.timeouts)} prov={coverage.timeouts} />
          <Stat label={t('m_frozen_hands')} value={num(s.reliability.frozenHands)} prov={coverage.frozenHands} />
          <Stat label={t('m_settlement_failures')} value={num(s.reliability.settlementFailures)} prov={coverage.settlementFailures} />
        </div>
      </section>

      {/* Performance */}
      <section className="space-y-2">
        <h2 className="font-serif font-bold text-[16px] text-ink">{t('metrics_performance')}</h2>
        <p className="text-[12px] text-muted">{t('metrics_perf_note')}</p>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-[12px] min-w-[480px]">
            <thead className="bg-cream text-ink"><tr className="text-left">
              <th className="px-3 py-2 font-bold">{t('metrics_operation')}</th>
              <th className="px-3 py-2 font-bold">p50</th>
              <th className="px-3 py-2 font-bold">p95</th>
              <th className="px-3 py-2 font-bold">p99</th>
              <th className="px-3 py-2 font-bold">n</th>
            </tr></thead>
            <tbody>
              {latencyRows.map((r) => (
                <tr key={r.key} className="border-t border-line">
                  <td className="px-3 py-2">{t(r.key as 'lat_action')}</td>
                  <td className="px-3 py-2 tabular-nums">{ms(r.stat.p50)}</td>
                  <td className="px-3 py-2 tabular-nums">{ms(r.stat.p95)}</td>
                  <td className="px-3 py-2 tabular-nums">{ms(r.stat.p99)}</td>
                  <td className="px-3 py-2 tabular-nums text-muted">{r.stat.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-[11px] text-muted">{t('metrics_generated_at')}: {new Date(view.generatedAt).toLocaleString('vi-VN')}</p>
    </div>
  )
}

function Stat({ label, value, prov }: { label: string; value: string; prov: Provenance }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="text-[18px] font-bold text-ink tabular-nums">{value}</div>
      <div className={`text-[10px] ${PROV_TONE[prov]}`}>●</div>
    </div>
  )
}
