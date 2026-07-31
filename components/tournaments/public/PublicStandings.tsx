'use client'

import { useTranslations } from 'next-intl'
import type { PublicGroupStandings, PublicQualification } from '@/lib/tournaments/public/types'
import EmptyState from './EmptyState'

// Per-group standings. Every sporting figure is pre-computed by the pure engine on the server; this
// only renders. Qualification is conveyed with a text/short marker (never colour alone). Ties keep a
// shared rank (marked "="); an organiser-resolved group is labelled "BTC phân định".
export default function PublicStandings({
  standings,
  nameOf,
}: {
  standings: PublicGroupStandings[]
  nameOf: (id: string | null) => string
}) {
  const t = useTranslations('tournaments')

  if (standings.length === 0) {
    return <EmptyState title={t('empty.no_standings')} hint={t('empty.no_standings_hint')} />
  }

  const qualMarker = (q: PublicQualification) => {
    if (q === 'championship')
      return (
        <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-[#3f8f1f]">
          <span aria-hidden="true">▲</span>
          {t('standings.qualified_championship')}
        </span>
      )
    if (q === 'consolation')
      return (
        <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-teal">
          <span aria-hidden="true">◆</span>
          {t('standings.qualified_consolation')}
        </span>
      )
    if (q === 'undetermined')
      return (
        <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-amber-700">
          <span aria-hidden="true">…</span>
          {t('standings.undetermined')}
        </span>
      )
    return null
  }

  return (
    <div className="space-y-6">
      {standings.map((g) => (
        <div key={g.groupId}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="text-[14px] font-bold text-ink">{t('standings.group_heading', { name: g.groupName })}</h3>
            {g.resolvedByOrganizer && (
              <span className="text-[10.5px] font-semibold text-rose bg-rose-soft px-2 py-0.5 rounded-full">
                {t('standings.organizer_resolved')}
              </span>
            )}
          </div>
          <div className="overflow-x-auto rounded-2xl border border-line">
            {/* Points-for / points-against are secondary and hide below md so the table fits a phone
                without page-level horizontal scroll; rank/name/P/W/L/Pts/Diff always stay. */}
            <table className="w-full min-w-[380px] sm:min-w-[440px] text-[12.5px]">
              <thead>
                <tr className="bg-cream text-muted text-[11px] uppercase tracking-wide">
                  <th scope="col" className="text-left font-semibold px-3 py-2 w-10">{t('standings.col_rank')}</th>
                  <th scope="col" className="text-left font-semibold px-3 py-2">{t('standings.col_competitor')}</th>
                  <th scope="col" className="text-center font-semibold px-2 py-2">{t('standings.col_played')}</th>
                  <th scope="col" className="text-center font-semibold px-2 py-2">{t('standings.col_wins')}</th>
                  <th scope="col" className="text-center font-semibold px-2 py-2">{t('standings.col_losses')}</th>
                  <th scope="col" className="text-center font-semibold px-2 py-2">{t('standings.col_points')}</th>
                  <th scope="col" className="hidden md:table-cell text-center font-semibold px-2 py-2">{t('standings.col_points_for')}</th>
                  <th scope="col" className="hidden md:table-cell text-center font-semibold px-2 py-2">{t('standings.col_points_against')}</th>
                  <th scope="col" className="text-center font-semibold px-2 py-2">{t('standings.col_diff')}</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.competitorId} className="border-t border-line">
                    <td className="px-3 py-2 font-bold text-ink tabular-nums">
                      {r.rank}
                      {r.tied && <span className="text-muted font-normal" title={t('standings.tie_marker')}> =</span>}
                    </td>
                    <td className="px-3 py-2 min-w-0">
                      <div className="flex flex-col">
                        <span className="text-ink font-medium break-words">{nameOf(r.competitorId)}</span>
                        {r.qualification !== 'none' && <span className="mt-0.5">{qualMarker(r.qualification)}</span>}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-center tabular-nums text-muted">{r.played}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-ink">{r.wins}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-muted">{r.losses}</td>
                    <td className="px-2 py-2 text-center tabular-nums font-bold text-ink">{r.tablePoints}</td>
                    <td className="hidden md:table-cell px-2 py-2 text-center tabular-nums text-muted">{r.pointsFor}</td>
                    <td className="hidden md:table-cell px-2 py-2 text-center tabular-nums text-muted">{r.pointsAgainst}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-muted">
                      {r.pointDifference > 0 ? `+${r.pointDifference}` : r.pointDifference}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {g.hasUndetermined && (
            <p className="mt-2 text-[11.5px] text-amber-700">{t('standings.undetermined_note')}</p>
          )}
        </div>
      ))}

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted pt-1">
        <span className="inline-flex items-center gap-1"><span aria-hidden="true" className="text-[#3f8f1f]">▲</span>{t('standings.qualified_championship')}</span>
        <span className="inline-flex items-center gap-1"><span aria-hidden="true" className="text-teal">◆</span>{t('standings.qualified_consolation')}</span>
        <span className="inline-flex items-center gap-1"><span aria-hidden="true">=</span>{t('standings.tie_marker')}</span>
      </div>
    </div>
  )
}
