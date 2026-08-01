'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import type { PublicCompetitor } from '@/lib/tournaments/public/types'
import EmptyState from './EmptyState'

// Competitor roster. When the event has groups, each group is its OWN card with a vertical member
// list (2 cards per row on desktop, 1 on mobile). Without groups it falls back to a flat card list.
// Internal ids are never displayed.
export default function PublicCompetitors({
  competitors,
  groups,
}: {
  competitors: PublicCompetitor[]
  groups: { id: string; name: string }[]
}) {
  const t = useTranslations('tournaments')

  const grouped = useMemo(() => {
    const byGroup = new Map<string, PublicCompetitor[]>()
    const ungrouped: PublicCompetitor[] = []
    for (const c of competitors) {
      if (c.groupId) {
        const list = byGroup.get(c.groupId)
        if (list) list.push(c)
        else byGroup.set(c.groupId, [c])
      } else ungrouped.push(c)
    }
    return { byGroup, ungrouped }
  }, [competitors])

  if (competitors.length === 0) {
    return <EmptyState title={t('empty.no_competitors')} hint={t('empty.no_competitors_hint')} />
  }

  const hasGroups = groups.length > 0

  // One competitor line inside a group card. Name is primary; short name / unit is muted metadata that
  // may wrap onto the same or the next line. Long Unicode names wrap rather than truncate.
  const CompetitorLine = ({ c }: { c: PublicCompetitor }) => (
    <li className="flex items-start gap-2 py-1">
      <span aria-hidden className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-teal/50" />
      <span className="min-w-0 flex-1 text-[13.5px] leading-snug break-words">
        <span className="font-medium text-ink">{c.name}</span>
        {c.shortName && c.shortName !== c.name && <span className="text-muted"> ({c.shortName})</span>}
      </span>
      {typeof c.seed === 'number' && (
        <span className="flex-none text-[10.5px] font-bold text-teal bg-teal-soft px-1.5 py-0.5 rounded-md">
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
    <section className="rounded-2xl border border-line bg-paper p-4 sm:p-5">
      <div className="flex items-baseline gap-2">
        <h3 className={`text-[15px] font-bold ${muted ? 'text-muted' : 'text-teal'}`}>{title}</h3>
        <span className="text-[12px] text-muted font-medium tabular-nums">{members.length}</span>
      </div>
      <div className="mt-2.5 border-t border-line" />
      {members.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-muted">{t('competitors.empty_group')}</p>
      ) : (
        <ul className="mt-2">
          {members.map((c) => (
            <CompetitorLine key={c.id} c={c} />
          ))}
        </ul>
      )}
    </section>
  )

  if (!hasGroups) {
    return (
      <div>
        <h2 className="font-serif font-bold text-[16px] text-ink mb-3">
          {t('competitors.heading')}{' '}
          <span className="text-muted font-sans font-normal text-[13px]">({competitors.length})</span>
        </h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {competitors.map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2">
              <span className="min-w-0 flex-1 text-[13px] font-medium text-ink break-words">
                {c.name}
                {c.shortName && c.shortName !== c.name && <span className="text-muted font-normal"> ({c.shortName})</span>}
              </span>
              {typeof c.seed === 'number' && (
                <span className="flex-none text-[10.5px] font-bold text-teal bg-teal-soft px-1.5 py-0.5 rounded-md">
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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      {groups.map((g) => (
        <GroupCard key={g.id} title={t('competitors.group', { name: g.name })} members={grouped.byGroup.get(g.id) ?? []} />
      ))}
      {grouped.ungrouped.length > 0 && (
        <GroupCard title={t('competitors.ungrouped')} members={grouped.ungrouped} muted />
      )}
    </div>
  )
}
