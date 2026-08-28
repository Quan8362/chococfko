'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import type { CompetitorRow, EventFormat, GroupStandingsView, QualificationSlot } from '@/lib/tournaments/admin/types'
import StandingsLegend from './StandingsLegend'

// An abbreviated column header (e.g. "TR") whose spelled-out meaning (e.g. "Trận") is exposed three
// ways: as the accessible name (aria-label) for screen readers, as a native `title` fallback, and as
// a self-contained tooltip that appears on both hover and keyboard focus. The tooltip is absolutely
// positioned so it never widens the column, and it opens downward into the table body so the
// horizontal-scroll container can never clip it. The always-visible StandingsLegend remains the
// primary explanation; this is supplementary.
function AbbrHead({ label, full }: { label: string; full: string }) {
  return (
    <span className="group relative inline-flex items-center justify-center">
      <abbr
        title={full}
        aria-label={full}
        tabIndex={0}
        className="no-underline cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-teal/60"
      >
        {label}
      </abbr>
      <span
        role="tooltip"
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-ink px-2 py-1 text-[11px] font-medium normal-case tracking-normal text-paper opacity-0 shadow-md transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {full}
      </span>
    </span>
  )
}

// "Bảng xếp hạng" tab: one table per group (rank, competitor, played, wins, losses, points, points
// for/against, difference) with the qualification preview marked per row (championship / consolation
// / not qualified / undetermined-by-tie). Shared ranks are shown explicitly for genuine ties. All
// sporting figures are pre-computed by the pure engine — this component only presents them.
export default function StandingsTable({
  standings,
  competitors,
  format,
  winnerQualifiers,
  consolationQualifiers,
}: {
  standings: GroupStandingsView[]
  competitors: CompetitorRow[]
  format: EventFormat
  winnerQualifiers: number
  consolationQualifiers: number
}) {
  const t = useTranslations('admin_group_standings')
  const tq = useTranslations('admin_qualification')

  const nameOf = useMemo(() => {
    const map = new Map(competitors.map((c) => [c.id, c.name]))
    return (id: string) => map.get(id) ?? id
  }, [competitors])

  const isGK = format === 'group_knockout'

  const slotBadge = (slot: QualificationSlot) => {
    if (slot === 'championship')
      return (
        <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-1.5 py-0.5 rounded-full bg-teal-soft text-teal border border-teal/25">
          <span aria-hidden>◆</span> {tq('slot_championship_short')}
        </span>
      )
    if (slot === 'consolation')
      return (
        <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
          <span aria-hidden>▲</span> {tq('slot_consolation_short')}
        </span>
      )
    if (slot === 'undetermined')
      return (
        <span className="inline-flex items-center text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full bg-cream text-muted border border-line">
          {tq('slot_undetermined_short')}
        </span>
      )
    return <span className="text-[10.5px] text-muted">—</span>
  }

  if (standings.length === 0) {
    return (
      <div className="bg-cream border border-line rounded-2xl py-10 px-6 text-center">
        <p className="text-[13px] text-muted">{t('empty')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {isGK && (
        <div className="rounded-lg bg-cream border border-line px-3 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-[12px] text-muted">
            {tq('cuts', { winner: winnerQualifiers, consolation: consolationQualifiers })}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-teal font-semibold">
            <span aria-hidden>◆</span> {tq('slot_championship')}
          </span>
          {consolationQualifiers > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-semibold">
              <span aria-hidden>▲</span> {tq('slot_consolation')}
            </span>
          )}
        </div>
      )}

      <StandingsLegend />

      {standings.map((g) => (
        <div key={g.groupId} className="border border-line rounded-xl overflow-hidden">
          <div className="bg-cream px-4 py-2 border-b border-line flex items-baseline justify-between gap-2">
            <span className="font-serif font-bold text-[14px] text-ink">{t('group', { name: g.groupName })}</span>
            {!g.allCompleted && <span className="text-[11.5px] text-muted">{t('in_progress')}</span>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[560px]">
              <thead>
                <tr className="text-[11px] text-muted uppercase tracking-wide border-b border-line">
                  <th className="text-center font-semibold px-2 py-2 w-10">{t('col_rank')}</th>
                  <th className="text-left font-semibold px-2 py-2">{t('col_competitor')}</th>
                  <th className="text-center font-semibold px-2 py-2 w-10"><AbbrHead label={t('col_played_short')} full={t('col_played')} /></th>
                  <th className="text-center font-semibold px-2 py-2 w-10"><AbbrHead label={t('col_wins_short')} full={t('col_wins')} /></th>
                  <th className="text-center font-semibold px-2 py-2 w-10"><AbbrHead label={t('col_losses_short')} full={t('col_losses')} /></th>
                  <th className="text-center font-semibold px-2 py-2 w-12"><AbbrHead label={t('col_points_short')} full={t('col_points')} /></th>
                  <th className="text-center font-semibold px-2 py-2 w-12"><AbbrHead label={t('col_points_for_short')} full={t('col_points_for')} /></th>
                  <th className="text-center font-semibold px-2 py-2 w-12"><AbbrHead label={t('col_points_against_short')} full={t('col_points_against')} /></th>
                  <th className="text-center font-semibold px-2 py-2 w-12"><AbbrHead label={t('col_diff_short')} full={t('col_diff')} /></th>
                  {isGK && <th className="text-center font-semibold px-2 py-2">{t('col_qualification')}</th>}
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.competitorId} className="border-b border-line/50 last:border-b-0">
                    <td className="text-center px-2 py-2">
                      <span className="font-bold text-ink">{r.rank}</span>
                      {r.tied && (
                        <span className="ml-0.5 text-[10px] text-amber-600" title={t('tied_note')} aria-label={t('tied_note')}>
                          =
                        </span>
                      )}
                    </td>
                    <td className="text-left px-2 py-2 text-ink font-medium truncate max-w-[160px]">
                      {nameOf(r.competitorId)}
                    </td>
                    <td className="text-center px-2 py-2 tabular-nums text-muted">{r.played}</td>
                    <td className="text-center px-2 py-2 tabular-nums text-ink">{r.wins}</td>
                    <td className="text-center px-2 py-2 tabular-nums text-muted">{r.losses}</td>
                    <td className="text-center px-2 py-2 tabular-nums font-bold text-ink">{r.tablePoints}</td>
                    <td className="text-center px-2 py-2 tabular-nums text-muted">{r.pointsFor}</td>
                    <td className="text-center px-2 py-2 tabular-nums text-muted">{r.pointsAgainst}</td>
                    <td className="text-center px-2 py-2 tabular-nums text-ink">
                      {r.pointDifference > 0 ? `+${r.pointDifference}` : r.pointDifference}
                    </td>
                    {isGK && <td className="text-center px-2 py-2">{slotBadge(r.qualification)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {g.hasOverride && (
            <div className="px-4 py-2 border-t border-line bg-teal-soft/40">
              <p className="text-[11.5px] text-teal">
                {tq('resolved_by_organizer')}
                {g.overrideReason ? ` — ${g.overrideReason}` : ''}
              </p>
            </div>
          )}
          {isGK && g.blockingTies.length > 0 && !g.hasOverride && (
            <div className="px-4 py-2 border-t border-line bg-amber-50">
              <p className="text-[11.5px] text-amber-700">{tq('blocked_by_tie')}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
