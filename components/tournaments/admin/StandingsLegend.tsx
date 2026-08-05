'use client'

import { useTranslations } from 'next-intl'

// Single source of truth for the standings abbreviation set: each entry pairs a short-label i18n key
// (rendered as the column header, e.g. "TR") with its full-label key (the spelled-out meaning, e.g.
// "Trận"). StandingsTable reuses this list for its per-header tooltips so the legend and the tooltips
// can never drift apart. Management-only — never rendered on the public standings surface, which
// already shows readable column names.
export const STANDINGS_ABBR_KEYS = [
  { short: 'col_played_short', full: 'col_played' },
  { short: 'col_wins_short', full: 'col_wins' },
  { short: 'col_losses_short', full: 'col_losses' },
  { short: 'col_points_short', full: 'col_points' },
  { short: 'col_points_for_short', full: 'col_points_for' },
  { short: 'col_points_against_short', full: 'col_points_against' },
  { short: 'col_diff_short', full: 'col_diff' },
] as const

// A compact, always-visible key explaining the abbreviated standings columns. Shown once above all
// groups (never repeated per Group A/B/C/D). Uses a labelled <dl> so screen readers announce it as a
// term/description group; the abbreviation lives in an <abbr> whose accessible name is the full label,
// so the meaning is conveyed by structure and text, never by colour alone.
export default function StandingsLegend() {
  const t = useTranslations('admin_group_standings')

  return (
    <section
      aria-labelledby="standings-legend-title"
      className="rounded-lg bg-cream/60 border border-line px-3 py-2.5"
    >
      <dl className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] leading-tight">
        <dt
          id="standings-legend-title"
          className="text-[11px] font-semibold uppercase tracking-wide text-muted mr-0.5"
        >
          {t('legend_title')}
        </dt>
        {STANDINGS_ABBR_KEYS.map(({ short, full }, i) => (
          <div key={short} className="inline-flex items-center gap-1.5">
            <dt>
              <abbr
                title={t(full)}
                aria-label={t(full)}
                className="inline-flex items-center justify-center min-w-[1.75rem] px-1 py-0.5 rounded border border-line bg-paper text-[11px] font-bold text-ink no-underline tabular-nums"
              >
                {t(short)}
              </abbr>
            </dt>
            <dd className="text-muted">
              {t(full)}
              {i < STANDINGS_ABBR_KEYS.length - 1 && <span aria-hidden className="ml-3 text-line">·</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
