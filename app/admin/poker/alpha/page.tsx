import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin } from '@/lib/supabase/admin'
import { loadAlphaDashboard } from '../alpha-data'

export const metadata = { title: 'Admin · Poker Alpha' }
export const dynamic = 'force-dynamic'

function fmt(iso: string) { return new Date(iso).toLocaleString('vi-VN') }

const SEV_TONE: Record<string, string> = {
  blocker: 'text-red-700 font-bold', major: 'text-amber-700', minor: 'text-muted', cosmetic: 'text-muted',
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-paper px-3 py-3">
      <div className={`text-[20px] font-bold tabular-nums ${tone ?? 'text-ink'}`}>{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  )
}

function Counts({ title, map }: { title: string; map: Record<string, number> }) {
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1])
  return (
    <div className="rounded-xl border border-line bg-paper p-3">
      <div className="mb-2 text-[12px] font-bold text-ink">{title}</div>
      {entries.length === 0 ? <div className="text-[11px] text-muted">—</div> : (
        <ul className="space-y-1">
          {entries.map(([k, v]) => (
            <li key={k} className="flex items-center justify-between text-[12px]">
              <span className="truncate text-muted">{k}</span>
              <b className="tabular-nums">{v}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default async function AdminPokerAlpha() {
  if (!(await checkIsAdmin())) redirect('/')
  const t = await getTranslations('admin_poker')
  const d = await loadAlphaDashboard()
  const f = d.flags
  const ig = d.integrity

  // Exit-blocker style integrity flags — any non-zero is a red flag for advancing the Alpha.
  const blockers: Array<{ label: string; n: number }> = [
    { label: t('alpha_coin_conservation'), n: ig.coinConservationFailures },
    { label: t('alpha_settlement_failures'), n: ig.settlementFailures },
    { label: t('alpha_sequence_gaps'), n: ig.sequenceGaps },
    { label: t('alpha_duplicate_actions'), n: ig.duplicateActions },
    { label: t('alpha_frozen_hands'), n: ig.frozenHands },
    { label: t('alpha_rls_denials'), n: ig.rlsDenials },
  ]

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 pb-20 sm:px-6 space-y-6">
      <div>
        <Link href="/admin/poker" className="text-[12px] text-rose hover:underline">← {t('overview_title')}</Link>
        <h1 className="mt-1 font-serif text-[24px] font-bold text-ink">{t('nav_alpha')}</h1>
        <p className="text-[13px] text-muted">{t('alpha_sub')}</p>
      </div>

      {/* Flag state banner */}
      <div className="flex flex-wrap gap-2 text-[11px]">
        {([
          ['POKER_ALPHA_MODE', f.alpha], ['POKER_ENABLED', f.enabled],
          ['POKER_CREATE_TABLE', f.createTable], ['POKER_PUBLIC_LOBBY', f.publicLobby],
          ['POKER_PRIVATE_TABLE', f.privateTable], ['POKER_SPECTATOR', f.spectator],
          ['POKER_BLOCK_NEW_JOINS', f.blockNewJoins],
        ] as Array<[string, boolean]>).map(([name, on]) => (
          <span key={name} className={`rounded-lg border px-2 py-1 font-mono ${on ? 'border-emerald-500 text-emerald-700' : 'border-line text-muted'}`}>
            {name} {on ? 'ON' : 'off'}
          </span>
        ))}
      </div>
      {f.blockNewJoins && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800">{t('alpha_freeze_active')}</p>}

      {/* Testers */}
      <div className="rounded-xl border border-line bg-paper p-3">
        <div className="mb-2 text-[12px] font-bold text-ink">{t('alpha_testers')} <span className="text-muted">({d.testers.length})</span></div>
        {d.testers.length === 0 ? (
          <p className="text-[12px] text-muted">{t('alpha_no_testers')}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {d.testers.map((e) => <span key={e} className="rounded-md bg-cream px-2 py-1 font-mono text-[11px] text-ink">{e}</span>)}
          </div>
        )}
      </div>

      {/* Session throughput */}
      <div>
        <h2 className="mb-2 text-[13px] font-bold text-ink">{t('alpha_session_metrics')}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label={t('alpha_active_tables')} value={d.session.activeTables} />
          <Stat label={t('alpha_seated_players')} value={d.session.seatedPlayers} />
          <Stat label={t('alpha_completed_hands')} value={d.session.completedHands} />
          <Stat label={t('alpha_all_in_hands')} value={d.session.allInHands} />
          <Stat label={t('alpha_side_pot_hands')} value={d.session.sidePotHands} />
          <Stat label={t('alpha_total_hands')} value={d.session.totalHands} />
          <Stat label={t('alpha_cancelled_hands')} value={d.session.cancelledHands} tone={d.session.cancelledHands > 0 ? 'text-amber-700' : undefined} />
          <Stat label={t('alpha_timeout_actions')} value={d.session.timeoutActions} />
          <Stat label={t('alpha_reconnect_failures')} value={ig.reconnectFailures} />
          <Stat label={t('alpha_failed_actions')} value={ig.failedActions} />
        </div>
      </div>

      {/* Integrity / exit blockers */}
      <div>
        <h2 className="mb-2 text-[13px] font-bold text-ink">{t('alpha_integrity')} <span className="font-normal text-muted">({t('alpha_last_7d')})</span></h2>
        {!ig.available && <p className="mb-2 text-[11px] text-muted">{t('alpha_ops_unavailable')}</p>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {blockers.map((b) => (
            <Stat key={b.label} label={b.label} value={b.n} tone={b.n > 0 ? 'text-red-700 font-bold' : 'text-emerald-700'} />
          ))}
        </div>
      </div>

      {/* Bug reports */}
      <div>
        <h2 className="mb-2 text-[13px] font-bold text-ink">{t('alpha_bug_reports')}</h2>
        {!d.bugs.available ? (
          <p className="rounded-lg border border-dashed border-line bg-paper px-4 py-6 text-center text-[12px] text-muted">{t('alpha_bugs_unavailable')}</p>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label={t('alpha_bugs_total')} value={d.bugs.total} />
              <Stat label={t('alpha_bugs_open')} value={d.bugs.open} tone={d.bugs.open > 0 ? 'text-amber-700' : undefined} />
              <Stat label={t('alpha_bugs_blockers')} value={d.bugs.bySeverity['blocker'] ?? 0} tone={(d.bugs.bySeverity['blocker'] ?? 0) > 0 ? 'text-red-700 font-bold' : undefined} />
              <Stat label={t('alpha_bugs_major')} value={d.bugs.bySeverity['major'] ?? 0} />
            </div>
            <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Counts title={t('alpha_by_severity')} map={d.bugs.bySeverity} />
              <Counts title={t('alpha_by_device')} map={d.bugs.byDeviceClass} />
              <Counts title={t('alpha_by_browser')} map={d.bugs.byBrowser} />
              <Counts title={t('alpha_by_phase')} map={d.bugs.byPhase} />
            </div>

            <h3 className="mb-2 text-[12px] font-bold text-ink">{t('alpha_open_reports')}</h3>
            {d.bugs.recentOpen.length === 0 ? (
              <p className="text-[12px] text-muted">{t('alpha_no_open_reports')}</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[820px] text-[12px]">
                  <thead className="bg-cream text-ink"><tr className="text-left">
                    <th className="px-3 py-2 font-bold">{t('when')}</th>
                    <th className="px-3 py-2 font-bold">{t('alpha_col_severity')}</th>
                    <th className="px-3 py-2 font-bold">{t('alpha_col_status')}</th>
                    <th className="px-3 py-2 font-bold">{t('alpha_col_where')}</th>
                    <th className="px-3 py-2 font-bold">{t('alpha_col_device')}</th>
                    <th className="px-3 py-2 font-bold">{t('alpha_col_desc')}</th>
                  </tr></thead>
                  <tbody>
                    {d.bugs.recentOpen.map((b) => (
                      <tr key={b.id} className="border-t border-line align-top">
                        <td className="whitespace-nowrap px-3 py-2 text-muted">{fmt(b.createdAt)}</td>
                        <td className={`px-3 py-2 ${SEV_TONE[b.severity] ?? ''}`}>{b.severity}</td>
                        <td className="px-3 py-2">{b.status}</td>
                        <td className="px-3 py-2">
                          {b.tableId ? <Link href={`/admin/poker/${b.tableId}`} className="font-mono text-rose hover:underline">{b.tableId.slice(0, 8)}</Link> : '—'}
                          {b.handId && <Link href={`/admin/poker/hands/${b.handId}`} className="block font-mono text-rose hover:underline">{b.handId.slice(0, 8)}</Link>}
                          {(b.street || b.phase) && <div className="text-[10px] text-muted">{b.street ?? ''} {b.phase ?? ''}</div>}
                          {b.errorCode && <div className="text-[10px] text-red-600">{b.errorCode}</div>}
                        </td>
                        <td className="px-3 py-2 text-muted">{b.deviceClass ?? '—'}<div className="text-[10px]">{b.browser ?? ''} {b.os ?? ''}</div></td>
                        <td className="px-3 py-2"><span className="line-clamp-2">{b.description}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
