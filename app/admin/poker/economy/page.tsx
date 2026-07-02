import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin } from '@/lib/supabase/admin'
import {
  listEconomyConfig,
  publishEconomyConfig,
  activateEconomyConfig,
  rollbackEconomyConfig,
} from '../economy-actions'
import { loadPokerLeaderboard } from '@/app/games/poker/ranking-data'
import ReasonAction from '../_components/ReasonAction'

export const metadata = { title: 'Admin · Poker Economy' }
export const dynamic = 'force-dynamic'

export default async function AdminPokerEconomy() {
  if (!(await checkIsAdmin())) redirect('/')
  const t = await getTranslations('admin_poker')
  const res = await listEconomyConfig()
  const board = await loadPokerLeaderboard(2000)

  const overview = res.ok ? res.overview : { versions: [], activeVersion: null, dbAvailable: false }

  return (
    <div className="max-w-[1000px] mx-auto px-4 sm:px-6 py-8 pb-20 space-y-6">
      <div>
        <Link href="/admin/poker" className="text-[12px] text-rose hover:underline">← {t('overview_title')}</Link>
        <h1 className="font-serif font-bold text-[22px] text-ink mt-1">{t('nav_economy')}</h1>
        <p className="text-[13px] text-muted">{t('economy_sub')}</p>
        {!overview.dbAvailable && (
          <p className="text-[12px] text-amber-700 mt-1">{t('economy_db_unavailable')}</p>
        )}
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="font-serif font-bold text-[16px] text-ink">{t('economy_versions')}</h2>
          <span className="text-[12px] text-muted">
            {t('economy_active')}: <span className="font-mono text-ink">{overview.activeVersion ?? t('economy_no_active')}</span>
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-[12px] min-w-[640px]">
            <thead className="bg-cream text-ink"><tr className="text-left">
              <th className="px-3 py-2 font-bold">{t('economy_version')}</th>
              <th className="px-3 py-2 font-bold">{t('economy_effective')}</th>
              <th className="px-3 py-2 font-bold">{t('economy_valid')}</th>
              <th className="px-3 py-2 font-bold">{t('economy_note')}</th>
              <th className="px-3 py-2 font-bold">{t('economy_actions')}</th>
            </tr></thead>
            <tbody>
              {overview.versions.map((v) => {
                const isActive = v.version === overview.activeVersion
                return (
                  <tr key={v.version} className="border-t border-line align-top">
                    <td className="px-3 py-2 font-mono text-ink">{v.version}{isActive && <span className="ml-2 rounded bg-rose/10 px-1.5 py-0.5 text-[10px] text-rose">{t('economy_active_badge')}</span>}</td>
                    <td className="px-3 py-2 tabular-nums">{v.effectiveFrom}</td>
                    <td className="px-3 py-2">{v.valid ? <span className="text-emerald-700">{t('economy_valid_yes')}</span> : <span className="text-red-600">{t('economy_valid_no')}</span>}</td>
                    <td className="px-3 py-2 text-muted">{v.note}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <ReasonAction small label={t('economy_publish')} action={publishEconomyConfig.bind(null, v.version)} placeholder={t('economy_reason_ph')} />
                        {!isActive && v.valid && (
                          <ReasonAction small label={t('economy_activate')} action={activateEconomyConfig.bind(null, v.version)} placeholder={t('economy_reason_ph')} />
                        )}
                        {!isActive && overview.activeVersion && (
                          <ReasonAction small danger label={t('economy_rollback')} action={rollbackEconomyConfig.bind(null, v.version)} placeholder={t('economy_reason_ph')} />
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted">{t('economy_no_reward_note')}</p>
      </section>

      <section className="space-y-3">
        <h2 className="font-serif font-bold text-[16px] text-ink">{t('economy_leaderboard')}</h2>
        <p className="text-[12px] text-muted">{t('economy_leaderboard_sub', { metric: board.metric })}</p>
        {board.entries.length === 0 ? (
          <p className="text-[12px] text-muted">{t('none')}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-[12px] min-w-[520px]">
              <thead className="bg-cream text-ink"><tr className="text-left">
                <th className="px-3 py-2 font-bold">#</th>
                <th className="px-3 py-2 font-bold">{t('economy_player')}</th>
                <th className="px-3 py-2 font-bold">{t('economy_value')}</th>
                <th className="px-3 py-2 font-bold">{t('economy_hands')}</th>
              </tr></thead>
              <tbody>
                {board.entries.slice(0, 25).map((e) => (
                  <tr key={e.userId} className="border-t border-line">
                    <td className="px-3 py-2 tabular-nums">{e.rank}</td>
                    <td className="px-3 py-2 font-mono">{e.userId.slice(0, 8)}</td>
                    <td className="px-3 py-2 tabular-nums">{e.value.toFixed(2)}</td>
                    <td className="px-3 py-2 tabular-nums">{e.stats.handsPlayed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-muted">{t('economy_coverage_note', { hands: board.coverage.settledHands })}</p>
      </section>
    </div>
  )
}
