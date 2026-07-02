import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin } from '@/lib/supabase/admin'
import { loadBetaDashboard } from '../beta-data'

export const metadata = { title: 'Admin · Poker Closed Beta' }
export const dynamic = 'force-dynamic'

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

const STATUS_TONE: Record<string, string> = {
  met: 'text-emerald-700', not_met: 'text-red-700 font-bold', unknown: 'text-muted',
}

export default async function AdminPokerBeta() {
  if (!(await checkIsAdmin())) redirect('/')
  const t = await getTranslations('admin_poker')
  const d = await loadBetaDashboard()
  const f = d.flags

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 pb-20 sm:px-6 space-y-6">
      <div>
        <Link href="/admin/poker" className="text-[12px] text-rose hover:underline">← {t('overview_title')}</Link>
        <h1 className="mt-1 font-serif text-[24px] font-bold text-ink">{t('nav_beta')}</h1>
        <p className="text-[13px] text-muted">{t('beta_sub')}</p>
      </div>

      {/* Stage / flag state */}
      <div className="flex flex-wrap gap-2 text-[11px]">
        {([
          ['POKER_CLOSED_BETA_ENABLED', f.closedBeta], ['POKER_ALPHA_MODE', f.alpha], ['POKER_ENABLED', f.enabled],
          ['POKER_CREATE_TABLE', f.createTable], ['POKER_PUBLIC_LOBBY', f.publicLobby],
          ['POKER_PRIVATE_TABLE', f.privateTable], ['POKER_SPECTATOR', f.spectator],
          ['POKER_BLOCK_NEW_JOINS', f.blockNewJoins],
        ] as Array<[string, boolean]>).map(([name, on]) => (
          <span key={name} className={`rounded-lg border px-2 py-1 font-mono ${on ? 'border-emerald-500 text-emerald-700' : 'border-line text-muted'}`}>
            {name} {on ? 'ON' : 'off'}
          </span>
        ))}
      </div>
      {!f.closedBeta && <p className="rounded-lg bg-cream px-3 py-2 text-[12px] text-muted">{t('beta_not_active')}</p>}
      {f.blockNewJoins && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800">{t('beta_freeze_active')}</p>}

      {/* Cohorts + roster */}
      <div>
        <h2 className="mb-2 text-[13px] font-bold text-ink">
          {t('beta_cohorts')} <span className="font-normal text-muted">({t('beta_roster_total', { n: d.roster.total, active: d.roster.activeTotal })})</span>
        </h2>
        <p className="mb-3 text-[11px] text-muted">{t('beta_manual_advance')}</p>
        <div className="space-y-3">
          {d.cohortOrder.map((c, i) => {
            const gate = d.cohortGates[c]
            const emails = d.roster.cohorts[c]
            return (
              <div key={c} className="rounded-xl border border-line bg-paper p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-md bg-ink px-1.5 py-0.5 text-[10px] font-bold text-paper">{i + 1}</span>
                  <b className="text-[13px] text-ink">{t(`beta_cohort_${c}`)}</b>
                  <span className="text-[11px] text-muted">({emails.length})</span>
                </div>
                {emails.length === 0 ? (
                  <p className="text-[11px] text-muted">{t('beta_cohort_empty')}</p>
                ) : (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {emails.map((e) => {
                      const suspended = d.roster.suspended.includes(e)
                      return (
                        <span key={e} className={`rounded-md px-2 py-1 font-mono text-[11px] ${suspended ? 'bg-red-50 text-red-700 line-through' : 'bg-cream text-ink'}`}>
                          {e}{suspended ? ` · ${t('beta_suspended')}` : ''}
                        </span>
                      )
                    })}
                  </div>
                )}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <div className="text-[11px] font-bold text-ink">{t('beta_entry')}</div>
                    <ul className="ml-4 list-disc text-[11px] text-muted">{gate.entry.map((x, k) => <li key={k}>{x}</li>)}</ul>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-ink">{t('beta_exit')}</div>
                    <ul className="ml-4 list-disc text-[11px] text-muted">{gate.exit.map((x, k) => <li key={k}>{x}</li>)}</ul>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Terms acknowledgement */}
      <div>
        <h2 className="mb-2 text-[13px] font-bold text-ink">{t('beta_terms')}</h2>
        {!d.terms.available && <p className="mb-2 text-[11px] text-muted">{t('beta_terms_unavailable')}</p>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label={t('beta_terms_version')} value={`v${d.terms.currentVersion}`} />
          <Stat label={t('beta_terms_acked')} value={d.terms.ackedCurrent} />
          <Stat label={t('beta_active_testers')} value={d.roster.activeTotal} />
          <Stat label={t('beta_suspended_count')} value={d.roster.suspended.length} tone={d.roster.suspended.length > 0 ? 'text-amber-700' : undefined} />
        </div>
      </div>

      {/* Success criteria — measured, unknowns are "—" (never fabricated) */}
      <div>
        <h2 className="mb-2 text-[13px] font-bold text-ink">{t('beta_success')}</h2>
        {d.success.safetyBreached && (
          <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-[12px] font-bold text-red-700">{t('beta_safety_breached')}</p>
        )}
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[560px] text-[12px]">
            <thead className="bg-cream text-ink"><tr className="text-left">
              <th className="px-3 py-2 font-bold">{t('beta_criterion')}</th>
              <th className="px-3 py-2 font-bold">{t('beta_target')}</th>
              <th className="px-3 py-2 font-bold">{t('beta_actual')}</th>
              <th className="px-3 py-2 font-bold">{t('beta_status')}</th>
            </tr></thead>
            <tbody>
              {d.success.results.map((r) => (
                <tr key={r.key} className="border-t border-line">
                  <td className="px-3 py-2">{t(`beta_crit_${r.key}`)}{r.hard && <span className="ml-1 text-red-700">*</span>}</td>
                  <td className="px-3 py-2 tabular-nums">{r.target}</td>
                  <td className="px-3 py-2 tabular-nums">{r.actual}</td>
                  <td className={`px-3 py-2 ${STATUS_TONE[r.status]}`}>{t(`beta_status_${r.status}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[11px] text-muted">{t('beta_hard_note')}</p>
      </div>

      {/* Feedback by category */}
      <div>
        <h2 className="mb-2 text-[13px] font-bold text-ink">{t('beta_feedback')}</h2>
        {!d.feedback.available ? (
          <p className="rounded-lg border border-dashed border-line bg-paper px-4 py-6 text-center text-[12px] text-muted">{t('alpha_bugs_unavailable')}</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Counts title={t('beta_by_category')} map={d.feedback.byCategory} />
            <div className="rounded-xl border border-line bg-paper p-3">
              <div className="mb-2 text-[12px] font-bold text-ink">{t('beta_open_bugs')}</div>
              <div className="grid grid-cols-2 gap-2">
                <Stat label={t('alpha_bugs_blockers')} value={d.feedback.openBlocker} tone={d.feedback.openBlocker > 0 ? 'text-red-700 font-bold' : 'text-emerald-700'} />
                <Stat label={t('alpha_bugs_major')} value={d.feedback.openMajor} tone={d.feedback.openMajor > 0 ? 'text-amber-700' : undefined} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Safety controls quick reference */}
      <div className="rounded-xl border border-line bg-paper p-3">
        <h2 className="mb-2 text-[13px] font-bold text-ink">{t('beta_safety_controls')}</h2>
        <ul className="ml-4 list-disc space-y-1 text-[12px] text-muted">
          <li>{t('beta_ctl_block_joins')}</li>
          <li>{t('beta_ctl_pause_table')}</li>
          <li>{t('beta_ctl_close_table')}</li>
          <li>{t('beta_ctl_freeze_hand')}</li>
          <li>{t('beta_ctl_suspend')}</li>
          <li>{t('beta_ctl_rollback')}</li>
        </ul>
      </div>

      <p className="text-[11px] text-muted">{t('beta_footer_note')}</p>
    </div>
  )
}
