'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import type { PublicScheduleMatch } from '@/lib/tournaments/public/types'
import { compareGroupMatches, compareKnockoutMatches } from '@/lib/tournaments/public/scheduleOrder'
import EmptyState from './EmptyState'
import TruncatedName from './TruncatedName'

// Schedule & results. Sections render in one canonical, translation-independent order (see
// scheduleOrder.ts): the group stage (Group A→B→C→D, rounds ascending), then the Serie A knockout in
// full (…→QF→SF→3rd→Final), then the Serie B knockout in full. Group and stage sections are never
// interleaved. BYE and pending matches are shown clearly and never as a fake 0–0 score.
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
  const filtersActive = groupFilter !== 'all' || statusFilter !== 'all'

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

  const groupStage = useMemo(() => filtered.filter((m) => m.stage === 'group'), [filtered])
  const knockout = useMemo(() => filtered.filter((m) => m.stage === 'knockout'), [filtered])

  // Group stage → ordered [groupId → { name, rounds: [roundNumber → matches] }]. The source array is
  // sorted into canonical order FIRST, so the insertion order of every Map already reflects it.
  const groupSections = useMemo(() => {
    const map = new Map<string, { name: string; rounds: Map<number, PublicScheduleMatch[]> }>()
    for (const m of [...groupStage].sort(compareGroupMatches)) {
      const key = m.groupId ?? '—'
      if (!map.has(key)) map.set(key, { name: m.groupName ?? '—', rounds: new Map() })
      const rounds = map.get(key)!.rounds
      const list = rounds.get(m.roundNumber)
      if (list) list.push(m)
      else rounds.set(m.roundNumber, [m])
    }
    return map
  }, [groupStage])

  // Knockout → one Serie (A = championship/main, B = consolation), each an ordered [stageLabel →
  // matches]. Serie A is fully rendered before Serie B; within a Serie, stages ascend to the final.
  const koSeries = useMemo(() => {
    const build = (branch: 'a' | 'b') => {
      const rows = knockout
        .filter((m) => (branch === 'b' ? m.bracket === 'consolation' : m.bracket !== 'consolation'))
        .sort(compareKnockoutMatches)
      const stages = new Map<string, PublicScheduleMatch[]>()
      for (const m of rows) {
        const key = m.roundLabel ?? `r${m.roundNumber}`
        const list = stages.get(key)
        if (list) list.push(m)
        else stages.set(key, [m])
      }
      return { count: rows.length, stages }
    }
    return { a: build('a'), b: build('b') }
  }, [knockout])

  if (schedule.length === 0) {
    return <EmptyState title={t('empty.no_schedule')} hint={t('empty.no_schedule_hint')} />
  }

  const resetFilters = () => {
    setGroupFilter('all')
    setStatusFilter('all')
  }

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2.5">
        {groups.length > 0 && (
          <FilterSelect
            label={t('schedule.filter_group')}
            value={groupFilter}
            onChange={setGroupFilter}
            options={[{ value: 'all', label: t('schedule.all') }, ...groups.map((g) => ({ value: g.id, label: g.name }))]}
          />
        )}
        <FilterSelect
          label={t('schedule.filter_status')}
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'all', label: t('schedule.all') },
            { value: 'completed', label: t('schedule.status_completed') },
            { value: 'upcoming', label: t('schedule.status_upcoming') },
          ]}
        />
        {filtersActive && (
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1 h-[30px] rounded-lg border border-line bg-paper px-2.5 text-[12px] font-medium text-muted transition-colors hover:text-ink hover:border-rose/40 focus:outline-none focus:ring-2 focus:ring-rose/30"
          >
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l8 8M14 6l-8 8" />
            </svg>
            {t('schedule.reset')}
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-cream border border-line rounded-2xl py-10 px-6 text-center">
          <p className="text-[13.5px] font-medium text-ink mb-3">{t('schedule.no_matches')}</p>
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1 rounded-lg bg-rose px-3 py-1.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-rose/40"
          >
            {t('schedule.reset')}
          </button>
        </div>
      ) : (
        <div className="space-y-9">
          {/* ── Phase 1: group stage ── */}
          {groupStage.length > 0 && (
            <PhaseSection title={t('schedule.phase_group')} count={t('schedule.section_count', { n: groupStage.length })}>
              <div className="space-y-6">
                {Array.from(groupSections.entries()).map(([gid, sect]) => (
                  <section key={gid} aria-label={t('schedule.group_label', { name: sect.name })}>
                    <SubHeading>{t('schedule.group_label', { name: sect.name })}</SubHeading>
                    <div className="space-y-3">
                      {Array.from(sect.rounds.entries()).map(([round, matches]) => (
                        <div key={round}>
                          <RoundLabel text={t('schedule.round_label', { n: round })} />
                          <MatchGrid matches={matches} nameOf={nameOf} t={t} />
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </PhaseSection>
          )}

          {/* ── Phase 2: Serie A knockout ── */}
          {koSeries.a.count > 0 && (
            <PhaseSection title={t('bracket.championship')} count={t('schedule.section_count', { n: koSeries.a.count })}>
              <StageSections stages={koSeries.a.stages} nameOf={nameOf} t={t} roundLabelText={roundLabelText} />
            </PhaseSection>
          )}

          {/* ── Phase 3: Serie B knockout ── */}
          {koSeries.b.count > 0 && (
            <PhaseSection title={t('bracket.consolation')} count={t('schedule.section_count', { n: koSeries.b.count })}>
              <StageSections stages={koSeries.b.stages} nameOf={nameOf} t={t} roundLabelText={roundLabelText} />
            </PhaseSection>
          )}
        </div>
      )}
    </div>
  )
}

// ── Layout primitives ──────────────────────────────────────────────────────────────────────────

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="inline-flex items-center gap-1.5 h-[30px] text-[12px] text-muted">
      <span className="font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-[30px] text-[12.5px] border border-line rounded-lg bg-paper pl-2.5 pr-2 text-ink focus:outline-none focus:ring-2 focus:ring-rose/30"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

// Top-level phase band (VÒNG BẢNG / SERIE A / SERIE B): a rose accent, a strong heading, the match
// count, and a thin rule that fills the row — a clear anchor the eye can scan to.
function PhaseSection({ title, count, children }: { title: string; count: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="flex items-center gap-2.5 mb-4">
        <span aria-hidden className="h-5 w-1.5 rounded-full bg-rose" />
        <h2 className="text-[13px] font-extrabold uppercase tracking-wider text-ink">{title}</h2>
        <span className="flex-none text-[11px] font-semibold text-muted tabular-nums">{count}</span>
        <span aria-hidden className="h-px flex-1 bg-line/60" />
      </div>
      {children}
    </section>
  )
}

// Group / knockout-stage sub-heading (Bảng A, Tứ kết …).
function SubHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-[13.5px] font-bold text-teal mb-2.5">
      <span aria-hidden className="h-4 w-1 rounded-full bg-teal/60" />
      {children}
    </h3>
  )
}

// Round label inside a group section (Vòng 1, Vòng 2 …).
function RoundLabel({ text }: { text: string }) {
  return (
    <h4 className="flex items-center gap-2 text-[10.5px] font-semibold text-muted/80 uppercase tracking-wide mb-1.5">
      <span>{text}</span>
      <span aria-hidden className="h-px flex-1 bg-line/60" />
    </h4>
  )
}

// A responsive grid of match cards. Two columns from `sm` up when the section holds ≥2 matches; a
// lone match keeps a sensible max width instead of stretching across the row.
function MatchGrid({
  matches,
  nameOf,
  t,
}: {
  matches: PublicScheduleMatch[]
  nameOf: (id: string | null) => string
  t: (key: string, values?: Record<string, string | number>) => string
}) {
  const single = matches.length === 1
  return (
    <ul className={`grid gap-2.5 ${single ? 'sm:max-w-[calc(50%-0.3125rem)]' : 'sm:grid-cols-2'}`}>
      {matches.map((m) => (
        <MatchCard key={m.id} m={m} nameOf={nameOf} t={t} />
      ))}
    </ul>
  )
}

// The ordered stage subsections (Tứ kết → Bán kết → … → Chung kết) for one Serie.
function StageSections({
  stages,
  nameOf,
  t,
  roundLabelText,
}: {
  stages: Map<string, PublicScheduleMatch[]>
  nameOf: (id: string | null) => string
  t: (key: string, values?: Record<string, string | number>) => string
  roundLabelText: (label: string | null, roundNumber: number) => string
}) {
  return (
    <div className="space-y-5">
      {Array.from(stages.entries()).map(([label, matches]) => {
        const heading = roundLabelText(matches[0]?.roundLabel ?? null, matches[0]?.roundNumber ?? 0)
        return (
          <section key={label} aria-label={heading}>
            <SubHeading>{heading}</SubHeading>
            <MatchGrid matches={matches} nameOf={nameOf} t={t} />
          </section>
        )
      })}
    </div>
  )
}

// ── Match card ─────────────────────────────────────────────────────────────────────────────────

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
      className={`flex-none text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
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

function MatchCard({
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
    <li className="rounded-xl border border-line bg-paper shadow-card px-3.5 py-2.5 transition-shadow hover:shadow-card-hover motion-reduce:transition-none">
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

// One competitor / point-score line for single-game (or pending) matches. The winner's row gets a soft
// teal wash so the result reads at a glance; the score sits in a fixed-width column as the focal number.
// The name truncates to one line (full name via tooltip / aria-label) so a long name never pushes the
// score out of the card.
function CompetitorScoreRow({ name, score, win }: { name: string; score: number | string; win: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 rounded-lg px-1.5 py-0.5 ${win ? 'font-bold text-teal bg-teal-soft/50' : 'text-ink'}`}>
      <WinnerMark show={win} />
      <TruncatedName name={name} className="min-w-0 flex-1 text-[13.5px] leading-snug" />
      <span className="flex-none w-9 text-right text-[17px] font-bold tabular-nums">{score}</span>
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
        <div className="flex items-center gap-1.5 min-w-0">
          <WinnerMark show={win} />
          <TruncatedName name={name} className="min-w-0 leading-snug" />
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
