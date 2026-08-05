'use client'

// Public, read-only knockout bracket. Renders ONE branch (championship or consolation) — the caller
// (TournamentDetail) wraps each branch in its own titled section (design §9). Two presentations:
//   • Desktop (≥1024px) — a MIRRORED bracket: the first rounds fan out on the left and right, every
//     later round steps toward the centre, the final sits in the middle and the third-place match sits
//     just beneath it. Winner-advancement connectors are drawn as an SVG overlay whose coordinates are
//     MEASURED from the real DOM node centres (never hardcoded px), so they stay aligned when a name
//     wraps, the node grows, or the viewport changes. The board scrolls horizontally inside its own
//     container — the page body never scrolls sideways.
//   • Mobile — a per-round view (default) that lists one round's matches vertically, plus a "whole
//     bracket" mode that reuses the mirrored board with horizontal scroll. No browser zoom needed.
//
// All structure (which match feeds which, how rounds split L/R, slot placeholder labels) comes from the
// pure, unit-tested lib/tournaments/domain/bracket-layout — the component only measures and paints.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { CompetitorRow, KnockoutMatchView, KnockoutRoundView } from '@/lib/tournaments/admin/types'
import { mirroredColumns, bracketEdges, feederMap } from '@/lib/tournaments/domain/bracket-layout'
import { knockoutScoreView } from '@/lib/tournaments/public/bracketScore'
import TruncatedName from './TruncatedName'

type BracketT = ReturnType<typeof useTranslations>

function useMinWidth(px: number): boolean {
  const [match, setMatch] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(`(min-width:${px}px)`)
    const on = () => setMatch(mql.matches)
    on()
    mql.addEventListener('change', on)
    return () => mql.removeEventListener('change', on)
  }, [px])
  return match
}

function roundName(t: BracketT, label: string): string {
  const known = ['final', 'semifinal', 'quarterfinal', 'round_of_16', 'third_place']
  if (known.includes(label)) return t(`label_${label}`)
  const m = /^round_(\d+)$/.exec(label)
  return m ? t('label_generic', { n: m[1] }) : label
}

