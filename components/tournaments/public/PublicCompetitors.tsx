'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import type { PublicCompetitor } from '@/lib/tournaments/public/types'
import { groupCompetitors } from '@/lib/tournaments/public/competitorGroups'
import EmptyState from './EmptyState'
import TruncatedName from './TruncatedName'

// Athlete roster (public "Vận động viên" tab). When the event has groups, each group is its OWN
// premium card — an accent-edged panel with a header, a count pill and a divided list of athlete rows
// (2 cards per row on desktop, 1 on mobile). Without groups it falls back to a flat card list.
// The grouping/order is done by the pure `groupCompetitors` helper; this file is presentation only and
// never parses, reorders or drops a name. Internal ids are never displayed.
export default function PublicCompetitors({
  competitors,
  groups,
}: {
  competitors: PublicCompetitor[]
  groups: { id: string; name: string }[]
}) {
  const t = useTranslations('tournaments')

  const grouped = useMemo(() => groupCompetitors(competitors, groups), [competitors, groups])

  if (competitors.length === 0) {
    return <EmptyState title={t('empty.no_competitors')} hint={t('empty.no_competitors_hint')} />
  }

  const hasGroups = groups.length > 0

  // One athlete row. The ordinal (1..n) gives the list rhythm and quick scanning; it is the row's
  // position, not the code embedded in the admin-entered name. The name stays on one line with an
  // ellipsis + reveal-on-hover/focus tooltip (TruncatedName) so long Vietnamese / CJK names never
  // widen the card. Short name / club is muted secondary metadata; seed is a trailing badge.
  const AthleteRow = ({ c, index }: { c: PublicCompetitor; index: number }) => (
    <li className="group/row flex items-center gap-3 rounded-lg px-1.5 py-2.5 transition-colors hover:bg-cream/70 focus-within:bg-cream/70 motion-reduce:transition-none">
      <span
        aria-hidden
        className="flex-none inline-flex h-6 w-6 items-center justify-center rounded-full bg-cream text-[11px] font-semibold tabular-nums text-muted transition-colors group-hover/row:bg-teal-soft group-hover/row:text-teal group-focus-within/row:bg-teal-soft group-focus-within/row:text-teal motion-reduce:transition-none"
      >
        {index}
      </span>
      <span className="min-w-0 flex-1">
        <TruncatedName name={c.name} className="block text-[13.5px] font-medium text-ink" />
        {c.shortName && c.shortName !== c.name && (
          <span className="block truncate text-[11.5px] text-muted">{c.shortName}</span>
        )}
      </span>
      {typeof c.seed === 'number' && (
        <span className="flex-none rounded-md bg-teal-soft px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums text-teal">
          {t('competitors.seed', { n: c.seed })}
        </span>
      )}
    </li>
  )

  const GroupCard = ({
    title,
    members,
    muted = false,
  }: {
    title: string
    members: PublicCompetitor[]
    muted?: boolean
  }) => (
    <section className="relative overflow-hidden rounded-2xl border border-line bg-paper shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none">
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${muted ? 'bg-line' : 'bg-teal/70'}`} />
      <div className="p-4 pl-5 sm:p-5 sm:pl-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className={`font-serif text-[15px] font-bold ${muted ? 'text-muted' : 'text-teal'}`}>{title}</h3>
          <span className="flex-none rounded-full bg-teal-soft px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-teal">
            {t('competitors.count', { n: members.length })}
          </span>
        </div>
        <div className="mt-3 border-t border-line" />
        {members.length === 0 ? (
          <p className="mt-4 text-[12.5px] text-muted">{t('competitors.empty_group')}</p>
        ) : (
          <ul className="mt-1 divide-y divide-line/50">
            {members.map((c, i) => (
              <AthleteRow key={c.id} c={c} index={i + 1} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )

  // Compact summary line above the roster: heading · N bảng · N vận động viên. Uses data already in
  // hand — no extra query — and stays on one line at every breakpoint (wraps gracefully if narrow).
  const SummaryHeader = ({ showGroups }: { showGroups: boolean }) => (
    <div className="mb-4 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
      <h2 className="font-serif text-[16px] font-bold text-ink">{t('competitors.heading')}</h2>
      {showGroups && (
        <>
          <span aria-hidden className="text-muted/60">·</span>
          <span className="text-[13px] text-muted">{t('competitors.total_groups', { n: grouped.totalGroups })}</span>
        </>
      )}
      <span aria-hidden className="text-muted/60">·</span>
      <span className="text-[13px] text-muted">{t('competitors.total_athletes', { n: grouped.totalCompetitors })}</span>
    </div>
  )

  if (!hasGroups) {
    return (
      <div>
        <SummaryHeader showGroups={false} />
        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {competitors.map((c, i) => (
            <li
              key={c.id}
              className="group/row flex items-center gap-3 rounded-xl border border-line bg-paper px-3 py-2.5 shadow-card transition-colors hover:border-teal/30 focus-within:border-teal/30 motion-reduce:transition-none"
            >
              <span
                aria-hidden
                className="flex-none inline-flex h-6 w-6 items-center justify-center rounded-full bg-cream text-[11px] font-semibold tabular-nums text-muted transition-colors group-hover/row:bg-teal-soft group-hover/row:text-teal group-focus-within/row:bg-teal-soft group-focus-within/row:text-teal motion-reduce:transition-none"
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <TruncatedName name={c.name} className="block text-[13px] font-medium text-ink" />
                {c.shortName && c.shortName !== c.name && (
                  <span className="block truncate text-[11.5px] text-muted">{c.shortName}</span>
                )}
              </span>
              {typeof c.seed === 'number' && (
                <span className="flex-none rounded-md bg-teal-soft px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums text-teal">
                  {t('competitors.seed', { n: c.seed })}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div>
      <SummaryHeader showGroups />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 lg:gap-5">
        {grouped.groups.map((g) => (
          <GroupCard key={g.id} title={t('competitors.group', { name: g.name })} members={g.members} />
        ))}
        {grouped.ungrouped.length > 0 && (
          <GroupCard title={t('competitors.ungrouped')} members={grouped.ungrouped} muted />
        )}
      </div>
    </div>
  )
}
