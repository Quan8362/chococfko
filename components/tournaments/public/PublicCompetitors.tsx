'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import type { PublicCompetitor } from '@/lib/tournaments/public/types'
import EmptyState from './EmptyState'

// Competitor roster. When the event has groups, competitors are shown grouped; otherwise a flat list
// (with seed when present). Internal ids are never displayed.
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

  const hasGroups = groups.length > 0 && grouped.byGroup.size > 0

  const Chip = ({ c }: { c: PublicCompetitor }) => (
    <li className="flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2">
      <span className="text-[13px] font-medium text-ink truncate">{c.name}</span>
      {c.shortName && c.shortName !== c.name && <span className="text-[11.5px] text-muted truncate">({c.shortName})</span>}
      {typeof c.seed === 'number' && (
        <span className="ml-auto flex-none text-[10.5px] font-bold text-teal bg-teal-soft px-1.5 py-0.5 rounded-md">
          {t('competitors.seed', { n: c.seed })}
        </span>
      )}
    </li>
  )

  if (!hasGroups) {
    return (
      <div>
        <h2 className="font-serif font-bold text-[16px] text-ink mb-3">
          {t('competitors.heading')} <span className="text-muted font-sans font-normal text-[13px]">({competitors.length})</span>
        </h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {competitors.map((c) => (
            <Chip key={c.id} c={c} />
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {groups.map((g) => {
        const members = grouped.byGroup.get(g.id) ?? []
        if (members.length === 0) return null
        return (
          <div key={g.id}>
            <h3 className="text-[13px] font-bold text-teal mb-2">{t('competitors.group', { name: g.name })}</h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {members.map((c) => (
                <Chip key={c.id} c={c} />
              ))}
            </ul>
          </div>
        )
      })}
      {grouped.ungrouped.length > 0 && (
        <div>
          <h3 className="text-[13px] font-bold text-muted mb-2">{t('competitors.ungrouped')}</h3>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {grouped.ungrouped.map((c) => (
              <Chip key={c.id} c={c} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