export default function PublicBracket({
  rounds,
  thirdPlaceMatch,
  competitors,
}: {
  rounds: KnockoutRoundView[]
  thirdPlaceMatch: KnockoutMatchView | null
  competitors: CompetitorRow[]
}) {
  const t = useTranslations('admin_knockout_bracket')
  const isDesktop = useMinWidth(1024)
  const [mobileView, setMobileView] = useState<'rounds' | 'full'>('rounds')

  const nameOf = useMemo(() => {
    const map = new Map(competitors.map((c) => [c.id, c.shortName || c.name]))
    return (id: string | null) => (id ? map.get(id) ?? id : null)
  }, [competitors])

  const feeders = useMemo(() => feederMap(rounds), [rounds])

  if (rounds.length === 0) return null

  const showRoundsView = !isDesktop && mobileView === 'rounds'

  return (
    <div>
      {!isDesktop && (
        <div className="flex gap-1.5 mb-3" role="group" aria-label={t('view_mode_label')}>
          {(['rounds', 'full'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setMobileView(v)}
              aria-pressed={mobileView === v}
              className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition-colors min-h-[44px] ${
                mobileView === v ? 'border-teal bg-teal-soft text-teal' : 'border-line bg-paper text-muted hover:text-ink'
              }`}
            >
              {t(v === 'rounds' ? 'view_by_round' : 'view_whole')}
            </button>
          ))}
        </div>
      )}

      {showRoundsView ? (
        <RoundsView rounds={rounds} thirdPlaceMatch={thirdPlaceMatch} nameOf={nameOf} feeders={feeders} t={t} />
      ) : (
        <MirroredView rounds={rounds} thirdPlaceMatch={thirdPlaceMatch} nameOf={nameOf} feeders={feeders} t={t} />
      )}
    </div>
  )
}

// ── Mirrored desktop / whole-bracket board ─────────────────────────────────────────────────────────
function MirroredView({
  rounds,
  thirdPlaceMatch,
  nameOf,
  feeders,
  t,
}: {
  rounds: KnockoutRoundView[]
  thirdPlaceMatch: KnockoutMatchView | null
  nameOf: (id: string | null) => string | null
  feeders: ReturnType<typeof feederMap>
  t: BracketT
}) {
  const columns = useMemo(() => mirroredColumns(rounds), [rounds])
  const edges = useMemo(() => bracketEdges(rounds), [rounds])

  const innerRef = useRef<HTMLDivElement | null>(null)
  const nodeRefs = useRef(new Map<string, HTMLElement>())
  const [paths, setPaths] = useState<string[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })

  const measure = useCallback(() => {
    const inner = innerRef.current
    if (!inner) return
    const base = inner.getBoundingClientRect()
    const next: string[] = []
    for (const e of edges) {
      const fromEl = nodeRefs.current.get(e.from)
      const toEl = nodeRefs.current.get(e.to)
      if (!fromEl || !toEl) continue
      const rf = fromEl.getBoundingClientRect()
      const rt = toEl.getBoundingClientRect()
      const fromCx = rf.left + rf.width / 2 - base.left
      const toCx = rt.left + rt.width / 2 - base.left
      const fromY = rf.top + rf.height / 2 - base.top
      const toY = rt.top + rt.height / 2 - base.top
      // Anchor on the faces pointing at each other (works for the left side, the right side and the
      // centre final identically because it is decided by measured x, not by a hardcoded side).
      const feederLeft = fromCx < toCx
      const fx = (feederLeft ? rf.right : rf.left) - base.left
      const tx = (feederLeft ? rt.left : rt.right) - base.left
      const midX = (fx + tx) / 2
      next.push(`M ${fx.toFixed(1)} ${fromY.toFixed(1)} H ${midX.toFixed(1)} V ${toY.toFixed(1)} H ${tx.toFixed(1)}`)
    }
    setPaths(next)
    setSize({ w: inner.scrollWidth, h: inner.scrollHeight })
  }, [edges])

  const structureKey = useMemo(() => rounds.map((r) => r.matches.map((m) => m.id).join(',')).join('|'), [rounds])

  useLayoutEffect(() => {
    measure()
    const inner = innerRef.current
    if (!inner || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measure())
    ro.observe(inner)
    nodeRefs.current.forEach((n) => ro.observe(n))
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
    // structureKey re-runs the effect when the bracket shape changes (re-registers/observes nodes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, structureKey])

  const register = useCallback((id: string, el: HTMLElement | null) => {
    if (el) nodeRefs.current.set(id, el)
    else nodeRefs.current.delete(id)
  }, [])

  return (
    <div className="overflow-x-auto overflow-y-hidden no-scrollbar pb-3 px-1">
      {/* The board never widens the page: it is a self-contained horizontal-scroll region inside the
          reading shell. Below lg the columns keep a fixed width and the row scrolls horizontally (touch).
          At lg+ the columns become flex-1 and share the shell width, so every round fits on one screen
          with no scrollbar; the row is centred so a small bracket (e.g. Serie A) stays balanced. */}
      <div
        ref={innerRef}
        className="relative flex items-stretch gap-4 lg:gap-[clamp(0.75rem,1.8vw,2.25rem)] min-w-full lg:w-full lg:justify-center"
      >
        {/* Connector overlay — decorative, never intercepts taps on a match card. */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width={size.w || undefined}
          height={size.h || undefined}
          aria-hidden="true"
          focusable="false"
        >
          {paths.map((d, i) => (
            <path key={i} d={d} fill="none" className="stroke-line" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
        </svg>

        {columns.map((col) => (
          <div
            key={col.key}
            className="relative z-10 flex flex-col flex-none w-[220px] min-w-0 lg:flex-1 lg:w-auto lg:min-w-[164px] lg:max-w-[264px]"
          >
            <h4
              className={`text-[11px] font-bold uppercase tracking-[0.06em] mb-2.5 text-center ${
                col.side === 'center' ? 'text-rose' : 'text-teal'
              }`}
            >
              {roundName(t, col.label)}
            </h4>
            <div className="flex-1 flex flex-col justify-around gap-4">
              {col.matches.map((m) => (
                <MatchNode
                  key={m.id}
                  match={m}
                  nameOf={nameOf}
                  feeders={feeders.get(m.id)}
                  t={t}
                  tone={col.side === 'center' ? 'final' : 'normal'}
                  nodeRef={register}
                />
              ))}
            </div>
            {col.side === 'center' && thirdPlaceMatch && (
              <div className="mt-5">
                <h4 className="text-[11px] font-bold uppercase tracking-[0.06em] mb-2.5 text-center text-amber-600">
                  {t('label_third_place')}
                </h4>
                <MatchNode match={thirdPlaceMatch} nameOf={nameOf} feeders={undefined} t={t} tone="third" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Mobile per-round view ──────────────────────────────────────────────────────────────────────────
function RoundsView({
  rounds,
  thirdPlaceMatch,
  nameOf,
  feeders,
  t,
}: {
  rounds: KnockoutRoundView[]
  thirdPlaceMatch: KnockoutMatchView | null
  nameOf: (id: string | null) => string | null
  feeders: ReturnType<typeof feederMap>
  t: BracketT
}) {
  // Round tabs: every round newest-to-final, then the third-place match as its own entry.
  const entries = useMemo(() => {
    const list = rounds.map((r) => ({ key: `r${r.roundNumber}`, label: roundName(t, r.label), matches: r.matches, third: false }))
    if (thirdPlaceMatch) list.push({ key: 'third', label: t('label_third_place'), matches: [thirdPlaceMatch], third: true })
    return list
  }, [rounds, thirdPlaceMatch, t])

  // Default to the final (the last knockout round) — the most interesting stage — but fall back to the
  // first round when nothing is decided yet is equally valid; the final is the conventional landing.
  const [active, setActive] = useState(() => entries[entries.length - (thirdPlaceMatch ? 2 : 1)]?.key ?? entries[0]?.key)
  const current = entries.find((e) => e.key === active) ?? entries[0]

  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1" role="tablist" aria-label={t('view_by_round')}>
        {entries.map((e) => (
          <button
            key={e.key}
            type="button"
            role="tab"
            aria-selected={active === e.key}
            onClick={() => setActive(e.key)}
            className={`flex-none whitespace-nowrap text-[12px] font-semibold px-3 py-2 rounded-lg border transition-colors min-h-[44px] ${
              active === e.key ? 'border-rose bg-rose text-white' : 'border-line bg-paper text-muted hover:text-ink'
            }`}
          >
            {e.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-3 mt-2">
        {current?.matches.map((m) => (
          <MatchNode
            key={m.id}
            match={m}
            nameOf={nameOf}
            feeders={current.third ? undefined : feeders.get(m.id)}
            t={t}
            tone={current.third ? 'third' : 'normal'}
            fullWidth
          />
        ))}
      </div>
    </div>
  )
}

// ── One match node ───────────────────────────────────────────────────────────────────────────────
function MatchNode({
  match,
  nameOf,
  feeders,
  t,
  tone = 'normal',
  fullWidth = false,
  nodeRef,
}: {
  match: KnockoutMatchView
  nameOf: (id: string | null) => string | null
  feeders: { a?: number; b?: number } | undefined
  t: BracketT
  tone?: 'normal' | 'third' | 'final'
  fullWidth?: boolean
  nodeRef?: (id: string, el: HTMLElement | null) => void
}) {
  const done = match.status === 'completed'
  const isBye = match.status === 'bye'

  // A slot shows: the resolved competitor, else "Thắng trận N" (its feeder), else "Chưa xác định".
  // For a BYE the empty side reads "BYE".
  const slotLabel = (present: boolean, feederNo: number | undefined): string => {
    if (present) return '' // real name is rendered separately
    if (isBye) return t('bye')
    if (feederNo != null) return t('winner_of_match', { n: feederNo })
    return t('tbd')
  }

  const aName = nameOf(match.competitorAId)
  const bName = nameOf(match.competitorBId)

  // Real stored result → side cells + optional per-game detail. Never a fabricated winner=1/loser=0.
  const sc = knockoutScoreView(match)

  const statusText = isBye
    ? t('status_bye')
    : done
      ? t('status_completed')
      : match.status === 'ready'
        ? t('status_ready')
        : t('status_pending')

  return (
    <div
      ref={nodeRef ? (el) => nodeRef(match.id, el) : undefined}
      className={`rounded-xl border overflow-hidden bg-paper shadow-card transition-shadow ${
        tone === 'third'
          ? 'border-amber-200'
          : tone === 'final'
            ? 'border-rose/40 ring-1 ring-rose/15 shadow-[0_10px_30px_-14px_rgba(194,24,91,0.35)]'
            : 'border-line'
      } ${fullWidth ? 'w-full' : ''}`}
    >
      <Side
        present={!!match.competitorAId}
        name={aName}
        placeholder={slotLabel(!!match.competitorAId, feeders?.a)}
        isWinner={sc.isWinnerA}
        score={sc.scoreA}
        t={t}
      />
      <div className="h-px bg-line" />
      <Side
        present={!!match.competitorBId}
        name={bName}
        placeholder={slotLabel(!!match.competitorBId, feeders?.b)}
        isWinner={sc.isWinnerB}
        score={sc.scoreB}
        t={t}
      />
      {sc.detail && (
        <div className="px-2.5 py-1 border-t border-line bg-paper text-center text-[10.5px] leading-snug text-muted tabular-nums break-words">
          {sc.detail}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 px-2.5 py-1 border-t border-line bg-cream/60">
        <span className="text-[10px] text-muted tabular-nums">{t('match_no', { n: match.matchNumber })}</span>
        <span className="text-[10.5px] text-muted">{statusText}</span>
      </div>
    </div>
  )
}

function Side({
  present,
  name,
  placeholder,
  isWinner,
  score,
  t,
}: {
  present: boolean
  name: string | null
  placeholder: string
  isWinner: boolean
  score: string | null
  t: BracketT
}) {
  return (
    <div className={`flex items-center gap-2 px-2.5 py-1.5 ${isWinner ? 'bg-teal-soft' : ''}`}>
      {/* Winner marker — NOT colour-only: a check icon carries an accessible label too. */}
      <span className="flex-none w-3.5" aria-hidden={!isWinner}>
        {isWinner && (
          <svg className="w-3.5 h-3.5 text-teal" viewBox="0 0 20 20" fill="currentColor" role="img" aria-label={t('winner_label')}>
            <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 011.4-1.4l2.8 2.8 6.8-6.8a1 1 0 011.4 0z" clipRule="evenodd" />
          </svg>
        )}
      </span>
      {/* A resolved competitor keeps its name on one line (truncated) with a hover/focus tooltip for the
          full name; a placeholder slot ("Thắng trận N" / "BYE") is not a real name so it stays plain. */}
      {present ? (
        <TruncatedName
          name={name ?? ''}
          className={`min-w-0 flex-1 text-[13px] ${isWinner ? 'font-bold text-teal' : 'text-ink'}`}
        />
      ) : (
        <span className="min-w-0 flex-1 text-[13px] truncate text-muted italic">{placeholder}</span>
      )}
      {/* Stable-width score column so numbers align down the node and never collide with the name. */}
      <span className={`flex-none w-7 text-right text-[13.5px] font-extrabold tabular-nums ${isWinner ? 'text-teal' : 'text-muted'}`}>
        {score !== null ? score : ''}
      </span>
    </div>
  )
}
