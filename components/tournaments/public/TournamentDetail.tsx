'use client'

import { useMemo, useState, useCallback, useRef, useEffect, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { eventButtonClass, tabButtonClass, actionButtonClass } from '@/lib/tournaments/public/selectorStyles'
import type {
  PublicEventWorkspace,
  PublicTournamentSummary,
  TournamentPhase,
} from '@/lib/tournaments/public/types'
import { toBracketCompetitors } from '@/lib/tournaments/public/types'
import { formatCapabilities } from '@/lib/tournaments/domain/format-capabilities'
import { TAB_SLUGS } from '@/lib/tournaments/public/tabs'
import PublicBracket from './PublicBracket'
import TournamentShell from '@/components/tournaments/TournamentShell'
import { useTournamentRealtime, type RealtimeSubscription } from '@/components/tournaments/useTournamentRealtime'
import ConnectionIndicator from '@/components/tournaments/ConnectionIndicator'
import StatusPill from './StatusPill'
import ShareButton from './ShareButton'
import PublicOverview from './PublicOverview'
import PublicCompetitors from './PublicCompetitors'
import PublicSchedule from './PublicSchedule'
import PublicStandings from './PublicStandings'
import PublicPodium from './PublicPodium'
import PublicRuleSummary from './PublicRuleSummary'
import EmptyState from './EmptyState'

// TAB_SLUGS + tabFromSlug live in '@/lib/tournaments/public/tabs' (a plain module) so the server route
// can call tabFromSlug; deep links like ?tab=bang-xep-hang&event=<id> restore the exact view on reload.

export default function TournamentDetail({
  summary,
  phase,
  dateRange,
  workspace,
  selectedEventId,
  initialTab,
}: {
  summary: PublicTournamentSummary
  phase: TournamentPhase
  dateRange: string
  workspace: PublicEventWorkspace | null
  selectedEventId: string
  initialTab: string
}) {
  const t = useTranslations('tournaments')
  const tBracket = useTranslations('admin_knockout_bracket')
  const router = useRouter()
  const pathname = usePathname()

  const format = workspace?.event.format
  const availableTabs = useMemo(() => {
    const tabs = ['overview', 'competitors', 'schedule']
    // Tab visibility is driven by the format's capabilities, never by ad-hoc string checks, so a
    // pure round-robin can never surface an empty "Nhánh đấu" and a pure knockout never shows a
    // group-standings tab (see lib/tournaments/domain/format-capabilities).
    const caps = format ? formatCapabilities(format) : null
    if (caps?.needsStandings) tabs.push('standings')
    if (caps?.needsBracket) tabs.push('bracket')
    if (caps?.hasPodium) tabs.push('podium')
    // The rules tab is always available once an event workspace is loaded — it shows the event's
    // public scoring summary, or a "system default rules" notice when there is no snapshot.
    if (workspace) tabs.push('rules')
    return tabs
  }, [format, workspace])

  const [activeTab, setActiveTab] = useState(() => (availableTabs.includes(initialTab) ? initialTab : 'overview'))

  // Switching an event needs fresh server data, so it's a real navigation. We run it inside a
  // transition so the current shell stays mounted and visible instead of the loading fallback flashing
  // in, and so we can highlight the chosen event immediately while the data streams. Busy state is
  // tracked via pendingEventId (see eventSwitching) rather than the transition's isPending, because a
  // tab switch also opens a transition yet must NOT read as busy.
  const [, startTransition] = useTransition()
  // Optimistic selection: the URL/props only reflect the new event after the round-trip, so mirror
  // the pending choice locally to move the highlight the instant a button is clicked. Reconciled back
  // to the server-provided value once the navigation lands.
  const [pendingEventId, setPendingEventId] = useState<string | null>(null)
  useEffect(() => {
    setPendingEventId(null)
  }, [selectedEventId])
  const activeEventId = pendingEventId ?? selectedEventId
  // Only switching EVENTS actually waits on fresh server data. Switching a tab is pure client state
  // (activeTab + already-loaded workspace), so it renders instantly and must never read as "busy".
  const eventSwitching = pendingEventId !== null

  // Build a stable URL that carries event + tab so refresh/share/deep-link keep the view.
  const pushUrl = useCallback(
    (eventId: string, tab: string) => {
      const params = new URLSearchParams()
      if (eventId) params.set('event', eventId)
      params.set('tab', TAB_SLUGS[tab] ?? TAB_SLUGS.overview)
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`, { scroll: false })
      })
    },
    [router, pathname],
  )

  const selectTab = (tab: string) => {
    setActiveTab(tab)
    pushUrl(activeEventId, tab)
  }

  // Switching event needs fresh data → navigate (server reload) and reset to overview. Resetting the
  // tab state to match the pushed URL keeps 'overview' (always a valid tab) selected, so a new event
  // that lacks the previously-open tab can never render a blank panel mid-switch.
  const selectEvent = (eventId: string) => {
    if (eventId === activeEventId) return
    setPendingEventId(eventId)
    setActiveTab('overview')
    pushUrl(eventId, 'overview')
  }

  const nameOf = useMemo(() => {
    const map = new Map((workspace?.competitors ?? []).map((c) => [c.id, c.shortName || c.name]))
    return (id: string | null) => (id ? map.get(id) ?? id : t('schedule.tbd'))
  }, [workspace, t])

  const roundLabelText = useCallback(
    (label: string | null, roundNumber: number) => {
      if (!label) return t('schedule.round_label', { n: roundNumber })
      const known = ['final', 'semifinal', 'quarterfinal', 'round_of_16', 'third_place']
      if (known.includes(label)) return tBracket(`label_${label}`)
      const m = /^round_(\d+)$/.exec(label)
      return m ? tBracket('label_generic', { n: m[1] }) : label
    },
    [t, tBracket],
  )

  // ── Keyboard tablist navigation ──────────────────────────────────────────────────────────────
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const onTabKeyDown = (e: React.KeyboardEvent, idx: number) => {
    let next = -1
    if (e.key === 'ArrowRight') next = (idx + 1) % availableTabs.length
    else if (e.key === 'ArrowLeft') next = (idx - 1 + availableTabs.length) % availableTabs.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = availableTabs.length - 1
    else return
    e.preventDefault()
    const tab = availableTabs[next]
    tabRefs.current[tab]?.focus()
    selectTab(tab)
  }

  const brackets = workspace?.brackets ?? []
  // A branch is only shown once its template exists (hasBracket). Before the group stage finishes the
  // template already carries placeholder slots ("Nhất A", "Thắng trận N") and is rendered — an empty
  // state appears only when there is genuinely no template (design §4/§13).
  const visibleBranches = brackets.filter((b) => b.hasBracket)
  // Two titled sections only when there really are two branches — a pure knockout shows its single
  // bracket with no redundant "Nhánh vô địch" heading.
  const showBranchHeaders = visibleBranches.length > 1

  // ── Realtime: a change made by an admin is delivered as a SIGNAL → refetch the safe read model via
  // router.refresh() (the page is force-dynamic). Payloads are never trusted; bursts are coalesced by
  // the controller. Scoped to THIS tournament + the open event. Disconnect is not a page error — the
  // last data stays, a light poll covers the gap, and it stops when realtime returns.
  const subscriptions = useMemo<RealtimeSubscription[]>(() => {
    const subs: RealtimeSubscription[] = [
      { table: 'tournaments', filter: `id=eq.${summary.id}` },
      { table: 'tournament_events', filter: `tournament_id=eq.${summary.id}` },
      { table: 'tournament_match_games' },
    ]
    if (selectedEventId) {
      // Note: we intentionally do NOT subscribe to tournament_qualification_overrides — Guests have no
      // SELECT on that table (privacy fix), so Realtime would deliver nothing and only add noise. Tie
      // overrides are set alongside the final group result, so the tournament_matches signal already
      // triggers the refetch that surfaces the "BTC phân định" marker.
      subs.push(
        { table: 'tournament_matches', filter: `event_id=eq.${selectedEventId}` },
        { table: 'tournament_podium', filter: `event_id=eq.${selectedEventId}` },
      )
    }
    return subs
  }, [summary.id, selectedEventId])

  const onSignal = useCallback(() => router.refresh(), [router])
  const { status: rtStatus, refreshNow } = useTournamentRealtime({
    channelName: `giai-dau:${summary.id}:${selectedEventId || 'none'}`,
    subscriptions,
    onSignal,
  })

  return (
    <TournamentShell size="wide">
      {/* Positioning context for the decorative illustration below. It only wraps
          the content so the figure can be anchored to the reading column's
          left edge; it adds no padding/margin and does not affect layout. */}
      <div className="relative">
      {/* ── DECORATIVE — badminton duo (male + female). Purely decorative visual
          that fills the large left gutter on wide screens, giving the page a
          sports-event feel while staying premium. Anchored so its right edge sits
          ~16px left of the reading column, extending into the outer gutter; the
          players + rackets already point right toward the content. Shown only
          ≥1600px where the gutter is wide enough to hold it — html/body are
          overflow-x:hidden so it can never create a horizontal scroll. It stays
          in the gutter and never overlaps the header, event selector, tabs, or
          any card/text. */}
      <img
        src="/badminton_player01.webp"
        alt=""
        aria-hidden="true"
        draggable={false}
        loading="lazy"
        decoding="async"
        className="hidden min-[1600px]:block absolute top-[16px] z-0 h-[190px] min-[1720px]:h-[250px] min-[1860px]:h-[330px] min-[2000px]:h-[420px] w-auto object-contain pointer-events-none select-none drop-shadow-[0_20px_30px_rgba(90,55,45,0.12)]"
        style={{ right: "calc(100% + 16px)" }}
      />

      {/* Back link */}
      <Link href="/giai-dau" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-rose transition-colors mb-4">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        {t('public.all_tournaments')}
      </Link>

      {/* Header — title/meta and status/actions split into two zones on desktop, stacked on mobile.
          The right zone is a clean vertical hierarchy: STATUS → ACTIONS → live-sync caption (design §3),
          so the refresh sits inside the action set instead of being marooned beside the status. */}
      <header className="rounded-3xl border border-line shadow-card bg-gradient-to-br from-rose-soft/40 via-paper to-paper p-5 sm:p-6 mb-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
          <div className="min-w-0">
            <h1 className="font-serif font-bold text-[clamp(24px,3.2vw,35px)] leading-[1.14] text-ink break-words">
              {summary.name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] text-muted mt-3">
              <span>{dateRange || t('public.dates_tbd')}</span>
              <span aria-hidden className="text-line">•</span>
              <span>{summary.location || t('public.location_tbd')}</span>
              <span aria-hidden className="text-line">•</span>
              <span>{t('public.events_count', { count: summary.events.length })}</span>
            </div>
          </div>
          <div className="flex flex-col items-start gap-3 lg:items-end lg:flex-none">
            <StatusPill phase={phase} label={t(`status.${phase}`)} />
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              {summary.rulesUrl && (
                <a
                  href={summary.rulesUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className={actionButtonClass(true)}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  {t('public.rules')}
                </a>
              )}
              <ShareButton />
              <button type="button" onClick={() => router.refresh()} className={actionButtonClass()}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                {t('public.refresh')}
              </button>
            </div>
            {/* Live-sync status is a subordinate caption below the actions — never a broadcast-style
                "live" badge among the buttons. It only surfaces a refresh affordance on a dropped link. */}
            <ConnectionIndicator status={rtStatus} onRefresh={refreshNow} />
          </div>
        </div>
      </header>

      {/* Event selector */}
      {summary.events.length > 1 && (
        <div className="mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1.5">{t('public.event_selector')}</p>
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5">
            {summary.events.map((ev) => (
              <button
                key={ev.id}
                type="button"
                onClick={() => selectEvent(ev.id)}
                aria-pressed={ev.id === activeEventId}
                title={ev.name}
                className={eventButtonClass(ev.id === activeEventId)}
              >
                {ev.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {!workspace ? (
        <EmptyState title={t('empty.no_events')} hint={t('empty.no_events_hint')} />
      ) : (
        <>
          {/* Tabs — a horizontal-only scroller. The vertical axis is fully locked so a sideways touch
              swipe can never pan, rubber-band or bounce the strip up/down: overflow-y is hidden,
              overscroll is contained to X, and touch-action:pan-x tells the browser to treat any
              touch here as horizontal panning only (the vertical component falls through to the page,
              so the page still scrolls normally). Height stays constant because both tab states share
              the same box (min-h-[44px] + border-b-2) — see selectorStyles. */}
          <div role="tablist" aria-label={t('public.tabs_label')} className="flex gap-0.5 sm:gap-1 border-b border-line mb-6 overflow-x-auto overflow-y-hidden overscroll-x-contain no-scrollbar [touch-action:pan-x]">
            {availableTabs.map((tab, idx) => (
              <button
                key={tab}
                ref={(el) => {
                  tabRefs.current[tab] = el
                }}
                role="tab"
                id={`tab-${tab}`}
                aria-selected={activeTab === tab}
                aria-controls={`panel-${tab}`}
                tabIndex={activeTab === tab ? 0 : -1}
                onKeyDown={(e) => onTabKeyDown(e, idx)}
                onClick={() => selectTab(tab)}
                className={tabButtonClass(activeTab === tab)}
              >
                {/* The visible label sits over an always-bold, invisible ghost of the same text, so the
                    tab reserves its bold width whether active or not — going bold on select can't widen
                    it and shove the tabs after it sideways. */}
                <span className="grid">
                  <span className="col-start-1 row-start-1">{t(`tabs.${tab}`)}</span>
                  <span aria-hidden className="col-start-1 row-start-1 font-bold invisible">{t(`tabs.${tab}`)}</span>
                </span>
              </button>
            ))}
          </div>

          {/* Panels — tab content is already-loaded client state, so it renders fully opaque on the very
              first frame: NO opacity/blur/transform transition, no skeleton flash. Switching a tab is
              instant. Switching an event is a real navigation; rather than dim the current data we keep
              it fully visible and announce the load through aria-busy + the polite live region below, so
              a switch never flashes or shifts the shell. */}
          {/* Accessible loading announcement for the (event-only) data fetch — no visual dimming. */}
          <span className="sr-only" role="status" aria-live="polite">
            {eventSwitching ? t('public.loading') : ''}
          </span>
          <div
            role="tabpanel"
            id={`panel-${activeTab}`}
            aria-labelledby={`tab-${activeTab}`}
            tabIndex={0}
            aria-busy={eventSwitching}
            className="focus:outline-none"
          >
            {activeTab === 'overview' && (
              <PublicOverview events={summary.events} selectedEventId={selectedEventId} onSelectEvent={selectEvent} />
            )}
            {activeTab === 'competitors' && (
              <PublicCompetitors competitors={workspace.competitors} groups={workspace.groups} />
            )}
            {activeTab === 'schedule' && (
              <PublicSchedule schedule={workspace.schedule} groups={workspace.groups} nameOf={nameOf} roundLabelText={roundLabelText} />
            )}
            {activeTab === 'standings' && <PublicStandings standings={workspace.standings} nameOf={nameOf} />}
            {activeTab === 'bracket' && (
              // The bracket lives INSIDE the reading shell — same horizontal bounds as the hero, tabs
              // and every other panel — so it can never spill past the page edges or push the body into
              // a sideways scroll. `min-w-0` lets this flex/grid child actually shrink to the shell width
              // instead of being forced wider by its content. The board fits all rounds within this width
              // at desktop (each column is flex-1, capped) and scrolls inside its own container below lg.
              <div className="w-full min-w-0 space-y-8">
                {visibleBranches.length === 0 ? (
                  <EmptyState title={t('empty.no_knockout')} hint={t('empty.no_knockout_hint')} />
                ) : (
                  visibleBranches.map((b) => (
                    <section key={b.bracket} aria-labelledby={showBranchHeaders ? `branch-${b.bracket}` : undefined}>
                      {showBranchHeaders && (
                        <div className="mb-4">
                          <h3 id={`branch-${b.bracket}`} className="flex items-center gap-2 font-serif font-bold text-[18px] text-ink">
                            <span aria-hidden className="h-5 w-1.5 rounded-full bg-rose/60" />
                            {t(`bracket.${b.bracket}`)}
                          </h3>
                          <p className="text-[12.5px] text-muted mt-1 ml-3.5">{t(`bracket.${b.bracket}_desc`)}</p>
                        </div>
                      )}
                      <PublicBracket
                        rounds={b.rounds}
                        thirdPlaceMatch={b.thirdPlaceMatch}
                        competitors={toBracketCompetitors(workspace.competitors)}
                      />
                    </section>
                  ))
                )}
              </div>
            )}
            {activeTab === 'podium' && <PublicPodium brackets={brackets} nameOf={nameOf} />}
            {activeTab === 'rules' && <PublicRuleSummary summary={workspace.ruleSummary} />}
          </div>
        </>
      )}
      </div>
    </TournamentShell>
  )
}
