'use client'

import { useTranslations } from 'next-intl'
import type { PublicGroupStandings, PublicQualification } from '@/lib/tournaments/public/types'
import EmptyState from './EmptyState'

// ── Shared column template ──────────────────────────────────────────────────────────────────────
// ONE column-width definition reused by EVERY group table (Bảng A/B/C/D). Combined with
// `table-fixed`, column widths come solely from these tokens on the header row — never from a
// table's own body content — so a longer competitor name, the "Chưa phân định" sub-line, the row
// count, or the locale can never shift the stats columns. Every group therefore lays its columns out
// at the exact same x-positions and widths. The competitor column carries NO width token: it is the
// single flexible column that absorbs the remaining space (names wrap via break-words). Numeric
// widths are sized to hold the widest header (Vietnamese, e.g. "Điểm thắng") on one line; every other
// locale is shorter and fits comfortably.
const COL = {
  rank: 'w-14',
  played: 'w-16',
  wins: 'w-16',
  losses: 'w-16',
  points: 'w-16',
  pointsFor: 'w-24',
  pointsAgainst: 'w-24',
  diff: 'w-20',
} as const

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
    <div className="space-y-7">
      {standings.map((g) => (
        <div key={g.groupId}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="flex items-center gap-2 text-[14px] font-bold text-ink">
              <span aria-hidden className="h-4 w-1 rounded-full bg-rose/60" />
              {t('standings.group_heading', { name: g.groupName })}
            </h3>
            {g.resolvedByOrganizer && (
              <span className="text-[10.5px] font-semibold text-rose bg-rose-soft px-2 py-0.5 rounded-full">
                {t('standings.organizer_resolved')}
              </span>
            )}
          </div>
          <div className="overflow-x-auto rounded-2xl border border-line shadow-card bg-paper">
            {/* table-fixed + the shared COL width tokens on this (identical-per-group) header row give
                every group table one column template, so Bảng A/B/C/D align at the same x-positions
                regardless of content. Competitor is the only width-less (flexible) column and absorbs
                the remainder. Points-for / points-against are secondary and hide below md so the table
                fits a phone without page-level horizontal scroll; the rest always stay and, when the
                viewport is narrow, the table scrolls inside its own overflow-x container above. */}
            <table className="w-full min-w-[560px] sm:min-w-[600px] text-[12.5px] table-fixed">
              {/* Header carries a soft warm-cream tint on the near-white (paper) card so it reads as a
                  distinct band without a heavy fill, and a full-width border-b that is a touch stronger
                  than the lighter per-row dividers below — a clear header → data separation (design §2/§3/§7). */}
              <thead>
                <tr className="bg-cream text-ink/70 text-[11px] uppercase tracking-wide border-b border-line">
                  <th scope="col" className={`text-left font-semibold px-2 py-2.5 ${COL.rank}`}>{t('standings.col_rank')}</th>
                  <th scope="col" className="text-left font-semibold px-3 py-2.5">{t('standings.col_competitor')}</th>
                  <th scope="col" className={`text-center font-semibold px-1 py-2.5 ${COL.played}`}>{t('standings.col_played')}</th>
                  <th scope="col" className={`text-center font-semibold px-1 py-2.5 ${COL.wins}`}>{t('standings.col_wins')}</th>
                  <th scope="col" className={`text-center font-semibold px-1 py-2.5 ${COL.losses}`}>{t('standings.col_losses')}</th>
                  <th scope="col" className={`text-center font-semibold px-1 py-2.5 ${COL.points}`}>{t('standings.col_points')}</th>
                  <th scope="col" className={`hidden md:table-cell text-center font-semibold px-1 py-2.5 ${COL.pointsFor}`}>{t('standings.col_points_for')}</th>
                  <th scope="col" className={`hidden md:table-cell text-center font-semibold px-1 py-2.5 ${COL.pointsAgainst}`}>{t('standings.col_points_against')}</th>
                  <th scope="col" className={`text-center font-semibold px-1 py-2.5 ${COL.diff}`}>{t('standings.col_diff')}</th>
                </tr>
              </thead>
              {/* Row separators are lighter than the header divider so the header stays the strongest
                  horizontal line; a very light warm hover keeps rows scannable without zebra striping. */}
              <tbody className="divide-y divide-line/70">
                {g.rows.map((r) => (
                  <tr
                    key={r.competitorId}
                    className={`transition-colors duration-150 hover:bg-cream/50 ${
                      r.qualification === 'championship'
                        ? 'bg-[#f4faef]'
                        : r.qualification === 'consolation'
                          ? 'bg-teal-soft/30'
                          : ''
                    }`}
                  >
                    <td className="px-2 py-2.5 font-bold text-ink tabular-nums">
                      {r.rank}
                      {r.tied && <span className="text-muted font-normal" title={t('standings.tie_marker')}> =</span>}
                    </td>
                    <td className="px-3 py-2.5 min-w-0">
                      <div className="flex flex-col">
                        <span className="text-ink font-semibold break-words">{nameOf(r.competitorId)}</span>
                        {r.qualification !== 'none' && <span className="mt-0.5">{qualMarker(r.qualification)}</span>}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-center tabular-nums text-muted">{r.played}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums text-ink">{r.wins}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums text-muted">{r.losses}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums font-bold text-ink">{r.tablePoints}</td>
                    <td className="hidden md:table-cell px-2 py-2.5 text-center tabular-nums text-muted">{r.pointsFor}</td>
                    <td className="hidden md:table-cell px-2 py-2.5 text-center tabular-nums text-muted">{r.pointsAgainst}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums text-muted">
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
