'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import type { GroupRow, ScheduleMatch } from '@/lib/tournaments/admin/types'

// Read-only view of the already-generated group schedule, grouped by group → round. No score entry
// here (Prompt 07). "BYE" never appears — the round-robin generator emits no competitor-vs-BYE row.
export default function GroupScheduleView({
  groups,
  schedule,
  nameOf,
}: {
  groups: GroupRow[]
  schedule: ScheduleMatch[]
  nameOf: (competitorId: string | null) => string
}) {
  const t = useTranslations('admin_group_matches')

  const byGroup = useMemo(() => {
    const map = new Map<string, ScheduleMatch[]>()
    for (const m of schedule) {
      const key = m.groupId ?? '__none__'
      const list = map.get(key)
      if (list) list.push(m)
      else map.set(key, [m])
    }
    return map
  }, [schedule])

  if (schedule.length === 0) {
    return (
      <div className="bg-cream border border-line rounded-2xl py-10 px-6 text-center">
        <p className="text-[13px] text-muted">{t('schedule_empty')}</p>
      </div>
    )
  }

  const statusLabel = (s: string) => t(`match_status_${s}`)

  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const matches = (byGroup.get(g.id) ?? []).slice().sort((a, b) =>
          a.roundNumber !== b.roundNumber ? a.roundNumber - b.roundNumber : a.matchNumber - b.matchNumber,
        )
        if (matches.length === 0) return null
        const rounds = new Map<number, ScheduleMatch[]>()
        for (const m of matches) {
          const list = rounds.get(m.roundNumber)
          if (list) list.push(m)
          else rounds.set(m.roundNumber, [m])
        }
        return (
          <div key={g.id} className="border border-line rounded-xl overflow-hidden">
            <div className="bg-cream px-4 py-2 border-b border-line flex items-baseline justify-between gap-2">
              <span className="font-serif font-bold text-[14px] text-ink">
                {t('group', { name: g.name })}
              </span>
              <span className="text-[12px] text-muted">{t('match_total', { count: matches.length })}</span>
            </div>
            <div className="p-3 space-y-2.5">
              {Array.from(rounds.keys())
                .sort((a, b) => a - b)
                .map((rn) => (
                  <div key={rn}>
                    <p className="text-[11.5px] font-semibold text-muted uppercase tracking-wide mb-1">
                      {t('round', { number: rn })}
                    </p>
                    <ul className="space-y-1">
                      {rounds.get(rn)!.map((m) => (
                        <li
                          key={m.id}
                          className="text-[13px] text-ink flex items-center gap-2 bg-cream/60 rounded-lg px-2.5 py-1.5"
                        >
                          <span className="flex-none w-6 text-[11px] font-semibold text-muted">
                            {m.matchNumber}
                          </span>
                          <span className="flex-1 text-right truncate">{nameOf(m.competitorAId)}</span>
                          <span className="flex-none text-[11px] font-semibold text-muted px-1.5">
                            {t('vs')}
                          </span>
                          <span className="flex-1 truncate">{nameOf(m.competitorBId)}</span>
                          <span className="flex-none text-[10.5px] text-muted uppercase tracking-wide">
                            {statusLabel(m.status)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
