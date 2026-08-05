'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import type { CompetitorRow, KnockoutMatchView, KnockoutRoundView } from '@/lib/tournaments/admin/types'
import { knockoutScoreView } from '@/lib/tournaments/public/bracketScore'
import TruncatedName from '@/components/tournaments/public/TruncatedName'

// Read-only visual bracket. Each round is a column (desktop); the whole board scrolls horizontally
// on small screens (intentional, with a clear per-round heading — no shrinking text, no clipped
// cards). Semantic HTML/CSS only (no canvas). The final and third-place are visually distinct.
export default function BracketView({
  rounds,
  thirdPlaceMatch,
  competitors,
}: {
  rounds: KnockoutRoundView[]
  thirdPlaceMatch: KnockoutMatchView | null
  competitors: CompetitorRow[]
}) {
  const t = useTranslations('admin_knockout_bracket')
  const nameOf = useMemo(() => {
    const map = new Map(competitors.map((c) => [c.id, c.shortName || c.name]))
    return (id: string | null) => (id ? map.get(id) ?? id : null)
  }, [competitors])

  const roundName = (label: string) => {
    const known = ['final', 'semifinal', 'quarterfinal', 'round_of_16', 'third_place']
    if (known.includes(label)) return t(`label_${label}`)
    const m = /^round_(\d+)$/.exec(label)
    return m ? t('label_generic', { n: m[1] }) : label
  }

  if (rounds.length === 0) {
    return (
      <div className="bg-cream border border-line rounded-2xl py-10 px-6 text-center">
        <p className="text-[13.5px] text-ink font-medium mb-1">{t('empty_title')}</p>
        <p className="text-[12.5px] text-muted">{t('empty_hint')}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-4 min-w-min">
          {rounds.map((round) => (
            <div key={round.roundNumber} className="flex-none w-[220px]">
              <h3 className="text-[12.5px] font-bold text-teal mb-2 px-1">{roundName(round.label)}</h3>
              <div className="flex flex-col justify-around gap-3 h-full">
                {round.matches.map((m) => (
                  <MatchCard key={m.id} match={m} nameOf={nameOf} t={t} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {thirdPlaceMatch && (
        <div className="mt-4 max-w-[240px]">
          <h3 className="text-[12.5px] font-bold text-amber-600 mb-2 px-1">{t('label_third_place')}</h3>
          <MatchCard match={thirdPlaceMatch} nameOf={nameOf} t={t} tone="third" />
        </div>
      )}
    </div>
  )
}

function MatchCard({
  match,
  nameOf,
  t,
  tone = 'normal',
}: {
  match: KnockoutMatchView
  nameOf: (id: string | null) => string | null
  t: (key: string, values?: Record<string, string | number>) => string
  tone?: 'normal' | 'third'
}) {
  const a = nameOf(match.competitorAId)
  const b = nameOf(match.competitorBId)
  const done = match.status === 'completed'
  const isBye = match.status === 'bye'

  // Real stored result → per-side cells + optional per-game detail. A best-of-1 shows its true point
  // score (e.g. 21 / 15), a best-of-N shows sets won plus a "21–15 · 15–21 · 21–18" line. Never the
  // winner=1 / loser=0 tally rendered as a fake "1–0".
  const sc = knockoutScoreView(match)

  // A resolved competitor keeps its name on one line (truncated) with the shared hover/focus tooltip so
  // long vi/en/ja/ko/zh names stay fully readable — identical to the public bracket. A TBD slot is not a
  // real name, so it stays plain (no needless tab stop / tooltip).
  const Side = ({ name, isWinner, score, present }: { name: string | null; isWinner: boolean; score: string | null; present: boolean }) => (
    <div className={`flex items-center justify-between gap-2 px-2.5 py-1.5 ${isWinner ? 'bg-teal-soft' : ''}`}>
      {present && name ? (
        <TruncatedName name={name} className={`min-w-0 flex-1 text-[12.5px] ${isWinner ? 'font-bold text-teal' : 'text-ink'}`} />
      ) : (
        <span className="min-w-0 flex-1 text-[12.5px] truncate text-muted italic">{name ?? t('tbd')}</span>
      )}
      {score !== null && <span className={`flex-none text-[12px] font-bold tabular-nums ${isWinner ? 'text-teal' : 'text-muted'}`}>{score}</span>}
    </div>
  )

  return (
    <div className={`rounded-xl border overflow-hidden ${tone === 'third' ? 'border-amber-200' : 'border-line'} bg-paper`}>
      <Side name={a} present={!!match.competitorAId} isWinner={sc.isWinnerA} score={sc.scoreA} />
      <div className="h-px bg-line" />
      <Side name={b} present={!!match.competitorBId} isWinner={sc.isWinnerB} score={sc.scoreB} />
      {sc.detail && (
        <div className="px-2.5 py-1 border-t border-line bg-paper text-center text-[10.5px] leading-snug text-muted tabular-nums break-words">
          {sc.detail}
        </div>
      )}
      <div className="px-2.5 py-1 border-t border-line bg-cream/60">
        <span className="text-[10.5px] text-muted">
          {isBye ? t('status_bye') : done ? t('status_completed') : match.status === 'ready' ? t('status_ready') : t('status_pending')}
        </span>
      </div>
    </div>
  )
}
