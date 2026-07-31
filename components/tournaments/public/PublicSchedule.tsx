'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { PublicScheduleMatch } from '@/lib/tournaments/public/types'
import EmptyState from './EmptyState'

// Schedule & results. Group-stage matches are grouped by group then round; knockout matches by
// bracket then round. Light filters (group, status). BYE and pending are shown clearly and never as
// a fake 0–0 score.
export default function PublicSchedule({
  schedule,
  groups,
  nameOf,
  roundLabelText,
}: {
  schedule: PublicScheduleMatch[]
  groups: { id: string; name: string }[]
  nameOf: (id: string | null) => string
  roundLabelText: (label: string | null, roundNumber: number) => string
}) {
  const t = useTranslations('tournaments')
  const [groupFilter, setGroupFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filtered = useMemo(() => {
    return schedule.filter((m) => {
      if (groupFilter !== 'all' && m.groupId !== groupFilter) return false
      if (statusFilter !== 'all') {
        if (statusFilter === 'completed' && !(m.status === 'completed' || m.status === 'bye')) return false
        if (statusFilter === 'upcoming' && (m.status === 'completed' || m.status === 'bye' || m.status === 'cancelled')) return false
      }
      return true
    })
  }, [schedule, groupFilter, statusFilter])

  const groupStage = filtered.filter((m) => m.stage === 'group')
  const knockout = filtered.filter((m) => m.stage === 'knockout')

  // group stage → {groupName → {roundNumber → matches}}
  const groupSections = useMemo(() => {
    const map = new Map<string, { name: string; rounds: Map<number, PublicScheduleMatch[]> }>()
    for (const m of groupStage) {
      const key = m.groupId ?? '—'
      if (!map.has(key)) map.set(key, { name: m.groupName ?? '—', rounds: new Map() })
      const sect = map.get(key)!
      const list = sect.rounds.get(m.roundNumber)
      if (list) list.push(m)
      else sect.rounds.set(m.roundNumber, [m])
    }
    return map
  }, [groupStage])

  // knockout → {bracket → {roundLabel → matches}}
  const koSections = useMemo(() => {
    const map = new Map<string, PublicScheduleMatch[]>()
    for (const m of knockout) {
      const key = `${m.bracket ?? 'championship'}::${m.roundLabel ?? `r${m.roundNumber}`}`
      const list = map.get(key)
      if (list) list.push(m)
      else map.set(key, [m])
    }
    return map
  }, [knockout])

  if (schedule.length === 0) {
    return <EmptyState title={t('empty.no_schedule')} hint={t('empty.no_schedule_hint')} />
  }

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {groups.length > 0 && (
          <label className="inline-flex items-center gap-1.5 text-[12px] text-muted">
            <span>{t('schedule.filter_group')}</span>
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="text-[12.5px] border border-line rounded-lg bg-paper px-2 py-1 text-ink focus:outline-none focus:ring-2 focus:ring-rose/30"
            >
              <option value="all">{t('schedule.all')}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="inline-flex items-center gap-1.5 text-[12px] text-muted">
          <span>{t('schedule.filter_status')}</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-[12.5px] border border-line rounded-lg bg-paper px-2 py-1 text-ink focus:outline-none focus:ring-2 focus:ring-rose/30"
          >
            <option value="all">{t('schedule.all')}</option>
            <option value="completed">{t('schedule.status_completed')}</option>
            <option value="upcoming">{t('schedule.status_upcoming')}</option>
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={t('schedule.no_matches')} />
      ) : (
        <>
          {groupStage.length > 0 && (
            <div className="space-y-4">
              {Array.from(groupSections.entries()).map(([gid, sect]) => (
                <div key={gid}>
                  <h3 className="text-[13px] font-bold text-teal mb-2">{t('schedule.group_label', { name: sect.name })}</h3>
                  <div className="space-y-1.5">
                    {Array.from(sect.rounds.entries())
                      .sort((a, b) => a[0] - b[0])
                      .map(([round, matches]) => (
                        <div key={round}>
                          <p className="text-[11px] font-semibold text-muted/80 uppercase tracking-wide mb-1">
                            {t('schedule.round_label', { n: round })}
                          </p>
                          <ul className="grid gap-1.5 lg:grid-cols-2 xl:grid-cols-3">
                            {matches.map((m) => (
                              <MatchRow key={m.id} m={m} nameOf={nameOf} t={t} />
                            ))}
                          </ul>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {knockout.length > 0 && (
            <div className="space-y-3">
              {Array.from(koSections.entries()).map(([key, matches]) => {
                const [bracket, label] = key.split('::')
                const roundNumber = matches[0]?.roundNumber ?? 0
                return (
                  <div key={key}>
                    <h3 className="text-[13px] font-bold text-teal mb-2">
                      {t(`bracket.${bracket}`)} · {roundLabelText(matches[0]?.roundLabel ?? label, roundNumber)}
                    </h3>
                    <ul className="grid gap-1.5 lg:grid-cols-2 xl:grid-cols-3">
                      {matches.map((m) => (
                        <MatchRow key={m.id} m={m} nameOf={nameOf} t={t} />
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function MatchRow({
  m,
  nameOf,
  t,
}: {
  m: PublicScheduleMatch
  nameOf: (id: string | null) => string
  t: (key: string, values?: Record<string, string | number>) => string
}) {
  const done = m.status === 'completed'
  const a = m.competitorAId ? nameOf(m.competitorAId) : t('schedule.tbd')
  const b = m.competitorBId ? nameOf(m.competitorBId) : t('schedule.tbd')
  const statusKey = `schedule.status_${m.status}`

  return (
    <li className="rounded-xl border border-line bg-paper px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className={`flex items-center justify-between gap-2 ${done && m.winnerId === m.competitorAId ? 'font-bold text-teal' : 'text-ink'}`}>
            <span className="text-[13px] truncate">{a}</span>
            {done && <span className="flex-none text-[13px] font-bold tabular-nums">{m.gamesWonA}</span>}
          </div>
          <div className={`flex items-center justify-between gap-2 mt-0.5 ${done && m.winnerId === m.competitorBId ? 'font-bold text-teal' : 'text-ink'}`}>
            <span className="text-[13px] truncate">{m.isBye ? t('schedule.bye_advances') : b}</span>
            {done && <span className="flex-none text-[13px] font-bold tabular-nums">{m.gamesWonB}</span>}
          </div>
        </div>
        <span
          className={`flex-none text-[10.5px] font-semibold px-2 py-0.5 rounded-full border ${
            done
              ? 'text-teal bg-teal-soft border-transparent'
              : m.status === 'bye'
                ? 'text-amber-700 bg-amber-50 border-amber-200'
                : m.status === 'cancelled'
                  ? 'text-muted bg-cream border-line line-through'
                  : 'text-[#8a6d1f] bg-gold-light/50 border-gold/30'
          }`}
        >
          {t(statusKey)}
        </span>
      </div>
      {done && m.games.length > 0 && (
        <p className="mt-1.5 text-[11px] text-muted">
          {t('schedule.game_scores')}:{' '}
          {m.games.map((g) => `${g.scoreA}–${g.scoreB}`).join(', ')}
        </p>
      )}
    </li>
  )
}
