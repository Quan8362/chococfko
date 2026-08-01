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

// Small non-colour winner cue (a check mark) so the winner is not signalled by colour/weight alone.
function WinnerMark({ show }: { show: boolean }) {
  return (
    <span className="flex-none w-3.5 text-center" aria-hidden={!show}>
      {show ? (
        <svg viewBox="0 0 20 20" className="inline-block h-3 w-3 text-teal" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.3 3.3 6.8-6.8a1 1 0 0 1 1.4 0Z"
            clipRule="evenodd"
          />
        </svg>
      ) : null}
    </span>
  )
}

function StatusBadge({
  status,
  done,
  t,
}: {
  status: string
  done: boolean
  t: (key: string, values?: Record<string, string | number>) => string
}) {
  return (
    <span
      className={`flex-none text-[10.5px] font-semibold px-2 py-0.5 rounded-full border ${
        done
          ? 'text-teal bg-teal-soft border-transparent'
          : status === 'bye'
            ? 'text-amber-700 bg-amber-50 border-amber-200'
            : status === 'cancelled'
              ? 'text-muted bg-cream border-line line-through'
              : status === 'ready'
                ? 'text-teal bg-teal-soft/60 border-teal/20'
                : 'text-[#8a6d1f] bg-gold-light/50 border-gold/30'
      }`}
    >
      {t(`schedule.status_${status}`)}
    </span>
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
  const b = m.isBye ? t('schedule.bye_advances') : m.competitorBId ? nameOf(m.competitorBId) : t('schedule.tbd')
  const aWin = done && m.winnerId != null && m.winnerId === m.competitorAId
  const bWin = done && m.winnerId != null && m.winnerId === m.competitorBId

  const games = m.games
  // A best-of-N result gets a per-game table (V1 V2 … + Set won). One game (or a completed match
  // with no per-game breakdown) collapses to a single point-score column. Not-yet-played shows "–".
  const multiGame = done && games.length > 1

  // Single point score (the played game's points, or the sets-won fallback when there is no per-game
  // breakdown). Never rendered as 0–0 for a match that has not been played.
  const pointA = !done ? '–' : games.length >= 1 ? games[0].scoreA : m.gamesWonA
  const pointB = !done ? '–' : games.length >= 1 ? games[0].scoreB : m.gamesWonB

  return (
    <li className="rounded-xl border border-line bg-paper px-3 py-2.5">
      <div className="flex justify-end mb-1.5">
        <StatusBadge status={m.status} done={done} t={t} />
      </div>

      {multiGame ? (
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-wide text-muted/70">
              <th className="text-left pb-1 pr-2">{t('schedule.col_team')}</th>
              {games.map((g) => (
                <th key={g.gameNumber} className="w-7 text-center pb-1 tabular-nums font-semibold">
                  {t('schedule.game_short', { n: g.gameNumber })}
                </th>
              ))}
              <th className="w-9 text-center pb-1 font-bold text-teal/80">{t('schedule.col_set')}</th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            <ScoreTableRow name={a} games={games} pick={(g) => g.scoreA} setWon={m.gamesWonA} win={aWin} />
            <ScoreTableRow name={b} games={games} pick={(g) => g.scoreB} setWon={m.gamesWonB} win={bWin} />
          </tbody>
        </table>
      ) : (
        <div className="space-y-1">
          <CompetitorScoreRow name={a} score={pointA} win={aWin} />
          <CompetitorScoreRow name={b} score={pointB} win={bWin} />
        </div>
      )}
    </li>
  )
}

// One competitor / point-score line for single-game (or pending) matches.
function CompetitorScoreRow({ name, score, win }: { name: string; score: number | string; win: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 ${win ? 'font-bold text-teal' : 'text-ink'}`}>
      <WinnerMark show={win} />
      <span className="min-w-0 flex-1 text-[13px] leading-snug break-words">{name}</span>
      <span className="flex-none w-10 text-center text-[14px] tabular-nums">{score}</span>
    </div>
  )
}

// One competitor row inside the per-game (best-of-N) results table.
function ScoreTableRow({
  name,
  games,
  pick,
  setWon,
  win,
}: {
  name: string
  games: PublicScheduleMatch['games']
  pick: (g: PublicScheduleMatch['games'][number]) => number
  setWon: number
  win: boolean
}) {
  return (
    <tr className={win ? 'font-bold text-teal' : 'text-ink'}>
      <td className="py-0.5 pr-2 align-middle">
        <div className="flex items-center gap-1.5">
          <WinnerMark show={win} />
          <span className="min-w-0 break-words leading-snug">{name}</span>
        </div>
      </td>
      {games.map((g) => (
        <td key={g.gameNumber} className="py-0.5 text-center tabular-nums align-middle">
          {pick(g)}
        </td>
      ))}
      <td className="py-0.5 text-center tabular-nums font-bold align-middle">{setWon}</td>
    </tr>
  )
}
